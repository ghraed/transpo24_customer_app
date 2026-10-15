export const MAX_REGISTRATION_PAGES = 6;

export const REGISTRATION_FIELDS = [
  'vin',
  'swissRegistrationNumber',
  'brand',
  'model',
  'manufactureYear',
  'emptyWeightKg',
] as const;
export type RegistrationFieldName = (typeof REGISTRATION_FIELDS)[number];
export type RegistrationField = {
  value: string | number | null;
  status: 'extracted' | 'missing' | 'ambiguous' | 'invalid';
  evidence: {
    imageIndex: number;
    label: string;
    printedValue: string;
    unit: string | null;
    meaning?: string;
  }[];
};
export type RegistrationExtraction = {
  status: 'extracted' | 'partial' | 'wrong_document' | 'unreadable';
  fields: Record<RegistrationFieldName, RegistrationField>;
  missingFields: RegistrationFieldName[];
  warnings: { code: string; field?: RegistrationFieldName }[];
};

export function isRegistrationExtraction(
  value: unknown,
): value is RegistrationExtraction {
  if (!value || typeof value !== 'object') return false;
  const v = value as RegistrationExtraction;
  return (
    ['extracted', 'partial', 'wrong_document', 'unreadable'].includes(
      v.status,
    ) &&
    !!v.fields &&
    REGISTRATION_FIELDS.every((name) => {
      const f = v.fields[name];
      return (
        !!f &&
        (f.value === null ||
          typeof f.value === 'string' ||
          (typeof f.value === 'number' && Number.isFinite(f.value))) &&
        ['extracted', 'missing', 'ambiguous', 'invalid'].includes(f.status) &&
        Array.isArray(f.evidence) &&
        f.evidence.length <= 4 &&
        f.evidence.every(
          (e) =>
            !!e &&
            Number.isInteger(e.imageIndex) &&
            e.imageIndex >= 0 &&
            e.imageIndex < MAX_REGISTRATION_PAGES &&
            typeof e.label === 'string' &&
            typeof e.printedValue === 'string' &&
            (e.unit === null || typeof e.unit === 'string'),
        )
      );
    }) &&
    Array.isArray(v.missingFields) &&
    v.missingFields.every((f) => REGISTRATION_FIELDS.includes(f)) &&
    Array.isArray(v.warnings) &&
    v.warnings.every(
      (w) =>
        typeof w.code === 'string' &&
        (!w.field || REGISTRATION_FIELDS.includes(w.field)),
    )
  );
}
