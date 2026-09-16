import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/lib/auth-token';
import { getPreviousRoutes, type PreviousRoute } from './customer-places';

export type RepeatRouteAction = (route: PreviousRoute, confirm: boolean) => void | Promise<void>;
export function RepeatRoute({ onApply }: { onApply: RepeatRouteAction }) {
  const { user } = useAuthSession();
  return user ? <AccountRoutes key={user.id} onApply={onApply} /> : null;
}
function AccountRoutes({ onApply }: { onApply: RepeatRouteAction }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [routes, setRoutes] = useState<PreviousRoute[]>([]);
  const [selected, setSelected] = useState<PreviousRoute>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const applying = useRef(false);
  useEffect(() => () => { generation.current += 1; }, []);
  const load = async () => {
    const id = ++generation.current;
    setOpen(true); setLoading(true); setSelected(undefined); setError('');
    try {
      const result = await getPreviousRoutes();
      if (id === generation.current) setRoutes(result);
    } catch { if (id === generation.current) setError(t('repeat.loadError')); }
    finally { if (id === generation.current) setLoading(false); }
  };
  const apply = async (confirm: boolean) => {
    if (!selected || applying.current) return;
    applying.current = true;
    const id = generation.current;
    setBusy(true); setError('');
    try {
      await onApply(selected, confirm);
      if (id === generation.current) setOpen(false);
    } catch (reason) {
      if (id === generation.current) setError(reason instanceof Error ? reason.message : t('repeat.applyError'));
    } finally {
      applying.current = false;
      if (id === generation.current) setBusy(false);
    }
  };
  const pair = (route: PreviousRoute) => <>
    <Text style={styles.label}>{t('vehicleRequest.step.pickup')}</Text>
    <Text style={styles.address}>{route.pickup.address}</Text>
    <Text style={styles.label}>{t('vehicleRequest.step.dropoff')}</Text>
    <Text style={styles.address}>{route.dropoff.address}</Text>
  </>;
  return <>
    <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.trigger}>
      <Text style={styles.title}>{t('repeat.title')}</Text>
    </Pressable>
    <Modal visible={open} animationType="slide" onRequestClose={() => { if (!busy) { generation.current += 1; setOpen(false); } }}>
      <SafeAreaView style={[styles.screen, { direction: i18n.dir() }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t(selected ? 'repeat.confirmTitle' : 'repeat.title')}</Text>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => { generation.current += 1; setOpen(false); }} style={styles.button}><Text>{t('places.cancel')}</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {loading ? <ActivityIndicator /> : selected ? <View style={styles.card}>{pair(selected)}</View> : routes.map((route, index) => (
            <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${route.pickup.address} → ${route.dropoff.address}`} onPress={() => { setSelected(route); setError(''); }} style={styles.card}>
              {pair(route)}<Text style={styles.title}>{t('repeat.use')}</Text>
            </Pressable>
          ))}
          {!loading && !selected && !routes.length && !error ? <Text>{t('repeat.empty')}</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {error && !selected ? <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.button}><Text>{t('repeat.retry')}</Text></Pressable> : null}
          {selected ? <>
            <Text>{t('repeat.onlyAddresses')}</Text>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void apply(false)} style={styles.button}><Text>{t('repeat.edit')}</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => void apply(true)} style={styles.trigger}>
              {busy ? <ActivityIndicator /> : <Text style={styles.title}>{t('repeat.confirm')}</Text>}
            </Pressable>
          </> : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  trigger: { minHeight: 48, justifyContent: 'center', padding: 12, borderRadius: 12, backgroundColor: '#FFF1CC' },
  screen: { flex: 1, padding: 20, backgroundColor: '#FFF', gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', flexShrink: 1 },
  content: { gap: 16, paddingBottom: 24 },
  card: { padding: 16, borderWidth: 1, borderColor: '#D9DFE8', borderRadius: 12, gap: 8 },
  label: { fontSize: 12, color: '#68768A' },
  address: { fontSize: 15, color: '#111827' },
  button: { minHeight: 48, justifyContent: 'center', padding: 12 },
  error: { color: '#C0392B' },
});
