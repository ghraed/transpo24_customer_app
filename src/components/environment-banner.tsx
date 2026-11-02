import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import appI18n from '@/localization/i18n';

import { getApiBaseUrl } from '@/config/backend';

const PRODUCTION_API_URL = 'https://api.transpo24.com';

export function EnvironmentBanner() {
  const apiUrl = getApiBaseUrl();

  if (apiUrl === PRODUCTION_API_URL) {
    return null;
  }

  return (
    <View
      accessibilityLabel={appI18n.t('API environment: {{environment}} ({{apiUrl}})', {
        environment: appI18n.t('Local'),
        apiUrl,
      })}
      style={[styles.container, styles.local]}
    >
      <Text style={styles.label}>{appI18n.t('Local').toUpperCase()}</Text>
      <Text numberOfLines={1} style={styles.url}>{apiUrl}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 12,
  },
  local: {
    backgroundColor: '#9A3412',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  url: {
    color: '#FFFFFF',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
});
