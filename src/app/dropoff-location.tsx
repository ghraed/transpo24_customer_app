import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

type DropoffRouteParams = {
  requestId?: string;
  serviceId?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  pickupPlaceId?: string;
};

export default function DropoffLocationScreen() {
  const params = useLocalSearchParams<DropoffRouteParams>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dropoff Location</Text>
      <Text style={styles.subtitle}>Placeholder screen for next step.</Text>
      <Text style={styles.value}>requestId: {params.requestId ?? 'N/A'}</Text>
      <Text style={styles.value}>serviceId: {params.serviceId ?? 'N/A'}</Text>
      <Text style={styles.value}>pickupLatitude: {params.pickupLatitude ?? 'N/A'}</Text>
      <Text style={styles.value}>pickupLongitude: {params.pickupLongitude ?? 'N/A'}</Text>
      <Text style={styles.value}>pickupAddress: {params.pickupAddress ?? 'N/A'}</Text>
      <Text style={styles.value}>pickupPlaceId: {params.pickupPlaceId ?? 'N/A'}</Text>
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
