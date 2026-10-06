import { describe, expect, it } from '@jest/globals';
import {
  applyRegistrationReview,
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
  bodyType: 'HATCHBACK',
  transmission: 'MANUAL',
};
const current = () => newVehicleDraft('customer', 'service').vehicle;
describe('registration review mapping', () => {
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
