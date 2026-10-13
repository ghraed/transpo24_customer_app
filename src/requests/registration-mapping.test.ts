import { describe, expect, it } from '@jest/globals';
import {
  applyRegistrationReview,
  applyRegistrationExtraction,
  defaultScanSelection,
  exactCatalogMatch,
  invalidScanField,
  sameVehicle,
  scanValues,
  SCAN_FORM_FIELDS,
} from './registration-mapping';
import { newVehicleDraft } from './vehicle-draft';
import {
  REGISTRATION_FIELDS,
  type RegistrationExtraction,
} from '@/types/registration';

const brands = [{ id: 'vw', name: 'Volkswagen' }];
const models = [{ id: 'golf', name: 'Golf', brandId: 'vw' }];
const values = {
  vin: 'WDD1770511N100321',
  registration: '653409643',
  brand: 'Volkswagen',
  model: 'Golf',
  year: '2019',
  weight: '1550',
};
const current = () => newVehicleDraft('customer', 'service').vehicle;
describe('registration review mapping', () => {
  it('autofills a Lebanese card while leaving unavailable weight and Swiss number blank', () => {
    const fields = Object.fromEntries(
      REGISTRATION_FIELDS.map((name) => [
        name,
        {
          value: null,
          status: 'missing',
          evidence: [],
        } as RegistrationExtraction['fields']['vin'],
      ]),
    ) as RegistrationExtraction['fields'];
    for (const [name, value] of Object.entries({
      vin: 'MR2K19F31K1044204',
      brand: 'TOYOTA',
      model: 'YARIS',
      manufactureYear: 2019,
    })) {
      fields[name as keyof typeof fields] = {
        value,
        status: 'extracted',
        evidence: [],
      };
    }
    const extracted: RegistrationExtraction = {
      status: 'partial',
      fields,
      missingFields: ['emptyWeightKg', 'swissRegistrationNumber'],
      warnings: [],
    };
    const next = applyRegistrationExtraction(
      current(),
      scanValues(extracted),
      [],
      [],
    );
    expect(next).toMatchObject({
      vin: 'MR2K19F31K1044204',
      brand: 'TOYOTA',
      model: 'YARIS',
      year: '2019',
      weight: '',
      registration: '',
      manual: true,
    });
  });
  it('maps only confirmed current-form fields to dependent catalog IDs', () => {
    const v = current();
    const selected = defaultScanSelection(v, values);
    const next = applyRegistrationReview(
      v,
      values,
      selected,
      brands,
      models,
      false,
      values,
    );
    expect(next).toMatchObject({
      brandId: 'vw',
      modelId: 'golf',
      year: '2019',
      weight: '1550',
      source: 'REGISTRATION_CARD',
      manual: false,
    });
    expect(next.fieldSources?.vin).toBe('REGISTRATION_CARD');
    const none = Object.fromEntries(
      SCAN_FORM_FIELDS.map((name) => [name, false]),
    ) as typeof selected;
    expect(
      applyRegistrationReview(v, values, none, brands, models, false, values),
    ).toMatchObject(v);
  });
  it('keeps existing values unless replacement is explicitly selected', () => {
    const v = {
      ...current(),
      weight: '1700',
      year: '2018',
      brand: 'Volkswagen',
      model: 'Golf',
      brandId: 'vw',
      modelId: 'golf',
    };
    const selected = defaultScanSelection(v, values);
    expect(selected.weight).toBe(false);
    expect(selected.brand).toBe(false);
    expect(
      applyRegistrationReview(
        v,
        values,
        selected,
        brands,
        models,
        false,
        values,
      ).weight,
    ).toBe('1700');
    expect(
      applyRegistrationReview(
        v,
        values,
        { ...selected, weight: true },
        brands,
        models,
        false,
        values,
      ).weight,
    ).toBe('1550');
  });
  it('requires review of dependent model when replacing a make', () => {
    const v = { ...current(), brand: 'Other', model: 'Old model' };
    const selected = {
      ...defaultScanSelection(v, values),
      brand: true,
      model: false,
    };
    expect(() =>
      applyRegistrationReview(
        v,
        values,
        selected,
        brands,
        models,
        true,
        values,
      ),
    ).toThrow('dependentModel');
  });
  it('requires manual consent for unmatched, ambiguous or wrong-brand catalog data', () => {
    const v = current();
    const selected = defaultScanSelection(v, values);
    expect(
      exactCatalogMatch(
        [...brands, { id: 'duplicate', name: 'VOLKSWAGEN' }],
        'Volkswagen',
      ),
    ).toBeUndefined();
    expect(() =>
      applyRegistrationReview(
        v,
        values,
        selected,
        brands,
        [{ ...models[0], brandId: 'other' }],
        false,
        values,
      ),
    ).toThrow('catalogReview');
    const next = applyRegistrationReview(
      v,
      values,
      selected,
      [],
      [],
      true,
      values,
    );
    expect(next).toMatchObject({
      brand: 'Volkswagen',
      model: 'Golf',
      manual: true,
      brandId: '',
      modelId: '',
    });
  });
  it('records review edits as manual and checks for intervening changes', () => {
    const v = current();
    const selected = defaultScanSelection(v, values);
    const next = applyRegistrationReview(
      v,
      { ...values, weight: '1600' },
      selected,
      brands,
      models,
      false,
      values,
    );
    expect(next.fieldSources?.weight).toBe('MANUAL');
    expect(next.source).toBe('MANUAL');
    expect(sameVehicle(v, { ...v, weight: 'new edit' })).toBe(false);
    expect(sameVehicle(v, { ...v, modelId: 'new model' })).toBe(false);
  });
  it('never maps absent weight/year or nonstandard chassis into usable fields', () => {
    const result: RegistrationExtraction = {
      status: 'partial',
      fields: Object.fromEntries(
        REGISTRATION_FIELDS.map((name) => [
          name,
          { value: null, status: 'missing', evidence: [] },
        ]),
      ) as unknown as RegistrationExtraction['fields'],
      missingFields: [...REGISTRATION_FIELDS],
      warnings: [],
    };
    result.fields.vin = { value: 'ABC-123', status: 'invalid', evidence: [] };
    const mapped = scanValues(result);
    expect(mapped.year).toBe('');
    expect(mapped.weight).toBe('');
    expect(defaultScanSelection(current(), mapped).vin).toBe(false);
    expect(invalidScanField('year', '01/01/2019')).toBe(true);
    expect(invalidScanField('weight', 'NaN')).toBe(true);
  });
});

