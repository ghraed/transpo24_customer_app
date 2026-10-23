import type { PaymentMethod } from '@/types/customer-request';

interface ApplePayAvailability {
  merchantIdentifier: string;
  merchantCountryCode: string;
  supported: boolean;
}

// Android and web retain their existing payment choices and ordering.
export function getVisiblePaymentOptions<T extends { method: PaymentMethod }>(
  options: T[],
  platform: string,
  applePay: ApplePayAvailability,
): T[] {
  if (platform !== 'ios') return options;

  const applePayAvailable = applePay.supported &&
    /^merchant\.[A-Za-z0-9.-]+$/.test(applePay.merchantIdentifier) &&
    !/(^|\.)example(\.|$)/i.test(applePay.merchantIdentifier) &&
    /^[A-Z]{2}$/.test(applePay.merchantCountryCode);

  return options.filter(({ method }) =>
    method !== 'GOOGLE_PAY' && (method !== 'APPLE_PAY' || applePayAvailable),
  );
}
