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
import { useRouter } from 'expo-router';

import { isHistoryRequestStatus } from '@/lib/request-status';
import { getCustomerRequests } from '@/lib/api';
import type { CustomerHomeRequestSummary } from '@/types/customer-request';

export default function RequestsTabScreen() {
  const router = useRouter();
  const [requests, setRequests] = useState<CustomerHomeRequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const loadRequests = useCallback(async (isRefresh: boolean): Promise<void> => {
    if (isRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    setErrorMessage('');

    try {
      const response = await getCustomerRequests();
      setRequests(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load requests.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadRequests(false);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadRequests]);

  const activeRequests = requests.filter((request) => !isHistoryRequestStatus(request.status));
  const historyRequests = requests.filter((request) => isHistoryRequestStatus(request.status));

  if (isLoading && requests.length === 0) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#1D4ED8" />
        <Text style={styles.mutedText}>Loading requests...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadRequests(true)} />}
      >
        <Text style={styles.title}>My Requests</Text>
        {!!errorMessage ? (
          <View style={styles.card}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable style={styles.button} onPress={() => void loadRequests(false)}>
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {requests.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.mutedText}>Your transport requests will appear here.</Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Active Requests</Text>
              {activeRequests.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.mutedText}>No active requests right now.</Text>
                </View>
              ) : (
                activeRequests.map((request) => (
                  <Pressable
                    key={request.id}
                    style={styles.card}
                    onPress={() => router.push({ pathname: '/request-status', params: { requestId: request.id } })}
                  >
                    <Text style={styles.cardTitle}>{request.serviceName || request.serviceKey || 'Service'}</Text>
                    <Text style={styles.mutedText}>{request.statusLabel}</Text>
                    <Text style={styles.mutedText}>{request.pickupAddress || 'Pickup'} → {request.dropoffAddress || 'Dropoff'}</Text>
                  </Pressable>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>History Requests</Text>
              {historyRequests.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.mutedText}>No history requests yet.</Text>
                </View>
              ) : (
                historyRequests.map((request) => (
                  <Pressable
                    key={request.id}
                    style={styles.card}
                    onPress={() => router.push({ pathname: '/request-status', params: { requestId: request.id } })}
                  >
                    <Text style={styles.cardTitle}>{request.serviceName || request.serviceKey || 'Service'}</Text>
                    <Text style={styles.mutedText}>{request.statusLabel}</Text>
                    <Text style={styles.mutedText}>{request.pickupAddress || 'Pickup'} → {request.dropoffAddress || 'Dropoff'}</Text>
                  </Pressable>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centeredContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 8 },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 4,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  mutedText: { color: '#64748B', fontSize: 13 },
  errorText: { color: '#DC2626' },
  button: {
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: '#1D4ED8',
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
});
