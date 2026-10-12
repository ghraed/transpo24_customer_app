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
export function scanValues(
  result: RegistrationExtraction,
  brands: VehicleCatalogBrand[] = [],
): ScanValues {
  const f = result.fields;
  const value = (name: keyof typeof f) =>
    f[name].status !== 'extracted' || f[name].value === null ? '' : String(f[name].value);
  let brand = value('brand');
  let model = value('model');
  // Recover a combined printed make/model only using an unambiguous catalog make.
  if (brand && normalizeName(brand) === normalizeName(model)) {
    const prefixes = brands
      .filter((item) =>
        normalizeName(brand).startsWith(`${normalizeName(item.name)} `),
      )
      .sort((a, b) => b.name.length - a.name.length);
    if (
      prefixes.length &&
      (prefixes.length === 1 ||
        prefixes[0].name.length > prefixes[1].name.length)
    ) {
      const combined = brand.trim().replace(/\s+/g, ' ');
      brand = prefixes[0].name;
      model = combined.slice(brand.length).trim();
    } else {
      model = '';
    }
  }
  const prefix = brand.trim().replace(/\s+/g, ' ');
  if (prefix && normalizeName(model).startsWith(`${normalizeName(prefix)} `))
    model = model.trim().replace(/\s+/g, ' ').slice(prefix.length).trim();
  return {
    vin: value('vin'),
    registration: value('swissRegistrationNumber'),
    brand,
    model,
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
  if (name === 'brand' || name === 'model') {
    const printed = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (/^(?:fahr(?:gestell|getell)(?:nummer|\s*[-.]?\s*(?:nummer|nr\.?))|vin|chassis(?:\s*[-.]?\s*(?:number|no\.?|nr\.?))?|(?:n[°ºo.]?\s*(?:(?:de|du)\s*)?)?ch[âa]ssis|marke(?:\s*(?:und|[/&])\s*typ)?|marque(?:\s*(?:et|[/&])\s*type)?|make|brand|model|modell|mod[èe]le|type|typ|karosserie|carrosserie|carrozzeria|fourgon|fourgonnette|furg[oó]n|furgone|lieferwagen|kastenwagen|panel van|van)\s*[:.]?$/i.test(printed) || /^[A-HJ-NPR-Z0-9]{17}$/i.test(printed))
      return true;
  }
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

/** Fill readable fields directly, preserving edits made while a scan was in flight. */
export function applyRegistrationExtraction(
  current: FormVehicle,
  values: ScanValues,
  brands: VehicleCatalogBrand[],
  models: VehicleCatalogModel[],
  beforeScan: FormVehicle = current,
): FormVehicle {
  const selected = Object.fromEntries(
    SCAN_FORM_FIELDS.map((name) => [
      name,
      current[name] === beforeScan[name] &&
        !invalidScanField(name, values[name]),
    ]),
  ) as ScanSelection;
  // Make and model share catalog IDs; never combine a new make with an old model.
  if (
    current.brand !== beforeScan.brand ||
    current.model !== beforeScan.model ||
    current.brandId !== beforeScan.brandId ||
    current.modelId !== beforeScan.modelId
  ) {
    selected.brand = selected.model = false;
  }
  const base =
    selected.brand && values.brand !== current.brand && !selected.model
      ? { ...current, model: '', modelId: '' }
      : current;
  return applyRegistrationReview(
    base,
    values,
    selected,
    brands,
    models,
    true,
    values,
  );
}
