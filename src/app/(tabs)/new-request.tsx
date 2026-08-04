import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { clientTheme } from '@/components/tracking-ui';

export default function NewRequestTabScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('New Request')}</Text>
        <Text style={styles.subtitle}>{t('Opening request flow...')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: clientTheme.background, padding: 20 },
  card: {
    backgroundColor: clientTheme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 20,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '800', color: clientTheme.text },
  subtitle: { fontSize: 14, color: clientTheme.textMuted, lineHeight: 20 },
});
