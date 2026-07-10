export const INVALID_VIN_MESSAGE = 'Please enter a valid 17-character VIN.';
export const VIN_DECODE_NETWORK_ERROR_MESSAGE =
  'Could not decode VIN. Please try again.';
export const VIN_DECODE_EMPTY_RESULT_MESSAGE =
  'No vehicle details found for this VIN.';

export function normalizeVinInput(value: string): string {
  return value.toUpperCase();
}

export function sanitizeVin(value: string): string {
  return normalizeVinInput(value).trim();
}

export function getVinValidationMessage(value: string): string | null {
  const vin = sanitizeVin(value);

  if (!vin) return INVALID_VIN_MESSAGE;
  if (vin.length !== 17) return INVALID_VIN_MESSAGE;
  if (!/^[A-Z0-9]+$/.test(vin)) return INVALID_VIN_MESSAGE;
  if (/[IOQ]/.test(vin)) return INVALID_VIN_MESSAGE;

  return null;
}

export function isVinValid(value: string): boolean {
  return getVinValidationMessage(value) === null;
}
