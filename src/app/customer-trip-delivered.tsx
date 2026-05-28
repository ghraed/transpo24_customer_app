import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type RouteParams = {
  tripId?: string;
  deliveredAt?: string;
  deliveryNotes?: string;
  deliveryProofImageUrl?: string;
};

export default function CustomerTripDeliveredScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();

  const tripId = typeof params.tripId === 'string' ? params.tripId : 'N/A';
  const deliveredAt = typeof params.deliveredAt === 'string' ? params.deliveredAt : null;
  const deliveryNotes = typeof params.deliveryNotes === 'string' ? params.deliveryNotes : '';
  const deliveryProofImageUrl =
    typeof params.deliveryProofImageUrl === 'string' ? params.deliveryProofImageUrl : '';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Item Delivered</Text>
        <Text style={styles.subtitle}>Your delivery has been completed.</Text>
        <Text style={styles.meta}>Trip ID: {tripId}</Text>
        <Text style={styles.meta}>
          Delivered At: {deliveredAt ? new Date(deliveredAt).toLocaleString() : 'N/A'}
        </Text>
        {deliveryNotes ? <Text style={styles.meta}>Notes: {deliveryNotes}</Text> : null}
        {deliveryProofImageUrl ? <Text style={styles.meta}>Proof URL: {deliveryProofImageUrl}</Text> : null}

        <Pressable style={styles.button} onPress={() => router.replace('/home')}>
          <Text style={styles.buttonText}>Back to Home</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#334155',
  },
  meta: {
    color: '#475569',
  },
  button: {
    marginTop: 8,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
