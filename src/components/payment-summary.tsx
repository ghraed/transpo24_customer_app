import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import appI18n from '@/localization/i18n';

type PaymentSummaryProps = {
  amountLabel: string;
  currency: string;
  commissionLabel?: string;
  driverLabel: string;
  pickupAddress: string;
  estimatedPickup: string;
};

function SummaryIcon({ name, header = false }: {
  name: SymbolViewProps['name'];
  header?: boolean;
}) {
  return (
    <View style={[styles.icon, header && styles.headerIcon]} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SymbolView name={name} tintColor={header ? colors.ink : colors.muted} size={header ? 20 : 18} />
    </View>
  );
}

export function PaymentSummary({
  amountLabel,
  currency,
  commissionLabel,
  driverLabel,
  pickupAddress,
  estimatedPickup,
}: PaymentSummaryProps) {
  const rtl = appI18n.dir?.() === 'rtl';
  const direction = rtl && styles.rtlRow;
  const textDirection = rtl && styles.rtlText;
  const details: { label: string; value: string; icon: SymbolViewProps['name'] }[] = [
    { label: 'Selected driver', value: driverLabel, icon: { ios: 'person', android: 'person_outline', web: 'person_outline' } },
    { label: 'Pickup', value: pickupAddress, icon: { ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' } },
    { label: 'Estimated pickup', value: estimatedPickup, icon: { ios: 'calendar', android: 'calendar_today', web: 'calendar_today' } },
  ];

  return (
    <View style={styles.card}>
      <View style={[styles.header, direction]}>
        <SummaryIcon header name={{ ios: 'doc.text', android: 'receipt_long', web: 'receipt_long' }} />
        <Text accessibilityRole="header" style={[styles.title, textDirection]}>{appI18n.t('Payment Summary')}</Text>
      </View>

      <View style={styles.total}>
        <Text style={[styles.totalLabel, textDirection]}>{appI18n.t('Total amount')}</Text>
        <View style={[styles.amountRow, direction]}>
          <Text style={[styles.amount, rtl && styles.amountRtl]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{amountLabel}</Text>
          <View style={styles.currencyBadge}>
            <Text style={styles.currency}>{currency.trim().toUpperCase() || 'USD'}</Text>
          </View>
        </View>
        {commissionLabel ? <Text style={[styles.commission, textDirection]}>{commissionLabel}</Text> : null}
      </View>

      <View style={styles.details}>
        {details.map((detail) => (
          <View key={detail.label} style={[styles.detailRow, direction]} accessible accessibilityLabel={`${appI18n.t(detail.label)}: ${detail.value}`}>
            <SummaryIcon name={detail.icon} />
            <View style={styles.detailCopy}>
              <Text style={[styles.detailLabel, textDirection]}>{appI18n.t(detail.label)}</Text>
              <Text style={[styles.detailValue, textDirection]}>{detail.value}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.footer, direction]}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.footerIcon}>
          <SymbolView name={{ ios: 'lock', android: 'lock_outline', web: 'lock_outline' }} tintColor={colors.muted} size={15} />
        </View>
        <Text style={[styles.footnote, textDirection]}>
          {appI18n.t('This payment is collected now and held in the platform until the trip outcome is resolved.')}
        </Text>
      </View>
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
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.subtle, alignItems: 'center', justifyContent: 'center' },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brand },
  title: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.ink },
  total: { marginTop: 22, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: colors.border },
  totalLabel: { fontSize: 13, lineHeight: 18, color: colors.muted },
  amountRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 12 },
  amount: { flex: 1, minWidth: 0, fontSize: 36, lineHeight: 44, fontWeight: '700', letterSpacing: -1, color: colors.ink, fontVariant: ['tabular-nums'], writingDirection: 'ltr' },
  amountRtl: { textAlign: 'right' },
  currencyBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.subtle },
  currency: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: colors.muted, writingDirection: 'ltr' },
  commission: { marginTop: 8, fontSize: 12, lineHeight: 18, color: colors.muted },
  details: { paddingVertical: 20, gap: 18 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  detailCopy: { flex: 1, minWidth: 0 },
  detailLabel: { fontSize: 12, lineHeight: 17, color: colors.muted },
  detailValue: { marginTop: 4, fontSize: 14, lineHeight: 20, fontWeight: '600', color: colors.ink },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  footerIcon: { marginTop: 2 },
  footnote: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.muted },
  rtlRow: { flexDirection: 'row-reverse' },
  rtlText: { textAlign: 'right', writingDirection: 'rtl' },
});
