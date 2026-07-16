import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { clearAccessToken } from '@/lib/auth-token';
import { getCustomerHome } from '@/lib/api';
import {
  LANGUAGE_CONFIGS,
  SUPPORTED_LANGUAGES,
} from '@/localization/languages';
import { useAppLanguage } from '@/localization/provider';
import { registerCustomerPushNotifications } from '@/notifications/registerPushNotifications';
import type { CustomerHomeProfile } from '@/types/customer-request';

export default function ProfileTabScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language, isChangingLanguage, setLanguage } = useAppLanguage();
  const [profile, setProfile] = useState<CustomerHomeProfile | null>(null);
  const [pushStatus, setPushStatus] = useState('');
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);

  const loadProfile = useCallback(async (): Promise<void> => {
    try {
      const response = await getCustomerHome();
      setProfile(response.customer);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadProfile]);

  const onLogout = (): void => {
    void clearAccessToken();
    router.replace('/');
  };

  const onRegisterPush = useCallback(async (): Promise<void> => {
    if (isRegisteringPush) {
      return;
    }

    setIsRegisteringPush(true);
    setPushStatus('');

    try {
      const token = await registerCustomerPushNotifications();
      setPushStatus(t('Push registered: {{token}}...', { token: token.slice(0, 24) }));
    } catch (error) {
      setPushStatus(
        error instanceof Error ? error.message : t('Failed to register push notifications.'),
      );
    } finally {
      setIsRegisteringPush(false);
    }
  }, [isRegisteringPush, t]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('Profile')}</Text>
        <Text style={styles.value}>{profile?.fullName || t('Customer')}</Text>
        <Text style={styles.meta}>{profile?.email || t('No email')}</Text>
        <Text style={styles.meta}>{profile?.phone || t('No phone number')}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Language')}</Text>
          <Text style={styles.meta}>
            {t('Current language')}: {LANGUAGE_CONFIGS[language].nativeLabel}
          </Text>
          <View style={styles.languageList}>
            {SUPPORTED_LANGUAGES.map((code) => {
              const config = LANGUAGE_CONFIGS[code];
              const isSelected = language === code;

              return (
                <Pressable
                  key={code}
                  style={[styles.languageButton, isSelected && styles.languageButtonSelected]}
                  onPress={() => void setLanguage(code)}
                  disabled={isChangingLanguage}
                >
                  <View>
                    <Text style={[styles.languageName, isSelected && styles.languageNameSelected]}>
                      {config.nativeLabel}
                    </Text>
                    <Text style={[styles.languageMeta, isSelected && styles.languageNameSelected]}>
                      {config.label}
                    </Text>
                  </View>
                  <Text style={[styles.languageCode, isSelected && styles.languageNameSelected]}>
                    {isSelected ? '✓' : code.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('Edit Profile')}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>{t('Settings')}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void onRegisterPush()}>
          <Text style={styles.secondaryButtonText}>
            {isRegisteringPush ? t('Registering Push...') : t('Register Push Notifications')}
          </Text>
        </Pressable>
        {pushStatus ? <Text style={styles.meta}>{pushStatus}</Text> : null}
        <Pressable style={styles.dangerButton} onPress={onLogout}>
          <Text style={styles.dangerButtonText}>{t('Logout')}</Text>
        </Pressable>
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
    gap: 10,
  },
  section: {
    gap: 8,
    marginTop: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  value: { fontSize: 18, fontWeight: '600', color: '#0F172A' },
  meta: { fontSize: 14, color: '#64748B' },
  languageList: { gap: 8 },
  languageButton: {
    minHeight: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  languageButtonSelected: {
    backgroundColor: '#000000',
    borderColor: '#1D4ED8',
  },
  languageName: { color: '#0F172A', fontWeight: '700' },
  languageMeta: { color: '#64748B', fontSize: 12 },
  languageNameSelected: { color: '#FFFFFF' },
  languageCode: { color: '#0F172A', fontWeight: '700' },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: { color: '#0F172A', fontWeight: '600' },
  dangerButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: { color: '#FFFFFF', fontWeight: '700' },
});
