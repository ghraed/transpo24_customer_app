import * as Location from 'expo-location';
import { reverseGeocodeCoordinates } from '@/lib/places';
import type { Address } from './vehicle-draft';

// Foreground location permission must be granted by the caller first.
export async function resolveCurrentAddress(
  latitude: number,
  longitude: number,
): Promise<Address | null> {
  try {
    const resolved = await reverseGeocodeCoordinates(latitude, longitude);
    if (resolved?.address.trim()) return resolved;
  } catch {
    // Match the original pickup flow when Google's web geocoder is unavailable.
  }

  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    for (const result of results) {
      const street = [result.streetNumber, result.street].filter(Boolean).join(' ');
      const locality = [result.postalCode, result.city ?? result.district]
        .filter(Boolean)
        .join(' ');
      const parts = [street || result.name, locality, result.region, result.country]
        .map(part => part?.trim())
        .filter((part): part is string => Boolean(part));
      const address = result.formattedAddress?.trim() || [...new Set(parts)].join(', ');
      if (address) return { latitude, longitude, address };
    }
  } catch {
    // Keep manual search available if neither provider can resolve an address.
  }
  return null;
}
