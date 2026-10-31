import type { PaymentPolicy } from '@/types/payment-policy';
import type { PaymentContext } from './payment-rules';

// Compare content as well as the version: configuration can change without a version bump.
export function policyFingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(policyFingerprint).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${policyFingerprint((value as Record<string, unknown>)[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export const policySections: { context: PaymentContext; section: keyof PaymentPolicy }[] = [
  { context: 'booking', section: 'booking' },
  { context: 'reservation', section: 'reservation' },
  { context: 'wallet', section: 'booking' },
  { context: 'topUp', section: 'topUp' },
  { context: 'expense', section: 'additionalExpense' },
  { context: 'delivery', section: 'booking' },
  { context: 'cardSetup', section: 'cardSetup' },
];

export function changedPolicySections(previous: PaymentPolicy, current: PaymentPolicy) {
  return policySections.filter(({ section }) =>
    policyFingerprint(previous[section]) !== policyFingerprint(current[section]) ||
      (section === 'booking' && previous.directCharges !== current.directCharges),
  );
}

export function isPaymentPolicyConflict(error: unknown): boolean {
  return error instanceof Error && /payment terms chang(?:ed|es)/i.test(error.message);
}
