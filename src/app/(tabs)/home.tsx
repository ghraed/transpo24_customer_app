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

import { getCustomerHome } from '@/lib/api';
import type { CustomerHomeResponse } from '@/types/customer-request';

function formatDate(value: string | null): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export default function HomeTabScreen() {
  const router = useRouter();
  const [data, setData] = useState<CustomerHomeResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

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
      const message = error instanceof Error ? error.message : 'Failed to load home data.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadHome(false);
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
        <Text style={styles.loadingText}>Loading home...</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.title}>Home</Text>
        <Text style={styles.errorText}>{errorMessage || 'Unable to load home data.'}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadHome(false)}>
          <Text style={styles.primaryButtonText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const customerName = data.customer.fullName?.trim() || 'there';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadHome(true)} />}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>Hello, {customerName}</Text>
          <Text style={styles.subtitle}>What would you like to transport today?</Text>
          <Pressable style={styles.primaryButton} onPress={onStartNewRequest}>
            <Text style={styles.primaryButtonText}>New Transport Request</Text>
          </Pressable>
          <Pressable style={styles.debugButton} onPress={() => router.push('/socket-debug')}>
            <Text style={styles.primaryButtonText}>Socket Debug</Text>
          </Pressable>
        </View>

        {data.activeRequest ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Active Request</Text>
            <Text style={styles.statusPill}>{data.activeRequest.statusLabel}</Text>
            <Text style={styles.rowText}>
              {data.activeRequest.serviceName || data.activeRequest.serviceKey || 'Service'}
            </Text>
            <Text style={styles.rowText}>{data.activeRequest.pickupAddress || 'Pickup not set'}</Text>
            <Text style={styles.rowText}>{data.activeRequest.dropoffAddress || 'Dropoff not set'}</Text>
            <Text style={styles.mutedText}>Scheduled: {formatDate(data.activeRequest.scheduledPickupAt)}</Text>
            <Pressable style={styles.secondaryButton} onPress={() => onViewStatus(data.activeRequest!.id)}>
              <Text style={styles.secondaryButtonText}>View Status</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Overview</Text>
          <View style={styles.countersRow}>
            <View style={styles.counterBox}><Text style={styles.counterValue}>{data.counters.totalRequests}</Text><Text style={styles.counterLabel}>Total</Text></View>
            <View style={styles.counterBox}><Text style={styles.counterValue}>{data.counters.activeRequests}</Text><Text style={styles.counterLabel}>Active</Text></View>
            <View style={styles.counterBox}><Text style={styles.counterValue}>{data.counters.completedRequests}</Text><Text style={styles.counterLabel}>Completed</Text></View>
            <View style={styles.counterBox}><Text style={styles.counterValue}>{data.counters.pendingQuotesRequests}</Text><Text style={styles.counterLabel}>Pending Offers</Text></View>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Requests</Text>
          {data.recentRequests.length === 0 ? (
            <Text style={styles.mutedText}>No requests yet. Start your first transport request.</Text>
          ) : (
            data.recentRequests.map((request) => (
              <Pressable key={request.id} style={styles.requestRow} onPress={() => onViewStatus(request.id)}>
                <Text style={styles.requestTitle}>{request.serviceName || request.serviceKey || 'Service'}</Text>
                <Text style={styles.mutedText}>{request.statusLabel}</Text>
                <Text style={styles.mutedText}>{request.pickupAddress || 'Pickup'} → {request.dropoffAddress || 'Dropoff'}</Text>
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
