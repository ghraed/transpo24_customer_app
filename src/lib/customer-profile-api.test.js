import { completeCustomerProfile, updateCustomerProfile } from './api';
import { authenticatedFetch } from './auth-token';

jest.mock('@/lib/auth-token', () => ({
  getAccessToken: () => 'test-token',
  authenticatedFetch: jest.fn(),
}));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'https://api.test' }));
jest.mock('@/localization/i18n', () => ({
  __esModule: true,
  default: { t: (key) => key },
}));

beforeEach(() => jest.clearAllMocks());

describe.each([
  ['complete-profile', completeCustomerProfile],
  ['update-profile', updateCustomerProfile],
])('%s profile API', (route, submit) => {
  test.each([
    'Mohamad Rhayel',
    'Al',
    'A'.repeat(100),
    'é'.repeat(41),
    '𐐀'.repeat(41),
  ])('sends only the full name and country: %s', async (name) => {
    authenticatedFetch.mockImplementation(async (url, init) => {
      expect(url).toBe(`https://api.test/auth/phone/${route}`);
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      });
      const payload = JSON.parse(init.body);
      expect(payload).toEqual({
        name,
        countryCode: 'CH',
      });
      return {
        ok: true,
        text: async () => JSON.stringify({ success: true, name: payload.name, countryCode: payload.countryCode }),
      };
    });
    await expect(submit(` ${name} `, 'CH')).resolves.toMatchObject({ name, countryCode: 'CH' });
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  test('preserves API errors without retrying the submission', async () => {
    authenticatedFetch.mockResolvedValue({
      ok: false,
      text: async () => JSON.stringify({ message: 'Customer access is required.' }),
    });
    await expect(submit('Mohamad Rhayel', 'CH')).rejects.toThrow('Customer access is required.');
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });
});
