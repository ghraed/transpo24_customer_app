import type { PaymentPolicy } from '@/types/payment-policy';
import { PaymentInfo } from './payment-info';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import appI18n from '@/localization/i18n';

const REFUND_STAGES = [
  {
    time: 'First 10 minutes',
    fee: 'Free cancellation',
    refund: '100%',
    summary: 'First 10 minutes: free cancellation (100% refund).',
  },
  {
    time: '10 min – 24 h',
    fee: '15% cancellation fee',
    refund: '85%',
    summary: 'After 10 minutes through 24 hours: 15% cancellation fee (85% refund).',
  },
  {
    time: 'After 24 hours',
    fee: '50% cancellation fee',
    refund: '50%',
    summary: 'After 24 hours: 50% cancellation fee (50% refund).',
  },
] as const;

export function PaymentConditions({ compact = false, policy }: { compact?: boolean; policy?: PaymentPolicy }) {
  if (policy?.booking.authorization === 'AFTER_COUNTDOWN') return <View style={styles.card}>
    <View style={styles.header}><Text style={styles.title}>{appI18n.t('Payment and cancellation conditions')}</Text><PaymentInfo context="booking" policy={policy} /></View>
    <Text style={styles.subtitle}>{appI18n.t('payment_info.delayed_start', { minutes: policy.booking.freeCancellationSeconds / 60 })}</Text>
  </View>;
  const rtl = appI18n.dir?.() === 'rtl';
  const direction = rtl && styles.rtlRow;
  const textDirection = rtl && styles.rtlText;
  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      <View style={[styles.header, direction]}>
        <View style={styles.shield} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} tintColor={colors.ink} size={20} />
        </View>
        <Text accessibilityRole="header" style={[styles.title, textDirection]}>
          {appI18n.t('Payment and cancellation conditions')}
        </Text>
      </View>
      <Text style={[styles.subtitle, textDirection]}>
        {appI18n.t('All time windows start when your payment succeeds.')}
      </Text>

      <View style={styles.timeline}>
        {REFUND_STAGES.map((stage, index) => (
          <View key={stage.time} accessible accessibilityLabel={appI18n.t(stage.summary)} style={[styles.stage, direction]}>
            <View style={styles.track}>
              <View style={[styles.dot, index === 0 && styles.freeDot]} />
              {index < REFUND_STAGES.length - 1 ? <View style={styles.connector} /> : null}
            </View>
            <View style={[styles.stageContent, index === REFUND_STAGES.length - 1 && styles.lastStage]}>
              <Text style={[styles.stageTime, textDirection]}>{appI18n.t(stage.time)}</Text>
              <Text style={[styles.stageFee, index === 0 && styles.freeText, textDirection]}>{appI18n.t(stage.fee)}</Text>
            </View>
            <View style={[styles.refundBadge, index === 0 && styles.freeBadge]}>
              <Text style={[styles.refundValue, index === 0 && styles.freeText]}>{stage.refund}</Text>
              <Text style={[styles.refundLabel, index === 0 && styles.freeText]}>{appI18n.t('Refund')}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.disclosure, direction]} accessible accessibilityLabel={appI18n.t('After 10 minutes: driver details are shared with you.')}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <SymbolView name={{ ios: 'lock.open', android: 'lock_open', web: 'lock_open' }} tintColor={colors.disclosureInk} size={18} />
        </View>
        <View style={styles.disclosureContent}>
          <Text style={[styles.disclosureTitle, textDirection]}>{appI18n.t('Driver details')}</Text>
          <Text style={[styles.disclosureText, textDirection]}>{appI18n.t('Shared with you after the first 10 minutes.')}</Text>
        </View>
      </View>
      <Text style={[styles.footnote, textDirection]}>
        {appI18n.t('After pickup: automatic cancellation is not available and the case goes to manual review.')}
      </Text>
    </View>
  );
}

const colors = {
  ink: '#17212F',
  muted: '#5B6778',
  border: '#E4E9EF',
  surface: '#FFFFFF',
  subtle: '#F3F5F8',
  brand: '#FFF2CC',
  free: '#176747',
  freeBackground: '#EAF6EF',
  disclosureInk: '#355475',
  disclosureBackground: '#EFF4F9',
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 20 },
  compactCard: { padding: 16, marginTop: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shield: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.ink },
  subtitle: { marginTop: 12, fontSize: 13, lineHeight: 19, color: colors.muted },
  timeline: { marginTop: 22 },
  stage: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  track: { width: 12, alignSelf: 'stretch', alignItems: 'center' },
  dot: { marginTop: 5, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border, borderWidth: 2, borderColor: colors.muted, zIndex: 1 },
  freeDot: { backgroundColor: colors.free, borderColor: colors.free },
  connector: { position: 'absolute', top: 15, bottom: -5, width: 1, backgroundColor: colors.border },
  stageContent: { flex: 1, minWidth: 0, paddingBottom: 24 },
  lastStage: { paddingBottom: 0 },
  stageTime: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink },
  stageFee: { marginTop: 4, fontSize: 13, lineHeight: 18, color: colors.muted },
  refundBadge: { minWidth: 68, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.subtle, alignItems: 'center' },
  freeBadge: { backgroundColor: colors.freeBackground },
  refundValue: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors.ink, fontVariant: ['tabular-nums'] },
  refundLabel: { marginTop: 2, fontSize: 12, lineHeight: 16, color: colors.muted },
  freeText: { color: colors.free },
  disclosure: { marginTop: 20, padding: 14, borderRadius: 14, backgroundColor: colors.disclosureBackground, flexDirection: 'row', alignItems: 'center', gap: 10 },
  disclosureContent: { flex: 1 },
  disclosureTitle: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.disclosureInk },
  disclosureText: { marginTop: 3, fontSize: 13, lineHeight: 18, color: colors.disclosureInk },
  footnote: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderColor: colors.border, fontSize: 12, lineHeight: 18, color: colors.muted },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
