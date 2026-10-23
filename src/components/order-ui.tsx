import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { orderColors as c, orderSpace as s, orderRadius as r } from '@/theme/order-theme';
import { MAP_COLORS } from '@/config/map-style';

export type OrderIconName = 'route' | 'summary' | 'calendar' | 'package' | 'photos' | 'payment' | 'offers' | 'clock' | 'info' | 'check' | 'warning' | 'chat' | 'star' | 'refresh';
const symbols: Record<OrderIconName, SymbolViewProps['name']> = {
  route: { ios: 'map', android: 'map', web: 'map' },
  summary: { ios: 'doc.text', android: 'description', web: 'description' },
  calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  package: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
  photos: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
  payment: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  offers: { ios: 'tag', android: 'sell', web: 'sell' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  info: { ios: 'info.circle', android: 'info', web: 'info' },
  check: { ios: 'checkmark', android: 'check', web: 'check' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  chat: { ios: 'bubble.left.and.bubble.right', android: 'forum', web: 'forum' },
  star: { ios: 'star', android: 'star', web: 'star' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
};
export function OrderIcon({ name, color = c.secondary, size = 22 }: { name: OrderIconName; color?: string; size?: number }) {
  return <SymbolView name={symbols[name]} tintColor={color} size={size} />;
}
export function OrderSectionHeading({ title, icon, count }: { title: string; icon: OrderIconName; count?: number }) {
  return <View style={styles.heading}>
    <View style={styles.iconTile} accessible={false}><OrderIcon name={icon} color={c.text} /></View>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}
  </View>;
}
export function OrderDetailRow({ label, value, icon }: { label: string; value: string; icon: OrderIconName }) {
  return <View style={styles.detail}>
    <View style={styles.detailIcon} accessible={false}><OrderIcon name={icon} size={20} /></View>
    <View style={styles.copy}><Text style={styles.caption}>{label}</Text><Text style={styles.value}>{value}</Text></View>
  </View>;
}
export function OrderRouteCard({ pickup, dropoff, pickupLabel, dropoffLabel }: { pickup: string; dropoff: string; pickupLabel: string; dropoffLabel: string }) {
  return <View style={styles.card}>
    {[{ label: pickupLabel, value: pickup, color: MAP_COLORS.pickup }, { label: dropoffLabel, value: dropoff, color: MAP_COLORS.dropoff }].map((stop, index) =>
      <View key={index} style={styles.routeRow}>
        <View style={styles.track} accessible={false}>
          <View style={[styles.stop, { borderColor: stop.color, borderRadius: index === 0 ? 8 : 3 }]} />
          {index === 0 ? <View style={styles.line} /> : null}
        </View>
        <View style={styles.copy}><Text style={styles.caption}>{stop.label}</Text><Text style={styles.address}>{stop.value}</Text></View>
      </View>)}
  </View>;
}
export function OrderNotice({ text, title, tone = 'info', icon = 'info' }: { text: string; title?: string; tone?: 'info' | 'success' | 'danger' | 'warning'; icon?: OrderIconName }) {
  return <View style={[styles.notice, { backgroundColor: c[`${tone}Soft`] }]}>
    <View accessible={false}><OrderIcon name={icon} color={c[tone]} size={20} /></View>
    <View style={styles.copy}>{title ? <Text style={[styles.title, { color: c[tone] }]}>{title}</Text> : null}<Text style={[styles.noticeText, { color: c[tone] }]}>{text}</Text></View>
  </View>;
}
export function OrderEmptyState({ text, icon }: { text: string; icon: OrderIconName }) {
  return <View style={styles.empty}><View accessible={false} style={styles.emptyIcon}><OrderIcon name={icon} size={28} /></View><Text style={styles.emptyText}>{text}</Text></View>;
}
export function OrderProgress({ steps, current, cancelled, rtl }: { steps: { id: number; label: string }[]; current: number; cancelled: boolean; rtl: boolean }) {
  return <View style={styles.progress}>{steps.map((step, index) => {
    const done = !cancelled && current > step.id;
    const active = !cancelled && current === step.id;
    return <View key={step.id} style={styles.step} accessibilityState={{ selected: active }}>
      <View style={styles.stepTrack}>
        {index < steps.length - 1 ? <View style={[styles.stepLine, rtl ? { right: '50%' } : { left: '50%' }, done && { backgroundColor: c.primary }]} /> : null}
        <View style={[styles.stepNumber, active && styles.activeStep, done && styles.doneStep]}>
          {done ? <OrderIcon name="check" color={c.success} size={16} /> : <Text style={styles.stepNumberText}>{step.id}</Text>}
        </View>
      </View>
      <Text style={[styles.stepLabel, active && { color: c.text, fontWeight: '700' }]}>{step.label}</Text>
    </View>;
  })}</View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: r.lg, padding: s.xl, gap: s.lg },
  heading: { flexDirection: 'row', alignItems: 'center', gap: s.md, minHeight: 40 },
  title: { flex: 1, flexShrink: 1, fontSize: 16, lineHeight: 23, fontWeight: '700', color: c.text, textAlign: 'auto' },
  iconTile: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: c.subtle, borderRadius: r.sm },
  count: { fontSize: 12, fontWeight: '700', color: c.secondary, backgroundColor: c.subtle, padding: s.sm, borderRadius: r.sm },
  detail: { flexDirection: 'row', gap: s.md, paddingVertical: s.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  detailIcon: { paddingTop: 3, width: 28, alignItems: 'center' },
  copy: { flex: 1, minWidth: 0, gap: s.xs },
  caption: { fontSize: 12, lineHeight: 18, color: c.secondary, fontWeight: '500', textAlign: 'auto' },
  value: { fontSize: 15, lineHeight: 22, color: c.text, textAlign: 'auto' },
  address: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: c.text, textAlign: 'auto' },
  routeRow: { flexDirection: 'row', gap: s.md },
  track: { width: 24, alignItems: 'center' },
  stop: { width: 14, height: 14, borderWidth: 4, marginTop: 4, backgroundColor: c.surface },
  line: { width: 1, backgroundColor: c.border, flex: 1, minHeight: 28, marginTop: s.sm, marginBottom: -s.lg },
  notice: { padding: s.lg, borderRadius: r.md, flexDirection: 'row', gap: s.md, alignItems: 'flex-start' },
  noticeText: { fontSize: 14, lineHeight: 21, textAlign: 'auto' },
  empty: { padding: s.xl, borderRadius: r.md, backgroundColor: c.subtle, alignItems: 'center', gap: s.md },
  emptyIcon: { width: 48, height: 48, borderRadius: r.md, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, lineHeight: 21, color: c.secondary, textAlign: 'center' },
  progress: { flexDirection: 'row', paddingVertical: s.md },
  step: { flex: 1, minWidth: 0, alignItems: 'center', gap: s.sm },
  stepTrack: { width: '100%', alignItems: 'center' },
  stepLine: { position: 'absolute', top: 14, width: '100%', height: 1, backgroundColor: c.border },
  stepNumber: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.subtle, alignItems: 'center', justifyContent: 'center' },
  activeStep: { backgroundColor: c.accent, borderColor: c.accent },
  doneStep: { backgroundColor: c.successSoft, borderColor: c.successSoft },
  stepNumberText: { fontSize: 12, fontWeight: '700', color: c.text },
  stepLabel: { fontSize: 12, lineHeight: 18, color: c.secondary, textAlign: 'center', alignSelf: 'stretch' },
});
