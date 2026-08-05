import { describe, expect, it } from '@jest/globals';

import { countryFlag, getCallingCode, normalizePhoneNumber } from './phone-number';

describe('phone input utilities', () => {
  it('normalizes a Lebanese local number to E.164', () => {
    expect(normalizePhoneNumber('70 123 456', 'LB')).toBe('+96170123456');
  });

  it('honors a selected country', () => {
    expect(normalizePhoneNumber('202 555 0123', 'US')).toBe('+12025550123');
    expect(getCallingCode('US')).toBe('+1');
    expect(countryFlag('US')).toBe('🇺🇸');
  });

  it('rejects an invalid local number before an API request', () => {
    expect(normalizePhoneNumber('12', 'LB')).toBeNull();
  });
});
