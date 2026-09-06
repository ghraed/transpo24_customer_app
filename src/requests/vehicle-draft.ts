import type { LocalPhotoAsset } from '@/types/customer-request';

export const VEHICLE_ISSUES = [
  'DEAD_BATTERY',
  'WINCH',
  'ACCIDENT',
  'CRANE',
  'MISSING_WHEELS',
  'NO_KEY',
  'STEERING_LOCKED',
  'BRAKES_LOCKED',
] as const;
export type VehicleIssue = (typeof VEHICLE_ISSUES)[number];
export type Mobility = 'RUNNING' | 'ROLLABLE' | 'NOT_ROLLABLE';
export type VehicleStep =
  | 'vehicle'
  | 'condition'
  | 'pickup'
  | 'dropoff'
  | 'schedule'
  | 'photos'
  | 'review';
export type Address = {
  latitude: number;
  longitude: number;
  address: string;
  placeId?: string;
};
export type DraftPhoto = LocalPhotoAsset & {
  localId: string;
  uploadedId?: string;
};
export type VehicleDraft = {
  version: 1;
  ownerId: string;
  serviceId: string;
  serviceType: 'VEHICLE_TRANSPORT';
  requestId?: string;
  draftKey: string;
  vehicle: {
    vin: string;
    registration: string;
    brandId: string;
    brand: string;
    modelId: string;
    model: string;
    year: string;
    weight: string;
    bodyType: string;
    transmission: string;
    source: 'MANUAL' | 'VIN_API';
    manual: boolean;
  };
  condition: { mobility: Mobility | ''; issues: VehicleIssue[]; notes: string };
  pickup?: Address;
  dropoff?: Address;
  schedule: { immediate: boolean; at: string };
  photos: DraftPhoto[];
  removedPhotoIds: string[];
  distanceKm?: number;
};
export type DraftError = { step: VehicleStep; field: string; key: string };

export function newVehicleDraft(
  ownerId: string,
  serviceId: string,
): VehicleDraft {
  return {
    version: 1,
    ownerId,
    serviceId,
    serviceType: 'VEHICLE_TRANSPORT',
    draftKey: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    vehicle: {
      vin: '',
      registration: '',
      brandId: '',
      brand: '',
      modelId: '',
      model: '',
      year: '',
      weight: '',
      bodyType: '',
      transmission: '',
      source: 'MANUAL',
      manual: false,
    },
    condition: { mobility: '', issues: [], notes: '' },
    schedule: {
      immediate: false,
      at: new Date(Date.now() + 3600000).toISOString(),
    },
    photos: [],
    removedPhotoIds: [],
  };
}

// Sections are replaced explicitly. A section edit cannot overwrite service identity.
export function patchVehicleDraft(
  draft: VehicleDraft,
  patch: Partial<
    Omit<
      VehicleDraft,
      'version' | 'ownerId' | 'serviceId' | 'serviceType' | 'draftKey'
    >
  >,
): VehicleDraft {
  return {
    ...draft,
    ...patch,
    ...('pickup' in patch || 'dropoff' in patch
      ? { distanceKm: undefined }
      : {}),
    version: 1,
    ownerId: draft.ownerId,
    serviceId: draft.serviceId,
    serviceType: 'VEHICLE_TRANSPORT',
    draftKey: draft.draftKey,
  };
}

