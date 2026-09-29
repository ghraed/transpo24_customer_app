import { describe, expect, it } from '@jest/globals';
import { getVinValidationMessage, isVinValid, normalizeVinInput, sanitizeVin, INVALID_VIN_MESSAGE } from './vin';

describe('VIN validation', () => {
  it('normalizes case and surrounding whitespace', () => {
    expect(normalizeVinInput('abc 123')).toBe('ABC 123');
    expect(sanitizeVin(' 1hgcm82633a004352 ')).toBe('1HGCM82633A004352');
    expect(isVinValid(' 1hgcm82633a004352 ')).toBe(true);
  });

  it.each(['', ' ', '123', '1HGCM82633A0043529', '1HGCM82633I004352', '1HGCM82633O004352', '1HGCM82633Q004352', '1HGCM82633A00435!'])(
    'rejects invalid VIN %j',
    (vin) => {
      expect(getVinValidationMessage(vin)).toBe(INVALID_VIN_MESSAGE);
      expect(isVinValid(vin)).toBe(false);
    },
  );

  it('accepts exactly 17 permitted characters', () => {
    expect(getVinValidationMessage('1HGCM82633A004352')).toBeNull();
  });
});
