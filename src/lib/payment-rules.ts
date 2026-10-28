import type { PaymentPolicy } from '@/types/payment-policy';

export type PaymentContext =
  | 'booking'
  | 'hold'
  | 'approval'
  | 'cancellation'
  | 'reservation'
  | 'wallet'
  | 'topUp'
  | 'expense'
  | 'delivery'
  | 'cardSetup';
type Translate = (key: string, values?: Record<string, unknown>) => string;

// Rules are selected by the server's policy for this payment, including historical bookings.
export function paymentRules(
  context: PaymentContext,
  policy: PaymentPolicy,
  t: Translate,
): string[] {
  const delayed = policy.booking.authorization === 'AFTER_COUNTDOWN';
  const rules: string[] = [];
  if (['booking', 'hold', 'cancellation', 'approval'].includes(context)) {
    rules.push(
      t(delayed ? 'payment_info.delayed_start' : 'payment_info.legacy_start', {
        minutes: policy.booking.freeCancellationSeconds / 60,
      }),
    );
    rules.push(
      t(
        delayed
          ? 'payment_info.delayed_capture'
          : 'payment_info.legacy_capture',
      ),
    );
    rules.push(
      t(delayed ? 'payment_info.delayed_driver' : 'payment_info.legacy_driver'),
    );
    if (delayed)
      rules.push(
        t('payment_info.bank_approval', {
          minutes: policy.booking.bankApprovalSeconds / 60,
        }),
        t('payment_info.insufficient'),
        t('payment_info.renewal'),
      );
    rules.push(
      t(
        delayed ? 'payment_info.countdown_clock' : 'payment_info.capture_clock',
      ),
    );
    for (const [index, tier] of policy.booking.cancellationTiers.entries())
      rules.push(
        t(
          delayed && index === 0
            ? 'payment_info.fee_tier'
            : 'payment_info.fee_after',
          {
            minutes: tier.afterSeconds / 60,
            percent: Math.round(tier.feeRate * 100),
          },
        ),
      );
    rules.push(
      t('payment_info.review_fee_changes'),
      t('payment_info.after_pickup'),
      t('payment_info.release_vs_refund'),
    );
  }
  if (context === 'reservation')
    rules.push(
      t('payment_info.reservation_window', {
        days: policy.reservation.unpaidBeyondDays,
        opens: policy.reservation.confirmationHoursBeforePickup,
        deadline: policy.reservation.deadlineHoursBeforePickup,
      }),
      t(delayed ? 'payment_info.delayed_start' : 'payment_info.legacy_start', {
        minutes: policy.booking.freeCancellationSeconds / 60,
      }),
    );
  if (context === 'wallet') rules.push(t('payment_info.wallet'));
  if (context === 'topUp') rules.push(t('payment_info.top_up'));
  if (context === 'expense') rules.push(t('payment_info.expense'));
  if (context === 'delivery')
    rules.push(
      t(delayed ? 'payment_info.delivery' : 'payment_info.legacy_delivery'),
      t('payment_info.rating'),
    );
  if (context === 'cardSetup') rules.push(t('payment_info.card_setup'));
  return rules;
}

export function countdownSeconds(
  deadline: string | null,
  serverTime: string,
  elapsedMs: number,
) {
  if (!deadline) return 0;
  return Math.max(
    0,
    Math.ceil(
      (Date.parse(deadline) - Date.parse(serverTime) - elapsedMs) / 1000,
    ),
  );
}

export function paymentMethodName(method: string, t: Translate): string {
  const labels: Record<string, string> = {
    CREDIT_CARD: 'Credit Card',
    DEBIT_CARD: 'Debit Card',
    APP_WALLET: 'App Wallet',
    APPLE_PAY: 'Apple Pay',
    GOOGLE_PAY: 'Google Pay',
  };
  return t(labels[method] ?? method);
}
