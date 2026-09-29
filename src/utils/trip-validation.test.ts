import { describe, expect, it } from '@jest/globals';
import { canMarkArrived, validateOfferAcceptedPayload } from './locationValidation';
import { validateDriverStartedDeliveryPayload, validateItemDeliveredPayload } from './deliveryValidation';
import { isValidTripId, validateDriverLocationUpdatedPayload, validateItemPickedUpPayload, validateTripStatusUpdatedPayload } from './pickupValidation';

const tripId = 'trip-1234';
const place = { latitude: 33.89, longitude: 35.5 };
const photo = { id: 'p1', type: 'PICKUP', url: 'https://example.test/p.jpg', mimeType: 'image/jpeg', sizeBytes: 12, sortOrder: 0, createdAt: '2026-01-01' };

describe('trip event validation', () => {
  it('checks trip ID length after trimming', () => {
    expect(isValidTripId(' 12345678 ')).toBe(true);
    expect(isValidTripId('1234567')).toBe(false);
    expect(isValidTripId('x'.repeat(65))).toBe(false);
  });

  it('accepts valid locations at geographic bounds and rejects invalid coordinates', () => {
    const event = { tripId, driverId: 'driver', latitude: -90, longitude: 180, recordedAt: '2026-01-01' };
    expect(validateDriverLocationUpdatedPayload(event)).toMatchObject({ ...event, heading: null, speed: null, accuracy: null });
    expect(validateDriverLocationUpdatedPayload({ ...event, latitude: 90.01 })).toBeNull();
    expect(validateDriverLocationUpdatedPayload({ ...event, longitude: Infinity })).toBeNull();
    expect(validateDriverLocationUpdatedPayload({ ...event, recordedAt: null })).toBeNull();
  });

  it('validates pickup proof photos and defaults absent optional fields', () => {
    const event = { tripId, driverId: 'driver', customerId: 'customer', status: 'ITEM_PICKED_UP', pickedUpAt: '2026-01-01', pickupNotes: null, pickupProofImageUrl: null };
    expect(validateItemPickedUpPayload(event)).toMatchObject({ pickupProofPhotos: [], pickupNotes: null });
    expect(validateItemPickedUpPayload({ ...event, pickupProofPhotos: [photo] })?.pickupProofPhotos).toEqual([photo]);
    expect(validateItemPickedUpPayload({ ...event, pickupProofPhotos: [{ ...photo, sizeBytes: '12' }] })).toBeNull();
    expect(validateItemPickedUpPayload({ ...event, status: 'DELIVERED' })).toBeNull();
  });

  it('validates delivery status, proof, and rating flag', () => {
    const event = { tripId, driverId: 'driver', customerId: 'customer', status: 'DELIVERED', deliveredAt: '2026-01-01', deliveryNotes: null, deliveryProofImageUrl: null };
    expect(validateItemDeliveredPayload(event)).toMatchObject({ deliveryProofPhotos: [], ratingAvailable: false });
    expect(validateItemDeliveredPayload({ ...event, ratingAvailable: true })?.ratingAvailable).toBe(true);
    expect(validateItemDeliveredPayload({ ...event, ratingAvailable: 'yes' })).toBeNull();
    expect(validateItemDeliveredPayload({ ...event, deliveryProofPhotos: [null] })).toBeNull();
  });

  it('requires the correct delivery transition and a valid destination', () => {
    const event = { tripId, driverId: 'driver', customerId: 'customer', status: 'DRIVER_GOING_TO_DROPOFF', startedAt: '2026-01-01', dropoffLocation: place };
    expect(validateDriverStartedDeliveryPayload(event)?.dropoffLocation).toEqual({ ...place, address: null });
    expect(validateDriverStartedDeliveryPayload({ ...event, status: 'ITEM_PICKED_UP' })).toBeNull();
    expect(validateDriverStartedDeliveryPayload({ ...event, dropoffLocation: { ...place, longitude: 181 } })).toBeNull();
  });

  it('accepts known statuses and rejects unknown status events', () => {
    const event = { tripId, status: 'COMPLETED', updatedAt: '2026-01-01' };
    expect(validateTripStatusUpdatedPayload(event)).toEqual(event);
    expect(validateTripStatusUpdatedPayload({ ...event, status: 'UNKNOWN' })).toBeNull();
    expect(validateTripStatusUpdatedPayload(null)).toBeNull();
  });

  it('uses the 100 meter arrival radius', () => {
    expect(canMarkArrived(place, place)).toBe(true);
    expect(canMarkArrived(place, { ...place, latitude: place.latitude + 0.0005 })).toBe(true);
    expect(canMarkArrived(place, { ...place, latitude: place.latitude + 0.002 })).toBe(false);
  });

  it('rejects an accepted offer with invalid coordinates', () => {
    const event = { tripId, driverId: 'driver', customerId: 'customer', status: 'OFFER_ACCEPTED', pickupLocation: place, dropoffLocation: place };
    expect(validateOfferAcceptedPayload(event)).toMatchObject(event);
    expect(validateOfferAcceptedPayload({ ...event, pickupLocation: { ...place, latitude: NaN } })).toBeNull();
  });
});
