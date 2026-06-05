import type {
  DriverNearDeliveryPayload,
  DriverLocationUpdatedPayload,
  DriverStartedDeliveryPayload,
  GeoLocation,
  ItemDeliveredPayload,
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

function parseProofPhotos(value: unknown): ItemDeliveredPayload['deliveryProofPhotos'] | null {
  if (!Array.isArray(value)) return [];

  const photos: ItemDeliveredPayload['deliveryProofPhotos'] = [];
  for (const photo of value) {
    if (!isRecord(photo)) return null;
    const { id, type, url, mimeType, sizeBytes, sortOrder, createdAt } = photo;
    if (
      typeof id !== 'string' ||
      typeof type !== 'string' ||
      typeof url !== 'string' ||
      typeof mimeType !== 'string' ||
      typeof sizeBytes !== 'number' ||
      typeof sortOrder !== 'number' ||
      typeof createdAt !== 'string'
    ) {
      return null;
    }

    photos.push({ id, type: type as ItemDeliveredPayload['deliveryProofPhotos'][number]['type'], url, mimeType, sizeBytes, sortOrder, createdAt });
  }

  return photos;
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

export function validateDriverStartedDeliveryPayload(payload: unknown): DriverStartedDeliveryPayload | null {
  if (!isRecord(payload) || !isRecord(payload.dropoffLocation)) return null;

  const { tripId, driverId, customerId, status, startedAt, dropoffLocation } = payload;
  const latitude = dropoffLocation.latitude;
  const longitude = dropoffLocation.longitude;
  const address = dropoffLocation.address;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof customerId !== 'string' ||
    status !== 'DRIVER_GOING_TO_DROPOFF' ||
    typeof startedAt !== 'string' ||
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    (address !== undefined && address !== null && typeof address !== 'string')
  ) {
    return null;
  }

  if (!isValidGeoLocation({ latitude, longitude })) {
    return null;
  }

  return {
    tripId,
    driverId,
    customerId,
    status: 'DRIVER_GOING_TO_DROPOFF',
    startedAt,
    dropoffLocation: {
      latitude,
      longitude,
      address: typeof address === 'string' ? address : null,
    },
  };
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

export function validateItemDeliveredPayload(payload: unknown): ItemDeliveredPayload | null {
  if (!isRecord(payload)) return null;
  const {
    tripId,
    driverId,
    customerId,
    status,
    deliveredAt,
    deliveryNotes,
    deliveryProofImageUrl,
    deliveryProofPhotos,
    ratingAvailable,
  } = payload;

  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof customerId !== 'string' ||
    status !== 'DELIVERED' ||
    typeof deliveredAt !== 'string'
  ) {
    return null;
  }
  if (deliveryNotes !== null && typeof deliveryNotes !== 'string') {
    return null;
  }
  if (deliveryProofImageUrl !== null && typeof deliveryProofImageUrl !== 'string') {
    return null;
  }
  const parsedProofPhotos = parseProofPhotos(deliveryProofPhotos);
  if (parsedProofPhotos === null) {
    return null;
  }
  if (ratingAvailable !== undefined && typeof ratingAvailable !== 'boolean') {
    return null;
  }

  return {
    tripId,
    driverId,
    customerId,
    status: 'DELIVERED',
    deliveredAt,
    deliveryNotes: deliveryNotes ?? null,
    deliveryProofImageUrl: deliveryProofImageUrl ?? null,
    deliveryProofPhotos: parsedProofPhotos,
    ratingAvailable: ratingAvailable === true,
  };
}

export function validateDriverNearDeliveryPayload(
  payload: unknown,
): DriverNearDeliveryPayload | null {
  if (!isRecord(payload)) return null;
  const { tripId, driverId, customerId, distanceKm, thresholdKm, notifiedAt } = payload;
  if (
    typeof tripId !== 'string' ||
    typeof driverId !== 'string' ||
    typeof customerId !== 'string' ||
    typeof distanceKm !== 'number' ||
    typeof thresholdKm !== 'number' ||
    typeof notifiedAt !== 'string'
  ) {
    return null;
  }

  return { tripId, driverId, customerId, distanceKm, thresholdKm, notifiedAt };
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
