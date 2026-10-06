import type { VehicleCatalogBrand, VehicleCatalogModel } from '@/types/vehicle';
import type { RegistrationExtraction } from '@/types/registration';
import {
  normalizeBodyType,
  normalizeTransmission,
  type VehicleDraft,
} from './vehicle-draft';

export const SCAN_FORM_FIELDS = [
  'vin',
  'registration',
  'brand',
  'model',
  'year',
  'weight',
  'bodyType',
  'transmission',
] as const;
export type ScanFormField = (typeof SCAN_FORM_FIELDS)[number];
export type ScanValues = Record<ScanFormField, string>;
export type ScanSelection = Record<ScanFormField, boolean>;
export type FormVehicle = VehicleDraft['vehicle'];
const normalizeName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
export function exactCatalogMatch<T extends { name: string }>(
  values: T[],
  name: string,
): T | undefined {
  const matches = values.filter(
    (v) => normalizeName(v.name) === normalizeName(name),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
export function scanValues(result: RegistrationExtraction): ScanValues {
  const f = result.fields;
  const value = (name: keyof typeof f) =>
    f[name].value === null ? '' : String(f[name].value);
  return {
    vin: value('vin'),
    registration: value('swissRegistrationNumber'),
    brand: value('brand'),
    model: value('model'),
    year: value('manufactureYear'),
    weight: value('emptyWeightKg'),
    bodyType: normalizeBodyType(value('bodyType')),
    transmission: normalizeTransmission(value('transmission')),
  };
}
export function defaultScanSelection(
  current: FormVehicle,
  values: ScanValues,
): ScanSelection {
  return Object.fromEntries(
    SCAN_FORM_FIELDS.map((name) => [
      name,
      !current[name] && !!values[name] && !invalidScanField(name, values[name]),
    ]),
  ) as ScanSelection;
}
export function sameVehicle(a: FormVehicle, b: FormVehicle): boolean {
  return (
    SCAN_FORM_FIELDS.every((name) => a[name] === b[name]) &&
    a.brandId === b.brandId &&
    a.modelId === b.modelId &&
    a.manual === b.manual
  );
}
export function invalidScanField(name: ScanFormField, value: string): boolean {
  if (!value.trim()) return true;
  if (name === 'vin') return !/^[A-HJ-NPR-Z0-9]{17}$/.test(value);
  if (name === 'registration') return !/^\d{9}$/.test(value);
  if (name === 'year')
    return (
      !/^\d{4}$/.test(value) ||
      Number(value) < 1900 ||
      Number(value) > new Date().getFullYear() + 1
    );
  if (name === 'weight')
    return (
      !/^\d+(?:\.\d+)?$/.test(value) ||
      Number(value) <= 0 ||
      Number(value) > 100000
    );
  if (name === 'bodyType')
    return ![
      'SEDAN',
      'HATCHBACK',
      'ESTATE',
      'SUV',
      'VAN',
      'PICKUP',
      'COUPE',
      'CONVERTIBLE',
      'OTHER',
    ].includes(value);
  if (name === 'transmission')
    return !['MANUAL', 'AUTOMATIC', 'OTHER'].includes(value);
  return value.length > 120;
}
export function applyRegistrationReview(
  current: FormVehicle,
  values: ScanValues,
  selected: ScanSelection,
  brands: VehicleCatalogBrand[],
  models: VehicleCatalogModel[],
  manualApproved: boolean,
  original: ScanValues,
): FormVehicle {
  for (const name of SCAN_FORM_FIELDS)
    if (selected[name] && invalidScanField(name, values[name]))
      throw new Error('vehicleRequest.scan.invalidValue');
  if (
    selected.brand &&
    values.brand !== current.brand &&
    current.model &&
    !selected.model
  )
    throw new Error('vehicleRequest.scan.dependentModel');
  const next = { ...current, fieldSources: { ...current.fieldSources } };
  for (const name of SCAN_FORM_FIELDS)
    if (selected[name]) {
      next[name] = values[name].trim();
      next.fieldSources[name] =
        values[name] === original[name] ? 'REGISTRATION_CARD' : 'MANUAL';
    }
  if (selected.brand || selected.model) {
    const brand = exactCatalogMatch(brands, next.brand);
    const model = brand
      ? exactCatalogMatch(
          models.filter((m) => m.brandId === brand.id),
          next.model,
        )
      : undefined;
    if (!brand || !model) {
      if (!manualApproved) throw new Error('vehicleRequest.scan.catalogReview');
      next.brandId = '';
      next.modelId = '';
      next.manual = true;
    } else {
      next.brandId = brand.id;
      next.modelId = model.id;
      next.manual = false;
    }
  }
  if (SCAN_FORM_FIELDS.some((name) => selected[name])) {
    next.registrationScanApplied = true;
    next.source = SCAN_FORM_FIELDS.some(
      (name) => selected[name] && values[name] !== original[name],
    )
      ? 'MANUAL'
      : 'REGISTRATION_CARD';
  }
  return next;
}
