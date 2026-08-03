import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { clientTheme } from '@/components/tracking-ui';

export default function NotificationsTabScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('Notifications')}</Text>
        <Text style={styles.subtitle}>{t('No notifications yet.')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: clientTheme.background, padding: 16 },
  card: {
    backgroundColor: clientTheme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 18,
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: '700', color: clientTheme.text },
  subtitle: { fontSize: 14, color: clientTheme.textMuted },
});
