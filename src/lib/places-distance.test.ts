import { afterEach, expect, it, jest } from '@jest/globals';
import { getDrivingDistance } from './places';

jest.mock('@/config/maps', () => ({ GOOGLE_MAPS_API_KEY: 'test-key' }));
jest.mock('@/localization/i18n', () => ({ t: (key: string) => key, language: 'en' }));
const pickup = { latitude: 47, longitude: 8 };
const dropoff = { latitude: 48, longitude: 9 };
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
function response(payload: unknown) {
  const mock = jest.fn<typeof fetch>().mockResolvedValue({ ok: true, json: async () => payload } as Response);
  global.fetch = mock;
  return mock;
}
it('uses road distance in meters from all route legs and sends both selected pins', async () => {
  const request = response({ status: 'OK', routes: [{ legs: [{ distance: { value: 12500 } }, { distance: { value: 3750 } }] }] });
  await expect(getDrivingDistance(pickup, dropoff)).resolves.toBe(16.25);
  const url = new URL(String(request.mock.calls[0][0]));
  expect(url.searchParams.get('origin')).toBe('47,8');
  expect(url.searchParams.get('destination')).toBe('48,9');
  expect(url.searchParams.get('mode')).toBe('driving');
});
it('preserves short distances instead of rounding them to zero', async () => {
  response({ status: 'OK', routes: [{ legs: [{ distance: { value: 25 } }] }] });
  await expect(getDrivingDistance(pickup, dropoff)).resolves.toBe(0.025);
});
it.each([null, undefined, -1, '120', 0])('rejects invalid distance %s for different pins', async value => {
  response({ status: 'OK', routes: [{ legs: [{ distance: { value } }] }] });
  await expect(getDrivingDistance(pickup, dropoff)).rejects.toThrow('vehicleRequest.distanceUnavailable');
});
it('rejects provider errors instead of displaying zero', async () => {
  response({ status: 'REQUEST_DENIED', routes: [] });
  await expect(getDrivingDistance(pickup, dropoff)).rejects.toThrow('vehicleRequest.distanceUnavailable');
});
it('allows a genuine zero-length route at the same point', async () => {
  response({ status: 'OK', routes: [{ legs: [{ distance: { value: 0 } }] }] });
  await expect(getDrivingDistance(pickup, pickup)).resolves.toBe(0);
});
