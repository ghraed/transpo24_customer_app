import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { getCustomerHome } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/localization/format';
import { useAppLanguage } from '@/localization/provider';
import type { CustomerHomeResponse } from '@/types/customer-request';

function getServiceLabel(
  serviceKey: string | null | undefined,
  fallback: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (serviceKey) {
    case 'VEHICLE_TRANSPORT':
      return t('Vehicle transport');
    case 'MOTORCYCLE_TRANSPORT':
      return t('Motorcycle transport');
    case 'GOODS_TRANSPORT':
      return t('Goods transport');
    case 'FURNITURE_TRANSPORT':
      return t('Furniture transport');
    default:
      return fallback || t('Service');
  }
}

export default function HomeTabScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL } = useAppLanguage();
  const [data, setData] = useState<CustomerHomeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadHome = useCallback(async (isRefresh: boolean): Promise<void> => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setErrorMessage('');

    try {
      const response = await getCustomerHome();
      setData(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('Unable to load home data.');
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadHome(false);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadHome]);

  const onStartNewRequest = (): void => {
    router.push('/choose-service');
  };

  const onViewStatus = (requestId: string): void => {
    router.push({ pathname: '/request-status', params: { requestId } });
  };

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.loadingText}>{t('Loading home...')}</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.title}>{t('Home')}</Text>
        <Text style={styles.errorText}>{errorMessage || t('Unable to load home data.')}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadHome(false)}>
          <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const customerName = data.customer.fullName?.trim() || t('there');
  const directionArrow = isRTL ? '←' : '→';
  const activeRequest = data.activeRequest;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadHome(true)} />
        }
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>{t('Hello, {{name}}', { name: customerName })}</Text>
          <Text style={styles.subtitle}>{t('What would you like to transport today?')}</Text>
          <Pressable style={styles.primaryButton} onPress={onStartNewRequest}>
            <Text style={styles.primaryButtonText}>{t('New Transport Request')}</Text>
          </Pressable>
          <Pressable style={styles.debugButton} onPress={() => router.push('/socket-debug')}>
            <Text style={styles.primaryButtonText}>{t('Socket Debug')}</Text>
          </Pressable>
        </View>

        {activeRequest ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('Active Request')}</Text>
            <Text style={styles.statusPill}>{activeRequest.statusLabel}</Text>
            <Text style={styles.rowText}>
              {getServiceLabel(activeRequest.serviceKey, activeRequest.serviceName, t)}
            </Text>
            <Text style={styles.rowText}>{activeRequest.pickupAddress || t('Pickup not set')}</Text>
            <Text style={styles.rowText}>{activeRequest.dropoffAddress || t('Dropoff not set')}</Text>
            <Text style={styles.mutedText}>
              {t('Scheduled: {{value}}', {
                value: formatDateTime(activeRequest.scheduledPickupAt),
              })}
            </Text>
            <Pressable style={styles.secondaryButton} onPress={() => onViewStatus(activeRequest.id)}>
              <Text style={styles.secondaryButtonText}>{t('View Status')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Overview')}</Text>
          <View style={styles.countersRow}>
            <View style={styles.counterBox}>
              <Text style={styles.counterValue}>{formatNumber(data.counters.totalRequests)}</Text>
              <Text style={styles.counterLabel}>{t('Total')}</Text>
            </View>
            <View style={styles.counterBox}>
              <Text style={styles.counterValue}>{formatNumber(data.counters.activeRequests)}</Text>
              <Text style={styles.counterLabel}>{t('Active')}</Text>
            </View>
            <View style={styles.counterBox}>
              <Text style={styles.counterValue}>{formatNumber(data.counters.completedRequests)}</Text>
              <Text style={styles.counterLabel}>{t('Completed')}</Text>
            </View>
            <View style={styles.counterBox}>
              <Text style={styles.counterValue}>
                {formatNumber(data.counters.pendingQuotesRequests)}
              </Text>
              <Text style={styles.counterLabel}>{t('Pending Offers')}</Text>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('Recent Requests')}</Text>
          {data.recentRequests.length === 0 ? (
            <Text style={styles.mutedText}>
              {t('No requests yet. Start your first transport request.')}
            </Text>
          ) : (
            data.recentRequests.map((request) => (
              <Pressable
                key={request.id}
                style={styles.requestRow}
                onPress={() => onViewStatus(request.id)}
              >
                <Text style={styles.requestTitle}>
                  {getServiceLabel(request.serviceKey, request.serviceName, t)}
                </Text>
                <Text style={styles.mutedText}>{request.statusLabel}</Text>
                <Text style={styles.mutedText}>
                  {(request.pickupAddress || t('Pickup'))} {directionArrow} {(request.dropoffAddress || t('Dropoff'))}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    padding: 20,
    gap: 10,
  },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 14, color: '#475569' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '600',
  },
  rowText: { fontSize: 14, color: '#0F172A' },
  mutedText: { fontSize: 13, color: '#64748B' },
  countersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  counterBox: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  counterValue: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  counterLabel: { fontSize: 12, color: '#64748B' },
  requestRow: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  requestTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  primaryButton: {
    backgroundColor: '#1D4ED8',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  debugButton: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: { color: '#0F172A', fontWeight: '600' },
  loadingText: { fontSize: 14, color: '#475569' },
  errorText: { color: '#DC2626', textAlign: 'center' },
});
