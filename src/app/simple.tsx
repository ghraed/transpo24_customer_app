import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { clientTheme } from '@/components/tracking-ui';

export default function SimplePage() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Utility</Text>
        <Text style={styles.title}>Simple Page</Text>
        <Text style={styles.subtitle}>If you can see this, routing works.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: clientTheme.background,
  },
  card: {
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 24,
    padding: 20,
    gap: 8,
  },
  eyebrow: {
    color: clientTheme.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: clientTheme.text,
  },
  subtitle: {
    fontSize: 16,
    color: clientTheme.textMuted,
    lineHeight: 22,
  },
});
