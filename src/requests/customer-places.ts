import { authenticatedFetch } from '@/lib/auth-token';
import { getApiBaseUrl } from '@/config/backend';
import type { Address } from './vehicle-draft';

export type SavedPlace = Address & { id: string; label: string };
export type CustomerPlaces = { saved: SavedPlace[]; recent: Address[] };

async function request(path: string, method: string, body?: unknown) {
  const response = await authenticatedFetch(`${getApiBaseUrl()}/customer/places${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error('Places request failed');
  return response;
}
export async function getCustomerPlaces(): Promise<CustomerPlaces> {
  return (await request('', 'GET')).json();
}
export async function saveCustomerPlace(address: Address, label: string): Promise<SavedPlace> {
  // Send only editable fields; a selected saved place also carries server metadata.
  const { latitude, longitude, address: text, placeId } = address;
  return (await request('', 'POST', { latitude, longitude, address: text, placeId, label })).json();
}
export async function removeCustomerPlace(id: string): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, 'DELETE');
}
