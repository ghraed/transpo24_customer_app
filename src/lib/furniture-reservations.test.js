import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { acceptCustomerRequestOffer, confirmFurnitureReservation, cancelFurnitureReservation } from './api';
import { authenticatedFetch } from './auth-token';
jest.mock('@/lib/auth-token', () => ({ getAccessToken: () => 'synthetic-token', getAuthSessionSnapshot: () => ({ user: { id: 'customer' } }), authenticatedFetch: jest.fn(), refreshAccessToken: jest.fn() }));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'https://api.test', createBackendReachabilityError: jest.fn() }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: value => value } }));
const savedFetch = global.fetch;
let calls;
beforeEach(() => {
  calls = [];
  const fetch = jest.fn(async (url, options) => { calls.push([url, options]); return { ok: true, status: 201, text: async () => JSON.stringify({ nextStep: 'RESERVATION_CONFIRMED', payment: null, request: { id: 'request', status: 'RESERVED' } }) }; });
  global.fetch = fetch;
  authenticatedFetch.mockImplementation(fetch);
});
afterEach(() => { global.fetch = savedFetch; jest.clearAllMocks(); });
test('accepts a distant furniture offer with capability opt-in and no payment method', async () => {
  const response = await acceptCustomerRequestOffer('request', 'offer', { confirm: true });
  expect(response.payment).toBeNull();
  expect(response.nextStep).toBe('RESERVATION_CONFIRMED');
  expect(JSON.parse(calls[0][1].body)).toEqual({ confirm: true, supportsDeferredFurniture: true });
});
test('explicit confirmation goes to the reservation payment action', async () => {
  await confirmFurnitureReservation('request', { confirm: true, paymentMethod: 'APP_WALLET' });
  expect(calls[0][0]).toBe('https://api.test/customer/requests/request/reservation/confirm');
  expect(JSON.parse(calls[0][1].body)).toEqual({ confirm: true, paymentMethod: 'APP_WALLET' });
});
test('unpaid cancellation uses the fee-free reservation endpoint', async () => {
  const response = await cancelFurnitureReservation('request');
  expect(calls[0][0]).toBe('https://api.test/customer/requests/request/reservation/cancel');
  expect(response.retainedAmount).toBe(0);
});
