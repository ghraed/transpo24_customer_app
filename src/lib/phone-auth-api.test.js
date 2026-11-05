import { sendPhoneVerificationCode } from './api';
import { authenticatedFetch } from './auth-token';

jest.mock('@/lib/auth-token', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'https://api.test' }));
jest.mock('@/localization/i18n', () => ({
  __esModule: true,
  default: { t: (key) => key },
}));

beforeEach(() => jest.clearAllMocks());

test('does not expose HTML from a misrouted verification request', async () => {
  authenticatedFetch.mockResolvedValue({
    ok: false,
    text: async () => '<!DOCTYPE html><html><body>Internal web page</body></html>',
  });
  await expect(sendPhoneVerificationCode('+96171251044')).rejects.toThrow(
    /^Unable to send a verification code\.$/,
  );
});

test('preserves actionable JSON errors from the API', async () => {
  authenticatedFetch.mockResolvedValue({
    ok: false,
    text: async () => JSON.stringify({ message: 'Please wait before requesting another code.', code: 'RATE_LIMITED' }),
  });
  await expect(sendPhoneVerificationCode('+96171251044')).rejects.toMatchObject({
    message: 'Please wait before requesting another code.', code: 'RATE_LIMITED',
  });
});
