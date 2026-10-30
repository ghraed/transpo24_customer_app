import { beforeEach, expect, it, jest } from '@jest/globals';
import { initStripe } from '@stripe/stripe-react-native';
import { withStripeAccount } from './stripe-account';

jest.mock('@stripe/stripe-react-native', () => ({ initStripe: jest.fn(async () => {}) }));
jest.mock('./stripe-config', () => ({ getStripePublishableKey: () => 'pk_test_fixture' }));
beforeEach(() => { jest.clearAllMocks(); });

it('uses the payment’s pinned account and restores platform context afterward', async () => {
  await expect(withStripeAccount('acct_snapshot', async () => 'approved')).resolves.toBe('approved');
  expect(initStripe).toHaveBeenNthCalledWith(1, expect.objectContaining({ stripeAccountId: 'acct_snapshot' }));
  expect(initStripe).toHaveBeenNthCalledWith(2, expect.objectContaining({ stripeAccountId: undefined }));
});

it('restores context after authentication failure and lets the next payment proceed', async () => {
  await expect(withStripeAccount('acct_one', async () => { throw new Error('approval failed'); })).rejects.toThrow('approval failed');
  await expect(withStripeAccount('acct_two', async () => 'approved')).resolves.toBe('approved');
  expect(initStripe).toHaveBeenNthCalledWith(2, expect.objectContaining({ stripeAccountId: undefined }));
  expect(initStripe).toHaveBeenNthCalledWith(3, expect.objectContaining({ stripeAccountId: 'acct_two' }));
});

it('serializes simultaneous actions so a second account cannot replace active bank authentication', async () => {
  let finish!: () => void;
  const active = new Promise<void>(resolve => { finish = resolve; });
  const first = withStripeAccount('acct_one', () => active);
  const secondAction = jest.fn(async () => 'approved');
  const second = withStripeAccount('acct_two', secondAction);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(secondAction).not.toHaveBeenCalled();
  finish();
  await first;
  await expect(second).resolves.toBe('approved');
});
