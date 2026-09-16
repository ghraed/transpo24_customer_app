import { beforeEach, expect, it, jest } from '@jest/globals';
import { authenticatedFetch } from '@/lib/auth-token';
import { getCustomerPlaces, removeCustomerPlace, saveCustomerPlace } from './customer-places';

jest.mock('@/lib/auth-token', () => ({ authenticatedFetch: jest.fn() }));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'https://api.test' }));
const fetchMock = jest.mocked(authenticatedFetch);
beforeEach(() => { jest.resetAllMocks(); });
it('uses authenticated requests and only sends editable address fields', async () => {
  const saved = { id: 'saved', customerId: 'other', label: 'Old', latitude: 48, longitude: 8, address: 'Street', placeId: 'place' };
  fetchMock.mockResolvedValue({ ok: true, json: async () => saved } as Response);
  await saveCustomerPlace(saved, 'Home');
  expect(fetchMock).toHaveBeenCalledWith('https://api.test/customer/places', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ latitude: 48, longitude: 8, address: 'Street', placeId: 'place', label: 'Home' }),
  }));
});
it('loads account places and handles empty delete responses', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: [], recent: [] }) } as Response);
  expect(await getCustomerPlaces()).toEqual({ saved: [], recent: [] });
  fetchMock.mockResolvedValueOnce({ ok: true, status: 204 } as Response);
  await expect(removeCustomerPlace('place/id')).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenLastCalledWith('https://api.test/customer/places/place%2Fid', expect.objectContaining({ method: 'DELETE' }));
});
it('rejects failed writes instead of reporting a successful save', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 403 } as Response);
  await expect(saveCustomerPlace({ latitude: 0, longitude: 0, address: 'Street' }, 'Home')).rejects.toThrow();
});