describe('automatic registration field mapping', () => {
  it('replaces the previously misread displacement with a confirmed empty weight when rescanned', () => {
    const previous = { ...current(), brand: 'Peugeot', model: '3008 1.6i Turbo',
      vin: 'VF30U5FVAES099966', registration: '649403107', weight: '1598', year: '2014' };
    const next = applyRegistrationExtraction(previous, { ...values, brand: previous.brand,
      model: previous.model, vin: previous.vin, registration: previous.registration,
      year: '2014', weight: '1607' }, [], []);
    expect(next.weight).toBe('1607');
    expect(next.fieldSources?.weight).toBe('REGISTRATION_CARD');
    expect(next.vin).toBe(previous.vin);
  });
  it('preserves missing values and clears the previous model when only a new make is readable', () => {
    const v = {
      ...current(),
      brand: 'Old make',
      model: 'Old model',
      modelId: 'old',
      weight: '1700',
    };
    const next = applyRegistrationExtraction(
      v,
      { ...values, model: '', weight: '' },
      brands,
      models,
    );
    expect(next).toMatchObject({
      brand: 'Volkswagen',
      model: '',
      modelId: '',
      weight: '1700',
      manual: true,
    });
  });
  it('does not apply invalid fields or overwrite a make/model pair edited during extraction', () => {
    const before = current();
    const v = {
      ...before,
      brand: 'Ford',
      model: 'Transit Courier',
      weight: '1700',
    };
    const next = applyRegistrationExtraction(
      v,
      { ...values, vin: 'INVALID', weight: '0' },
      brands,
      models,
      before,
    );
    expect(next).toMatchObject({
      brand: 'Ford',
      model: 'Transit Courier',
      weight: '1700',
      vin: '',
    });
  });
});

it('splits duplicated combined make/model using the catalog and preserves multi-word model names', () => {
  const result: RegistrationExtraction = {
    status: 'partial',
    fields: Object.fromEntries(
      REGISTRATION_FIELDS.map((name) => [
        name,
        { value: null, status: 'missing', evidence: [] },
      ]),
    ) as unknown as RegistrationExtraction['fields'],
    missingFields: [],
    warnings: [],
  };
  result.fields.brand = result.fields.model = {
    value: 'Ford Transit Courier',
    status: 'extracted',
    evidence: [],
  };
  expect(scanValues(result, [{ id: 'ford', name: 'Ford' }])).toMatchObject({
    brand: 'Ford',
    model: 'Transit Courier',
  });
  result.fields.brand = result.fields.model = {
    value: 'Ford',
    status: 'extracted',
    evidence: [],
  };
  expect(scanValues(result, [{ id: 'ford', name: 'Ford' }])).toMatchObject({
    brand: 'Ford',
    model: '',
  });
});

it.each(['Fahrgestell-Nr.', 'fahrgetell-Nr', 'Fourgon', 'Carrosserie', 'Marque et type'])('does not apply a row heading or body description as identity: %s', (text) => {
  const next = applyRegistrationExtraction(current(), { ...values, brand: text, model: text, vin: 'WF0WXXTACWKJ75955', weight: '1349' }, brands, models);
  expect(next.brand).toBe('');
  expect(next.model).toBe('');
  expect(next.vin).toBe('WF0WXXTACWKJ75955');
  expect(next.weight).toBe('1349');
});

it('ignores unconfirmed identity values and extra body/transmission scan fields', () => {
  const result: RegistrationExtraction = {
    status: 'partial', fields: Object.fromEntries(REGISTRATION_FIELDS.map((name) => [name, { value: null, status: 'missing', evidence: [] }])) as unknown as RegistrationExtraction['fields'],
    missingFields: [], warnings: [],
  };
  result.fields.brand = { value: 'Fahrgestell-Nr.', status: 'invalid', evidence: [] };
  result.fields.model = { value: 'Fourgon', status: 'ambiguous', evidence: [] };
  result.fields = { ...result.fields, bodyType: { value: 'Fourgon', status: 'extracted', evidence: [] }, transmission: { value: 'MANUAL', status: 'extracted', evidence: [] } } as typeof result.fields;
  const mapped = scanValues(result);
  expect(mapped).toMatchObject({ brand: '', model: '' });
  expect(mapped).not.toHaveProperty('bodyType');
  expect(mapped).not.toHaveProperty('transmission');
});
