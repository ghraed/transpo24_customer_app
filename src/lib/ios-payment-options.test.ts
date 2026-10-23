import { expect, test } from '@jest/globals';
import { getVisiblePaymentOptions } from './ios-payment-options';
import type { PaymentMethod } from '@/types/customer-request';

const options: { method: PaymentMethod }[] = [
  { method: 'CREDIT_CARD' }, { method: 'DEBIT_CARD' },
  { method: 'APPLE_PAY' }, { method: 'GOOGLE_PAY' }, { method: 'APP_WALLET' },
];
const configured = {
  merchantIdentifier: 'merchant.com.transpo24.app',
  merchantCountryCode: 'CH',
  supported: true,
};

test.each(['android', 'web'])(
  '%s keeps every existing payment choice, including Google Pay, regardless of Apple setup',
  (platform) => {
    expect(getVisiblePaymentOptions(options, platform, {
      merchantIdentifier: '', merchantCountryCode: '', supported: false,
    })).toBe(options);
    expect(getVisiblePaymentOptions(options, platform, configured)).toBe(options);
  },
);

test.each([
  { merchantIdentifier: '' },
  { merchantIdentifier: 'merchant.com.example.transpo24' },
  { merchantCountryCode: '' },
  { merchantCountryCode: 'SWITZERLAND' },
  { supported: false },
])('iOS keeps cards and wallet usable when Apple Pay is unavailable: %j', (missing) => {
  expect(getVisiblePaymentOptions(options, 'ios', { ...configured, ...missing }))
    .toEqual([{ method: 'CREDIT_CARD' }, { method: 'DEBIT_CARD' }, { method: 'APP_WALLET' }]);
});

test('iOS offers configured Apple Pay on a supported device and omits Google Pay', () => {
  expect(getVisiblePaymentOptions(options, 'ios', configured)).toEqual([
    { method: 'CREDIT_CARD' }, { method: 'DEBIT_CARD' },
    { method: 'APPLE_PAY' }, { method: 'APP_WALLET' },
  ]);
});
