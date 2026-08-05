import { describe, expect, it } from '@jest/globals';

import { getResendSecondsRemaining, normalizeOtpCode } from './otp';

describe('OTP input utilities', () => {
  it('supports pasted codes and removes non-digits', () => {
    expect(normalizeOtpCode('12 34-56')).toBe('123456');
  });

  it('limits input to six digits', () => {
    expect(normalizeOtpCode('123456789')).toBe('123456');
  });

  it('calculates a background-safe resend countdown', () => {
    expect(getResendSecondsRemaining(61_000, 1_500)).toBe(60);
    expect(getResendSecondsRemaining(10_000, 12_000)).toBe(0);
  });
});
