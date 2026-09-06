import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import appI18n from '@/localization/i18n';

const PLACES_AUTOCOMPLETE_ENDPOINT =
  'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_ENDPOINT = 'https://maps.googleapis.com/maps/api/place/details/json';
const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';

type PlacesAutocompleteResponse = {
  predictions?: {
    description: string;
    place_id: string;
    distance_meters?: number;
  }[];
  status?: string;
  error_message?: string;
};

type PlaceDetailsResponse = {
  result?: {
    formatted_address?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  };
  status?: string;
  error_message?: string;
};

type GeocodeResponse = {
  results?: {
    formatted_address?: string;
    place_id?: string;
  }[];
  plus_code?: {
    compound_code?: string;
    global_code?: string;
  };
  status?: string;
  error_message?: string;
};

export type PlaceAutocompleteSuggestion = {
  description: string;
  placeId: string;
  distanceMeters?: number;
};

export type ResolvedPlaceLocation = {
  latitude: number;
  longitude: number;
  address: string;
  placeId: string;
};

export async function searchPlacesAutocomplete(
  input: string,
  options: { location?: { latitude: number; longitude: number }; sessionToken?: string; signal?: AbortSignal } = {},
): Promise<PlaceAutocompleteSuggestion[]> {
  const query = input.trim();

  if (!query) {
    return [];
  }

  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(appI18n.t("Google Maps API key is missing."));
  }

  const params = new URLSearchParams({
    input: query,
    language: appI18n.language,
    key: GOOGLE_MAPS_API_KEY,
  });

  if (options.location) {
    const point = `${options.location.latitude},${options.location.longitude}`;
    params.set("location", point);
    params.set("origin", point);
    params.set("radius", "50000");
  }
  if (options.sessionToken) params.set("sessiontoken", options.sessionToken);
  const response = await fetch(`${PLACES_AUTOCOMPLETE_ENDPOINT}?${params.toString()}`, { signal: options.signal });
  const payload = (await response.json()) as PlacesAutocompleteResponse;

  if (!response.ok) {
    throw new Error(payload.error_message ?? appI18n.t("Places autocomplete request failed."));
  }

  if (payload.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw new Error(payload.error_message ?? `Places API returned ${payload.status}.`);
  }

  const predictions = payload.predictions ?? [];

  return predictions.map((prediction) => ({
    description: prediction.description,
    placeId: prediction.place_id,
    distanceMeters: prediction.distance_meters,
  })).sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
}

export async function fetchPlaceDetails(placeId: string, sessionToken?: string): Promise<ResolvedPlaceLocation> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(appI18n.t("Google Maps API key is missing."));
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: 'formatted_address,geometry',
    language: appI18n.language,
    key: GOOGLE_MAPS_API_KEY,
  });

  if (sessionToken) params.set("sessiontoken", sessionToken);
  const response = await fetch(`${PLACE_DETAILS_ENDPOINT}?${params.toString()}`);
  const payload = (await response.json()) as PlaceDetailsResponse;

  if (!response.ok) {
    throw new Error(payload.error_message ?? appI18n.t("Place details request failed."));
  }

  if (payload.status && payload.status !== 'OK') {
    throw new Error(payload.error_message ?? `Place details returned ${payload.status}.`);
  }

  const lat = payload.result?.geometry?.location?.lat;
  const lng = payload.result?.geometry?.location?.lng;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error(appI18n.t("Place details did not return coordinates."));
  }

  return {
    latitude: lat,
    longitude: lng,
    address: payload.result?.formatted_address ?? '',
    placeId,
  };
}

export async function resolvePlaceSuggestion(
  suggestion: PlaceAutocompleteSuggestion,
): Promise<ResolvedPlaceLocation> {
  const place = await fetchPlaceDetails(suggestion.placeId);

  return {
    ...place,
    address: place.address || suggestion.description,
  };
}

export async function resolvePlaceFromQuery(input: string): Promise<ResolvedPlaceLocation> {
  const suggestions = await searchPlacesAutocomplete(input);

  if (suggestions.length === 0) {
    throw new Error(appI18n.t("No matching places found."));
  }

  return resolvePlaceSuggestion(suggestions[0]);
}

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number,
): Promise<ResolvedPlaceLocation | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(appI18n.t("Google Maps API key is missing."));
  }

  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`${GEOCODE_ENDPOINT}?${params.toString()}`);
  const payload = (await response.json()) as GeocodeResponse;

  if (!response.ok) {
    throw new Error(payload.error_message ?? appI18n.t("Reverse geocoding request failed."));
  }

  if (payload.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    throw new Error(payload.error_message ?? `Reverse geocoding returned ${payload.status}.`);
  }

  const firstResult = payload.results?.[0];
  const fallbackAddress = payload.plus_code?.compound_code ?? payload.plus_code?.global_code ?? '';
  const address = firstResult?.formatted_address ?? fallbackAddress;

  if (!address) {
    return null;
  }

  return {
    latitude,
    longitude,
    address,
    placeId: firstResult?.place_id ?? '',
  };
}

export async function getAccountCountryCenter(countryCode: string): Promise<{ latitude: number; longitude: number } | null> {
  if (!GOOGLE_MAPS_API_KEY || !/^[A-Z]{2}$/i.test(countryCode)) return null;
  const params = new URLSearchParams({ components: `country:${countryCode}`, key: GOOGLE_MAPS_API_KEY });
  const response = await fetch(`${GEOCODE_ENDPOINT}?${params}`);
  const data = await response.json() as { results?: { geometry?: { location?: { lat: number; lng: number } } }[] };
  const point = data.results?.[0]?.geometry?.location;
  return response.ok && point ? { latitude: point.lat, longitude: point.lng } : null;
}

export async function getDrivingDistance(
  pickup: { latitude: number; longitude: number },
  dropoff: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<number> {
  const unavailable = () => new Error('vehicleRequest.distanceUnavailable');
  if (!GOOGLE_MAPS_API_KEY) throw unavailable();
  for (const point of [pickup, dropoff]) {
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) ||
        Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) throw unavailable();
  }
  const params = new URLSearchParams({
    origin: `${pickup.latitude},${pickup.longitude}`,
    destination: `${dropoff.latitude},${dropoff.longitude}`,
    mode: 'driving',
    key: GOOGLE_MAPS_API_KEY,
  });
  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`, { signal });
  const data = await response.json() as {
    status?: string;
    routes?: { legs?: { distance?: { value?: number } }[] }[];
  };
  const legs = data.routes?.[0]?.legs;
  if (!response.ok || data.status !== 'OK' || !legs?.length) throw unavailable();
  let meters = 0;
  for (const leg of legs) {
    const value = leg.distance?.value;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw unavailable();
    meters += value;
  }
  // A zero-length route must not be shown for two different selected pins.
  if (meters === 0 && (pickup.latitude !== dropoff.latitude || pickup.longitude !== dropoff.longitude)) throw unavailable();
  return meters / 1000;
}
