import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Location from 'expo-location';
import { reverseGeocodeCoordinates } from '@/lib/places';
import { resolveCurrentAddress } from './resolve-current-address';

jest.mock('expo-location', () => ({ reverseGeocodeAsync: jest.fn() }));
jest.mock('@/lib/places', () => ({ reverseGeocodeCoordinates: jest.fn() }));
const google = jest.mocked(reverseGeocodeCoordinates);
const native = jest.mocked(Location.reverseGeocodeAsync);
const point = { latitude: 47.37, longitude: 8.54 };

beforeEach(() => { jest.resetAllMocks(); });
describe('current location address', () => {
  it('keeps a successful Google address and place ID', async () => {
    const result = { ...point, address: '10 Example Street', placeId: 'place-1' };
    google.mockResolvedValue(result);
    await expect(resolveCurrentAddress(point.latitude, point.longitude)).resolves.toEqual(result);
    expect(native).not.toHaveBeenCalled();
  });
  it.each(['error', 'empty'] as const)('uses the native geocoder after a Google %s', async reason => {
    if (reason === 'error') google.mockRejectedValue(new Error('REQUEST_DENIED'));
    else google.mockResolvedValue(null);
    native.mockResolvedValue([{
      formattedAddress: null, name: null, streetNumber: '10', street: 'Example Street', city: 'Zurich',
      district: null, region: null, subregion: null, country: 'Switzerland',
      postalCode: '8000', isoCountryCode: 'CH', timezone: null,
    }]);
    await expect(resolveCurrentAddress(point.latitude, point.longitude)).resolves.toEqual({
      ...point, address: '10 Example Street, 8000 Zurich, Switzerland',
    });
    expect(native).toHaveBeenCalledWith(point);
  });
  it('does not fabricate an address when both providers fail', async () => {
    google.mockRejectedValue(new Error('offline'));
    native.mockRejectedValue(new Error('unavailable'));
    await expect(resolveCurrentAddress(point.latitude, point.longitude)).resolves.toBeNull();
  });
  it('does not fabricate an address when both providers return no results', async () => {
    google.mockResolvedValue(null);
    native.mockResolvedValue([]);
    await expect(resolveCurrentAddress(point.latitude, point.longitude)).resolves.toBeNull();
  });
});