export function validateVehicleDraft(
  draft: VehicleDraft,
  now = Date.now(),
): DraftError[] {
  const errors: DraftError[] = [];
  const add = (step: VehicleStep, field: string, key: string) =>
    errors.push({ step, field, key });
  if (!draft.vehicle.brand.trim())
    add('vehicle', 'brand', 'vehicleRequest.errorBrand');
  if (!draft.vehicle.model.trim())
    add('vehicle', 'model', 'vehicleRequest.errorModel');
  const year = Number(draft.vehicle.year);
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > new Date(now).getFullYear() + 1
  )
    add('vehicle', 'year', 'vehicleRequest.errorYear');
  if (
    !Number.isFinite(Number(draft.vehicle.weight)) ||
    Number(draft.vehicle.weight) <= 0
  )
    add('vehicle', 'weight', 'vehicleRequest.errorWeight');
  if (!draft.vehicle.bodyType.trim())
    add('vehicle', 'bodyType', 'vehicleRequest.errorBody');
  if (!draft.vehicle.transmission.trim())
    add('vehicle', 'transmission', 'vehicleRequest.errorTransmission');
  if (draft.vehicle.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(draft.vehicle.vin))
    add('vehicle', 'vin', 'vehicleRequest.errorVin');
  if (!draft.condition.mobility)
    add('condition', 'mobility', 'vehicleRequest.errorCondition');
  if (draft.condition.notes.length > 500)
    add('condition', 'notes', 'vehicleRequest.errorNotes');
  for (const step of ['pickup', 'dropoff'] as const) {
    const address = draft[step];
    if (
      !address?.address.trim() ||
      !Number.isFinite(address.latitude) ||
      !Number.isFinite(address.longitude) ||
      Math.abs(address.latitude) > 90 ||
      Math.abs(address.longitude) > 180
    )
      add(
        step,
        step,
        step === 'pickup'
          ? 'vehicleRequest.errorPickup'
          : 'vehicleRequest.errorDropoff',
      );
  }
  if (
    draft.pickup &&
    draft.dropoff &&
    draft.pickup.latitude === draft.dropoff.latitude &&
    draft.pickup.longitude === draft.dropoff.longitude
  )
    add('dropoff', 'dropoff', 'vehicleRequest.errorSameAddress');
  if (
    !draft.schedule.immediate &&
    (!Number.isFinite(Date.parse(draft.schedule.at)) ||
      Date.parse(draft.schedule.at) <= now)
  )
    add('schedule', 'at', 'vehicleRequest.errorSchedule');
  if (draft.photos.length > 8)
    add('photos', 'photos', 'vehicleRequest.errorPhotos');
  return errors;
}

export function vehiclePayload(draft: VehicleDraft) {
  const v = draft.vehicle;
  return {
    vehicleVin: v.vin || undefined,
    vehicleBrand: v.brand.trim(),
    vehicleModel: v.model.trim(),
    vehicleManufactureYear: Number(v.year),
    vehicleEstimatedWeightKg: Number(v.weight),
    vehicleBodyType: v.bodyType,
    vehicleDataSource: v.source,
    vehicleTransmission: v.transmission,
    vehicleMobility: draft.condition.mobility,
    vehicleIssues: draft.condition.issues,
    vehicleConditionNotes: draft.condition.notes,
    // Retain a useful value for older driver builds while the structured fields roll out.
    vehicleCondition:
      draft.condition.mobility === 'RUNNING'
        ? ('RUNNING' as const)
        : draft.condition.mobility === 'ROLLABLE'
          ? ('NEEDS_WINCH' as const)
          : ('NEEDS_CRANE' as const),
  };
}

export function normalizeBodyType(value?: string): string {
  if (!value) return '';
  if (/van|mpv|minibus|transporter/i.test(value)) return 'VAN';
  if (/suv|sport utility/i.test(value)) return 'SUV';
  if (/pickup|pick-up/i.test(value)) return 'PICKUP';
  if (/estate|wagon|kombi|break/i.test(value)) return 'ESTATE';
  if (/hatch|schrägheck/i.test(value)) return 'HATCHBACK';
  if (/convertible|cabrio/i.test(value)) return 'CONVERTIBLE';
  if (/coupe|coupé/i.test(value)) return 'COUPE';
  if (/sedan|saloon|limousine|berline/i.test(value)) return 'SEDAN';
  return '';
}
export function normalizeTransmission(value?: string): string {
  if (!value) return '';
  if (/auto|cvt|dct|dsg/i.test(value)) return 'AUTOMATIC';
  if (/manual|schalt/i.test(value)) return 'MANUAL';
  return '';
}
