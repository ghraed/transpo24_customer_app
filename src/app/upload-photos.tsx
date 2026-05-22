import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type UploadPhotosRouteParams = {
  requestId?: string;
  serviceId?: string;
  itemTitle?: string;
  itemType?: string;
};

export default function UploadPhotosScreen() {
  const params = useLocalSearchParams<UploadPhotosRouteParams>();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Upload Photos</Text>
      <Text style={styles.subtitle}>Placeholder screen for the next step in request creation.</Text>
      <Text style={styles.value}>requestId: {params.requestId ?? 'N/A'}</Text>
      <Text style={styles.value}>serviceId: {params.serviceId ?? 'N/A'}</Text>
      <Text style={styles.value}>itemTitle: {params.itemTitle ?? 'N/A'}</Text>
      <Text style={styles.value}>itemType: {params.itemType ?? 'N/A'}</Text>
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
