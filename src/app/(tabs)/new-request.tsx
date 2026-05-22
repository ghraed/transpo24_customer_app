import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

export default function NewRequestTabScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>New Request</Text>
        <Text style={styles.subtitle}>Opening request flow...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 6,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 14, color: '#64748B' },
});
