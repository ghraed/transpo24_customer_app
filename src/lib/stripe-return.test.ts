import { beforeEach, expect, it, jest } from '@jest/globals';
import { handleURLCallback } from '@stripe/stripe-react-native';
import { redirectSystemPath } from '../app/+native-intent';

jest.mock('@stripe/stripe-react-native', () => ({ handleURLCallback: jest.fn() }));

beforeEach(() => { jest.resetAllMocks(); });

it('resumes bank verification without putting payment secrets in navigation state', async () => {
  jest.mocked(handleURLCallback).mockResolvedValue(true);
  const path = 'transpo24://safepay?setup_intent_client_secret=test_secret';
  await expect(redirectSystemPath({ path, initial: false })).resolves.toBeNull();
  expect(handleURLCallback).toHaveBeenCalledWith(path);
});

it('keeps unrelated app links unchanged', async () => {
  for (const path of ['/request-status?requestId=123', 'transpo24://chat', 'https://example.com/safepay']) {
    await expect(redirectSystemPath({ path, initial: false })).resolves.toBe(path);
  }
  expect(handleURLCallback).not.toHaveBeenCalled();
});

it('does not navigate to a secret-bearing callback if native handling fails', async () => {
  jest.mocked(handleURLCallback).mockRejectedValue(new Error('no pending payment'));
  await expect(redirectSystemPath({ path: 'transpo24://safepay?secret=test', initial: true })).resolves.toBeNull();
});
