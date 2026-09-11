import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { getPendingDeliveryConfirmations, type PendingDeliveryConfirmation } from '@/lib/api';
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { clientTheme } from '@/components/tracking-ui';

export default function NotificationsTabScreen() {
  const { t } = useTranslation();

  const router = useRouter();
  const [items, setItems] = useState<PendingDeliveryConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await getPendingDeliveryConfirmations()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : t('Failed to load delivery confirmations.')); }
    finally { setLoading(false); }
  }, [t]);
  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]));

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={{ gap: 16 }}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('Notifications')}</Text>
        {loading ? <ActivityIndicator /> : null}
        {error ? <><Text style={styles.subtitle}>{error}</Text><Pressable onPress={load}><Text>{t('Try again')}</Text></Pressable></> : null}
        {!loading && !error && !items.length ? <Text style={styles.subtitle}>{t('No deliveries awaiting confirmation.')}</Text> : null}
      </View>
      {items.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.title}>{t('Confirm successful delivery')}</Text>
          <Text style={styles.subtitle}>{item.pickupAddress} → {item.dropoffAddress}</Text>
          <Text style={styles.subtitle}>{t('The driver’s payment stays on hold until you confirm the service was delivered successfully. Review the delivery proof before confirming.')}</Text>
          <Pressable accessibilityRole="button" style={{ backgroundColor: clientTheme.accent, padding: 16, borderRadius: 12 }} onPress={() => router.push({ pathname: '/customer-trip-delivered', params: { tripId: item.id } })}>
            <Text style={{ color: clientTheme.text, fontWeight: '700' }}>{t('Review and confirm delivery')}</Text>
          </Pressable>
        </View>
      ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: clientTheme.background, padding: 16 },
  card: {
    backgroundColor: clientTheme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 18,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '700', color: clientTheme.text },
  subtitle: { fontSize: 14, color: clientTheme.textMuted },
});
