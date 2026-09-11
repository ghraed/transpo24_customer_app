import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { ActivityIndicator, AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { clientTheme } from '@/components/tracking-ui';
import {
  getCustomerNotifications, getPendingDeliveryConfirmations, markCustomerNotificationRead,
  type CustomerNotification, type PendingDeliveryConfirmation,
} from '@/lib/api';
import { getNotificationSince, type NotificationPeriod } from '@/notifications/notificationDateFilter';
import { resolveNotificationRoute } from '@/notifications/notificationRoute';

export default function NotificationsTabScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [period, setPeriod] = useState<NotificationPeriod>('all');
  const [pageError, setPageError] = useState('');
  const listRef = useRef<FlatList<CustomerNotification>>(null);
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [pending, setPending] = useState<PendingDeliveryConfirmation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const active = useRef(false);
  const generation = useRef(0);
  const busy = useRef<number | null>(null);
  const since = useRef<string | undefined>(undefined);
  const scrollStarted = useRef(false);
  const hasLoadedPage = useRef(false);

  const load = useCallback(async (cursor?: string, showSpinner = false) => {
    const requestGeneration = generation.current;
    if (busy.current === requestGeneration) return;
    busy.current = requestGeneration;
    const refreshedSince = getNotificationSince(period);
    const resetPage = showSpinner || (!cursor && period === 'today' && since.current !== refreshedSince);
    if (resetPage) since.current = refreshedSince;
    setPageError('');
    if (cursor) setLoadingMore(true);
    else if (showSpinner) setRefreshing(true);
    try {
      const [page, deliveries] = await Promise.all([
        getCustomerNotifications(cursor, since.current),
        cursor ? Promise.resolve(null) : getPendingDeliveryConfirmations(),
      ]);
      if (!active.current || requestGeneration !== generation.current) return;
      setItems((previous) => {
        // Keep older pages while polling, and refresh read state on current rows.
        const merged = new Map((resetPage ? [] : previous).map((item) => [item.id, item]));
        page.items.forEach((item) => merged.set(item.id, item));
        return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
      });
      if (cursor || resetPage || !hasLoadedPage.current) setNextCursor(page.nextCursor);
      hasLoadedPage.current = true;
      if (deliveries) setPending(deliveries);
      setLoaded(true);
      setError('');
    } catch (e) {
      if (active.current && requestGeneration === generation.current) {
        const message = e instanceof Error ? e.message : t('Failed to load notifications.');
        if (cursor) setPageError(message);
        else setError(message);
      }
    } finally {
      if (requestGeneration === generation.current) {
        busy.current = null;
        if (active.current) { setRefreshing(false); setLoadingMore(false); }
      }
    }
  }, [period, t]);

  useFocusEffect(useCallback(() => {
    generation.current += 1;
    active.current = true;
    scrollStarted.current = false;
    hasLoadedPage.current = false;
    setItems([]);
    setNextCursor(null);
    setLoaded(false);
    setLoadingMore(false);
    setError('');
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    void load(undefined, true);
    const timer = setInterval(() => { void load(); }, 30000);
    const push = Notifications.addNotificationReceivedListener(() => { void load(); });
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void load(); });
    return () => { active.current = false; generation.current += 1; clearInterval(timer); push.remove(); appState.remove(); };
  }, [load]));

  const openNotification = async (item: CustomerNotification) => {
    try {
      if (!item.readAt) {
        await markCustomerNotificationRead(item.id);
        setItems((previous) => previous.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Failed to mark notification as read.'));
    }
    const route = resolveNotificationRoute({ ...item.data, type: item.type });
    if (route) router.push(route);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        ref={listRef}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        onScrollBeginDrag={() => { scrollStarted.current = true; }}
        onScroll={({ nativeEvent }) => { if (nativeEvent.contentOffset.y > 0) scrollStarted.current = true; }}
        scrollEventThrottle={100}
        onEndReachedThreshold={0.3}
        onEndReached={() => {
          if (!scrollStarted.current || !nextCursor || pageError || busy.current === generation.current) return;
          scrollStarted.current = false;
          void load(nextCursor);
        }}
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(undefined, true); }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{t('Alerts')}</Text>
            <Text style={styles.subtitle}>{t('All your job updates in one place.')}</Text>
            <View style={styles.filters}>
              {([{ value: 'today', label: 'Today' }, { value: 'week', label: '1w' }, { value: 'all', label: 'All' }] as const).map((option) => (
                <Pressable key={option.value} accessibilityRole="tab" accessibilityLabel={t(option.label)} accessibilityState={{ selected: period === option.value }} style={[styles.filter, period === option.value && styles.selectedFilter]} onPress={() => setPeriod(option.value)}>
                  <Text style={styles.buttonText}>{t(option.label)}</Text>
                </Pressable>
              ))}
            </View>
            {pending.map((item) => (
              <View key={item.id} style={styles.actionCard}>
                <Text style={styles.cardTitle}>{t('Confirm successful delivery')}</Text>
                <Text style={styles.subtitle}>{item.pickupAddress} → {item.dropoffAddress}</Text>
                <Text style={styles.subtitle}>{t('The driver’s payment stays on hold until you confirm the service was delivered successfully. Review the delivery proof before confirming.')}</Text>
                <Pressable accessibilityRole="button" style={styles.button} onPress={() => router.push({ pathname: '/customer-trip-delivered', params: { tripId: item.id } })}>
                  <Text style={styles.buttonText}>{t('Review and confirm delivery')}</Text>
                </Pressable>
              </View>
            ))}
            <Text style={styles.sectionTitle}>{t('Update history')}</Text>

            {error ? <View style={styles.error}><Text style={styles.subtitle}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { void load(undefined, true); }}><Text style={styles.buttonText}>{t('Try again')}</Text></Pressable></View> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${!item.readAt ? t('Unread') + '. ' : ''}${item.title}. ${item.body}`} style={[styles.card, !item.readAt && styles.unreadCard]} onPress={() => { void openNotification(item); }}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {!item.readAt ? <View style={styles.dot} /> : null}
            </View>
            <Text style={styles.subtitle}>{item.body}</Text>
            {typeof (item.data.requestId ?? item.data.tripId ?? item.data.transportRequestId) === 'string' ? <Text style={styles.meta}>{t('Job')} #{String(item.data.requestId ?? item.data.tripId ?? item.data.transportRequestId)}</Text> : null}
            <Text style={styles.meta}>{new Date(item.createdAt).toLocaleString(undefined, { hour12: false })}</Text>
          </Pressable>
        )}
        ListEmptyComponent={!loaded && !error ? <ActivityIndicator color={clientTheme.accentStrong} /> : !error ? <Text style={styles.subtitle}>{t('No notifications for this period.')}</Text> : null}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={clientTheme.accentStrong} /> : pageError && nextCursor ? (
          <View style={styles.error}>
            <Text style={styles.subtitle}>{pageError}</Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => { void load(nextCursor); }}><Text style={styles.buttonText}>{t('Try again')}</Text></Pressable>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: clientTheme.background },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  header: { gap: 12, marginBottom: 8 },
  card: { backgroundColor: clientTheme.surface, borderRadius: 18, borderWidth: 1, borderColor: clientTheme.border, padding: 18, gap: 8 },
  unreadCard: { borderColor: clientTheme.accentStrong },
  actionCard: { backgroundColor: clientTheme.surface, borderRadius: 18, borderWidth: 1, borderColor: clientTheme.accentStrong, padding: 18, gap: 10 },
  title: { fontSize: 28, fontWeight: '800', color: clientTheme.text },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: clientTheme.text },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: clientTheme.text },
  subtitle: { fontSize: 14, lineHeight: 21, color: clientTheme.textMuted },
  meta: { fontSize: 12, color: clientTheme.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: clientTheme.accentStrong },
  button: { backgroundColor: clientTheme.accent, padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: clientTheme.text, fontWeight: '700' },
  error: { gap: 8 },
  filters: { flexDirection: 'row', gap: 8 },
  filter: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: clientTheme.surface, borderWidth: 1, borderColor: clientTheme.border },
  selectedFilter: { backgroundColor: clientTheme.accent, borderColor: clientTheme.accentStrong },
});
