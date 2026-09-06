import { describe, expect, it } from '@jest/globals';
import {
  newVehicleDraft,
  patchVehicleDraft,
  validateVehicleDraft,
  vehiclePayload,
  type VehicleDraft,
} from './vehicle-draft';

export function completeDraft(): VehicleDraft {
  const draft = newVehicleDraft('customer-1', 'vehicle-service');
  return {
    ...patchVehicleDraft(draft, {
      vehicle: {
        ...draft.vehicle,
        brand: 'VW',
        model: 'Touran',
        year: '2012',
        weight: '1549',
        bodyType: 'VAN',
        transmission: 'MANUAL',
      },
      condition: {
        mobility: 'ROLLABLE',
        issues: ['ACCIDENT', 'MISSING_WHEELS', 'CRANE'],
        notes: 'Call at gate',
      },
      pickup: { latitude: 47.55, longitude: 7.59, address: 'Basel' },
      dropoff: { latitude: 47.37, longitude: 8.54, address: 'Zurich' },
      schedule: {
        immediate: false,
        at: new Date(Date.now() + 86400000).toISOString(),
      },
    }),
    distanceKm: 87,
  };
}
describe('vehicle draft isolation', () => {
  it('changes pickup and invalidates distance without losing the other sections', () => {
    const original = {
      ...completeDraft(),
      photos: [{ localId: 'p1', uri: 'file:///car.jpg' }],
    };
    const changed = patchVehicleDraft(original, {
      pickup: { latitude: 46.9, longitude: 7.4, address: 'Bern' },
    });
    expect(changed.distanceKm).toBeUndefined();
    expect(changed).toEqual({
      ...original,
      pickup: { latitude: 46.9, longitude: 7.4, address: 'Bern' },
      distanceKm: undefined,
    });
    expect(original.pickup!.address).toBe('Basel');
  });
  it('preserves four photos and the edited appointment through later edits', () => {
    let draft = completeDraft();
    const at = new Date(Date.now() + 172800000).toISOString();
    draft = patchVehicleDraft(draft, {
      schedule: { immediate: false, at },
      photos: Array.from({ length: 4 }, (_, index) => ({
        localId: `${index}`,
        uri: `file:///${index}.jpg`,
      })),
    });
    draft = patchVehicleDraft(draft, {
      condition: { ...draft.condition, notes: 'Updated note' },
    });
    expect(draft.schedule.at).toBe(at);
    expect(draft.photos).toHaveLength(4);
    expect(draft.distanceKm).toBe(87);
    expect(validateVehicleDraft(draft)).toEqual([]);
  });
  it('accepts a complete vehicle request without photos or an item title', () => {
    expect(validateVehicleDraft(completeDraft())).toEqual([]);
    expect(vehiclePayload(completeDraft())).not.toHaveProperty('itemTitle');
    expect(vehiclePayload(completeDraft()).vehicleIssues).toEqual([
      'ACCIDENT',
      'MISSING_WHEELS',
      'CRANE',
    ]);
  });
  it('routes missing and expired fields to their own sections', () => {
    const draft = completeDraft();
    draft.vehicle.weight = '';
    draft.schedule.at = new Date(Date.now() - 1).toISOString();
    expect(validateVehicleDraft(draft)).toEqual([
      { step: 'vehicle', field: 'weight', key: 'vehicleRequest.errorWeight' },
      { step: 'schedule', field: 'at', key: 'vehicleRequest.errorSchedule' },
    ]);
  });
  it('cannot change service identity and starts another draft without previous vehicle data', () => {
    const draft = completeDraft();
    const hostilePatch = {
      serviceType: 'GOODS_TRANSPORT',
      ownerId: 'other',
    } as unknown as Parameters<typeof patchVehicleDraft>[1];
    expect(patchVehicleDraft(draft, hostilePatch).serviceType).toBe(
      'VEHICLE_TRANSPORT',
    );
    expect(patchVehicleDraft(draft, hostilePatch).ownerId).toBe('customer-1');
    expect(newVehicleDraft('customer-2', 'vehicle-service').vehicle.brand).toBe(
      '',
    );
  });
});
