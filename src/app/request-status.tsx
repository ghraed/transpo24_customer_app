import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type RequestStatusRouteParams = {
  requestId?: string;
  status?: string;
  submittedAt?: string;
};

export default function RequestStatusScreen() {
  const params = useLocalSearchParams<RequestStatusRouteParams>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Request Status</Text>
      <Text style={styles.subtitle}>Your request has been sent to drivers.</Text>
      <Text style={styles.value}>requestId: {params.requestId ?? 'N/A'}</Text>
      <Text style={styles.value}>status: {params.status ?? 'N/A'}</Text>
      <Text style={styles.value}>submittedAt: {params.submittedAt ?? 'N/A'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#475467',
    marginBottom: 20,
  },
  value: {
    fontSize: 13,
    color: '#334155',
    marginBottom: 6,
  },
});
