import React from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { M3LoginColors } from '@/constants/theme';

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
  container: { flex: 1, backgroundColor: M3LoginColors.background, padding: 16 },
  card: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    padding: 16,
    gap: 6,
  },
  title: { fontSize: 24, fontWeight: '700', color: M3LoginColors.textPrimary },
  subtitle: { fontSize: 14, color: M3LoginColors.textSecondary },
});
