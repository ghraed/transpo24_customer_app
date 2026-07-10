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

import { M3LoginColors } from '@/constants/theme';
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
    void loadRequests(false);
  }, [loadRequests]);

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
          requests.map((request) => (
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centeredContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', gap: 8 },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
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
