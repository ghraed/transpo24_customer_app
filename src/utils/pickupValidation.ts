import type {
  DriverLocationUpdatedPayload,
  GeoLocation,
  ItemPickedUpPayload,
  TripStatus,
  TripStatusUpdatedPayload,
} from '@/types/trip.types';

const TRIP_ID_MIN_LENGTH = 8;
const TRIP_ID_MAX_LENGTH = 64;

const TRIP_STATUSES: readonly TripStatus[] = [
  'PENDING_REQUEST',
  'DRIVER_OFFER_SENT',
  'OFFER_ACCEPTED',
  'DRIVER_GOING_TO_PICKUP',
  'DRIVER_ARRIVED_PICKUP',
  'ITEM_PICKED_UP',
  'DRIVER_GOING_TO_DROPOFF',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
] as const;

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

export function isValidTripId(value: string): boolean {
  const normalized = value.trim();
  return normalized.length >= TRIP_ID_MIN_LENGTH && normalized.length <= TRIP_ID_MAX_LENGTH;
}

export function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

export function isValidGeoLocation(location: GeoLocation): boolean {
  return isValidLatitude(location.latitude) && isValidLongitude(location.longitude);
}

export function validateItemPickedUpPayload(payload: unknown): ItemPickedUpPayload | null {
  if (!isRecord(payload)) return null;

  const {
    tripId,
    driverId,
    customerId,
    status,
    pickedUpAt,
    pickupNotes,
    pickupProofImageUrl,
  } = payload;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof customerId !== 'string' ||
    status !== 'ITEM_PICKED_UP' ||
    typeof pickedUpAt !== 'string'
  ) {
    return null;
  }

  if (pickupNotes !== null && typeof pickupNotes !== 'string') {
    return null;
  }

  if (pickupProofImageUrl !== null && typeof pickupProofImageUrl !== 'string') {
    return null;
  }

  return {
    tripId,
    driverId,
    customerId,
    status: 'ITEM_PICKED_UP',
    pickedUpAt,
    pickupNotes: pickupNotes ?? null,
    pickupProofImageUrl: pickupProofImageUrl ?? null,
  };
}

export function validateTripStatusUpdatedPayload(payload: unknown): TripStatusUpdatedPayload | null {
  if (!isRecord(payload)) return null;

  const { tripId, status, updatedAt } = payload;

  if (typeof tripId !== 'string' || typeof status !== 'string' || typeof updatedAt !== 'string') {
    return null;
  }

  if (!TRIP_STATUSES.includes(status as TripStatus)) {
    return null;
  }

  return {
    tripId,
    status: status as TripStatus,
    updatedAt,
  };
}

export function calculateDistanceMeters(origin: GeoLocation, destination: GeoLocation): number {
  const earthRadiusMeters = 6371000;
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLon = toRadians(destination.longitude - origin.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

export function validateDriverLocationUpdatedPayload(
  payload: unknown,
): DriverLocationUpdatedPayload | null {
  if (!isRecord(payload)) return null;

  const { tripId, driverId, latitude, longitude, heading, speed, accuracy, recordedAt } = payload;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    typeof recordedAt !== 'string'
  ) {
    return null;
  }

  if (!isValidGeoLocation({ latitude, longitude })) {
    return null;
  }

  return {
    tripId,
    driverId,
    latitude,
    longitude,
    heading: typeof heading === 'number' ? heading : null,
    speed: typeof speed === 'number' ? speed : null,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    recordedAt,
  };
}
