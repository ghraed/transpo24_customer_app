import { beforeEach, expect, it, jest } from '@jest/globals';
import { handleURLCallback } from '@stripe/stripe-react-native';
import { redirectSystemPath } from '../app/+native-intent';
import { queueRequestLink } from '@/lib/pending-request-link';
jest.mock('@stripe/stripe-react-native', () => ({ handleURLCallback: jest.fn(async () => true) }));
jest.mock('@/lib/stripe-url-scheme', () => ({ getStripeUrlScheme: () => 'transpo24-staging' }));
jest.mock('@/lib/pending-request-link', () => ({ queueRequestLink: jest.fn(async () => true) }));
beforeEach(() => { jest.clearAllMocks(); });
it('keeps a warm request link on the mounted navigator while its pending destination is resolved', async () => {
  await expect(redirectSystemPath({ path: 'transpo24-staging://request-status?requestId=owned', initial: false })).resolves.toBeNull();
  expect(queueRequestLink).toHaveBeenCalled();
});
it('consumes the installed staging Stripe callback without queuing secrets', async () => {
  const path = 'transpo24-staging://safepay?payment_intent_client_secret=synthetic_secret';
  await expect(redirectSystemPath({ path, initial: true })).resolves.toBeNull();
  expect(handleURLCallback).toHaveBeenCalledWith(path);
  expect(queueRequestLink).not.toHaveBeenCalled();
});
