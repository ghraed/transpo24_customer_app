import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { handleNextAction } from '@stripe/stripe-react-native';
import { useTranslation } from 'react-i18next';
import type { PaymentSummary } from '@/types/customer-request';
import { failBookingApproval } from '@/lib/api';
import { countdownSeconds, paymentMethodName } from '@/lib/payment-rules';
import { PaymentInfo } from './payment-info';
import { withStripeAccount } from '@/lib/stripe-account';

export function BookingPaymentStatus({
  payment,
  refresh,
  cancel,
}: {
  payment: PaymentSummary;
  refresh: () => void | Promise<void>;
  cancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const confirmation = payment.confirmation;
  const [clock, setClock] = useState({
    serverTime: confirmation?.serverTime ?? '',
    elapsed: 0,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const sampledAt = performance.now();
    const serverTime = confirmation?.serverTime ?? '';
    const timer = setInterval(
      () => setClock({ serverTime, elapsed: performance.now() - sampledAt }),
      1000,
    );
    return () => clearInterval(timer);
  }, [confirmation?.serverTime]);
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => listener?.remove();
  }, [refresh]);
  const approval = confirmation?.state === 'ACTION_REQUIRED';
  const grace = confirmation?.state === 'GRACE_PERIOD';
  const deadline = approval
    ? confirmation.approvalDeadlineAt
    : (confirmation?.authorizationDueAt ?? null);
  const remaining = countdownSeconds(
    deadline,
    confirmation?.serverTime ?? '',
    clock.serverTime === confirmation?.serverTime ? clock.elapsed : 0,
  );
  const expired = (grace || approval) && remaining === 0;
  const requested = useRef(false);
  useEffect(() => {
    if (expired && !requested.current) {
      requested.current = true;
      void refresh();
    }
    if (!expired) requested.current = false;
  }, [expired, refresh]);
  if (!confirmation) return null;
  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: payment.currency,
  }).format(payment.amount);
  const formatAmount = (value: number) =>
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: payment.currency,
    }).format(value);
  const countdown = `${Math.floor(remaining / 60)
    .toString()
    .padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`;
  const title =
    grace && !expired
      ? 'payment_info.free_window'
      : approval && !expired
        ? 'payment_info.approval_required'
        : confirmation.state === 'CANCELLING'
          ? 'payment_info.cancelling'
          : confirmation.state === 'CANCELLED'
            ? 'payment_info.cancelled'
            : confirmation.state === 'MANUAL_REVIEW'
              ? 'payment_info.manual_review'
              : confirmation.state === 'CAPTURED'
                ? 'payment_info.captured'
                : confirmation.state === 'CONFIRMED'
                  ? 'payment_info.funds_held'
                  : 'payment_info.securing';
  const approve = async () => {
    if (busy || !payment.stripeClientSecret || expired) return;
    setBusy(true);
    setError('');
    try {
      const result = await withStripeAccount(payment.stripeAccountId, () => handleNextAction(payment.stripeClientSecret!));
      if (result.error) {
        setError(result.error.message);
        await failBookingApproval(payment.requestId);
      }
    } catch {
      setError(t('payment_info.approval_failed'));
      await failBookingApproval(payment.requestId).catch(() => undefined);
    } finally {
      setBusy(false);
      await refresh();
    }
  };
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          {t(title)}
        </Text>
        <PaymentInfo
          context={approval ? 'approval' : 'hold'}
          policy={confirmation.policy}
          details={[
            t('payment_info.total', { amount }),
            t('payment_info.held', {
              amount: formatAmount(payment.heldAmount),
            }),
            t('payment_info.charged', {
              amount: formatAmount(payment.capturedAmount),
            }),
            paymentMethodName(payment.paymentMethod, t),
            t(title),
            ...(approval ? [countdown] : []),
            ...(confirmation.authorizationExpiresAt ? [new Date(confirmation.authorizationExpiresAt).toLocaleString(i18n.language)] : []),
            ...(deadline
              ? [new Date(deadline).toLocaleString(i18n.language)]
              : []),
          ]}
        />
      </View>
      {(grace || approval) && !expired ? (
        <Text
          accessibilityLabel={`${t(title)} ${countdown}`}
          style={styles.countdown}
        >
          {countdown}
        </Text>
      ) : null}
      <Text style={styles.body}>{amount}</Text>
      {grace && !expired ? (
        <Text style={styles.body}>
          {t('payment_info.delayed_start', {
            minutes: confirmation.policy.booking.freeCancellationSeconds / 60,
          })}
        </Text>
      ) : null}
      {confirmation.failureReason ? (
        <Text style={styles.body}>{t(confirmation.state === 'MANUAL_REVIEW' ? 'payment_info.manual_review' : ({ INSUFFICIENT_FUNDS: 'payment_info.insufficient_result', PAYMENT_DEADLINE: 'payment_info.deadline_result', OFFER_UNAVAILABLE: 'payment_info.offer_unavailable_result', APPROVAL_FAILED: 'payment_info.approval_result' } as Record<string, string>)[confirmation.failureCode ?? ''] ?? 'payment_info.failed_result')}</Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.body}>
          {error}
        </Text>
      ) : null}
      {approval && !expired ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void approve()}
          style={styles.button}
        >
          <Text>
            {t(busy ? 'payment_info.approving' : 'payment_info.approve_bank')}
          </Text>
        </Pressable>
      ) : null}
      {(grace || approval) && !expired && cancel ? (
        <Pressable
          accessibilityRole="button"
          onPress={cancel}
          style={styles.button}
        >
          <Text>{t('payment_info.cancel_free')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    marginVertical: 12,
    backgroundColor: '#FFF8E6',
    borderRadius: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: '#17212F', fontSize: 18, fontWeight: '700' },
  body: { color: '#355475', fontSize: 16, lineHeight: 24, marginTop: 8 },
  countdown: {
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    color: '#17212F',
    writingDirection: 'ltr',
  },
  button: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#FFF2CC',
  },
});
