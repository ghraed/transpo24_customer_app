import { beforeEach, expect, it, jest } from '@jest/globals';
import { sendPhoneVerificationCode, verifyPhoneVerificationCode, submitCustomerRequest, createCustomerRequest, updatePickupLocation, updateDropoffLocation } from './api';
import { authenticatedFetch } from './auth-token';
import { fetchMarkets, getSelectedMarket, saveSelectedMarket } from './markets';
import { formatCurrency } from '@/localization/format';
const mockStorage = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStorage.set(key, value); }),
}));
jest.mock('./auth-token', () => ({ authenticatedFetch: jest.fn(), getAccessToken: () => 'token' }));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'http://api.test' }));
function response(body: unknown, ok = true): Response {
  return { ok, text: async () => JSON.stringify(body), json: async () => body } as Response;
}
beforeEach(() => { jest.clearAllMocks(); mockStorage.clear(); globalThis.fetch = jest.fn<typeof fetch>(); });
it('loads only API markets and persists an explicit selection', async () => {
  jest.mocked(globalThis.fetch).mockResolvedValue(response([{ code: 'FR', name: 'France' }]));
  await expect(fetchMarkets()).resolves.toEqual([{ code: 'FR', name: 'France' }]);
  await saveSelectedMarket('FR');
  await expect(getSelectedMarket()).resolves.toBe('FR');
  expect(globalThis.fetch).toHaveBeenCalledWith('http://api.test/tenants/public');
});
it('fails when markets are unavailable instead of guessing one from GPS', async () => {
  jest.mocked(globalThis.fetch).mockResolvedValue(response({}, false));
  await expect(fetchMarkets()).rejects.toThrow('Unable to load markets');
});
it('sends the chosen market during phone registration/login and resend', async () => {
  jest.mocked(authenticatedFetch).mockResolvedValue(response({ accessToken: 'token' }));
  await sendPhoneVerificationCode('+33612345678', 'FR');
  await verifyPhoneVerificationCode('+33612345678', '123456', 'FR');
  expect(authenticatedFetch).toHaveBeenNthCalledWith(1, expect.stringContaining('/send-code'), expect.objectContaining({ body: JSON.stringify({ phoneNumber: '+33612345678', marketCode: 'FR' }) }));
  expect(authenticatedFetch).toHaveBeenNthCalledWith(2, expect.stringContaining('/verify-code'), expect.objectContaining({ body: JSON.stringify({ phoneNumber: '+33612345678', code: '123456', marketCode: 'FR' }) }));
});
it('uses the mismatch code rather than the backend message', async () => {
  jest.mocked(authenticatedFetch).mockResolvedValue(response({ code: 'TENANT_MISMATCH', message: 'internal message' }, false));
  await expect(verifyPhoneVerificationCode('+33612345678', '123456', 'LB')).rejects.toMatchObject({ code: 'TENANT_MISMATCH', message: expect.stringContaining('another Transpo24 market') });
});
it('never exposes an internal route block reason', async () => {
  jest.mocked(authenticatedFetch).mockResolvedValue(response({ code: 'ROUTE_BLOCKED', message: 'Sensitive admin reason' }, false));
  await expect(submitCustomerRequest('request-1')).rejects.toMatchObject({ code: 'ROUTE_BLOCKED', message: 'Transport on this route is currently unavailable.' });
});
it('preserves API geography and currency without copying the account tenant into requests', async () => {
  jest.mocked(authenticatedFetch).mockResolvedValue(response({ id: 'r', serviceId: 's', currency: 'USD', pickupCountryCode: 'LB', destinationCountryCode: 'SY', pickupLocation: {}, dropoffLocation: {} }));
  await expect(createCustomerRequest({ serviceId: 's' })).resolves.toMatchObject({ currency: 'USD', pickupCountryCode: 'LB', destinationCountryCode: 'SY' });
  expect(authenticatedFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ body: JSON.stringify({ serviceId: 's' }) }));
});
it('uses the provided currency and does not invent a currency for historical data', () => {
  expect(formatCurrency(25, 'EUR')).toMatch(/25/);
  expect(formatCurrency(25, null)).toBe('—');
});

it('submits foreign and cross-border locations unchanged without a home-market restriction', async () => {
  jest.mocked(authenticatedFetch).mockResolvedValue(response({ id: 'r', pickupLocation: {}, dropoffLocation: {} }));
  const beirut = { latitude: 33.89, longitude: 35.5, address: 'Beirut', placeId: 'lb' };
  const paris = { latitude: 48.85, longitude: 2.35, address: 'Paris', placeId: 'fr' };
  await updatePickupLocation('r', beirut);
  await updateDropoffLocation('r', paris);
  const bodies = jest.mocked(authenticatedFetch).mock.calls.map((call) => JSON.parse(call[1].body as string));
  expect(bodies).toEqual([beirut, paris]);
});
