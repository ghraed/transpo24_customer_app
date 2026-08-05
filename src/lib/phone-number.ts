import {
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export function normalizePhoneNumber(
  localNumber: string,
  country: CountryCode,
): string | null {
  const parsed = parsePhoneNumberFromString(localNumber.trim(), country);
  return parsed?.isValid() ? parsed.number : null;
}

export function getCallingCode(country: CountryCode): string {
  return `+${getCountryCallingCode(country)}`;
}

export function countryFlag(country: CountryCode): string {
  return country
    .toUpperCase()
    .split('')
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}

export function maskPhoneNumber(phoneNumber: string): string {
  return phoneNumber.length > 7
    ? `${phoneNumber.slice(0, 4)} •••• ${phoneNumber.slice(-3)}`
    : phoneNumber;
}
