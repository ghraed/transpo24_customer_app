import { Redirect, useRouter } from 'expo-router';
import type { CountryCode } from 'libphonenumber-js';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CountryPicker } from '@/components/country-picker';
import { clientTheme } from '@/components/tracking-ui';
import { normalizeCountryCode } from '@/lib/country-currency';
import { completeCustomerProfile } from '@/lib/api';
import { markProfileCompleted, useAuthSession } from '@/lib/auth-token';

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const auth = useAuthSession();
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>('LB');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (auth.status === 'authenticated') return <Redirect href="/(tabs)/home" />;
  if (auth.status === 'unauthenticated') return <Redirect href="/" />;

  const submit = async (): Promise<void> => {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    if (loading || name.trim().length < 2 || !normalizedCountryCode) {
      if (!loading) setError(t('Enter your full name.'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await completeCustomerProfile(name.trim(), normalizedCountryCode);
      await markProfileCompleted(result.name, result.countryCode);
      router.dismissAll();
      router.replace('/(tabs)/home');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('Unable to complete your profile.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('Complete your profile')}</Text>
        <Text style={styles.subtitle}>{t('Tell us your name before creating your first request.')}</Text>
        <View style={styles.countryField}>
          <Text style={styles.countryLabel}>{t('Country')}</Text>
          <View style={styles.countryPickerWrap}>
            <CountryPicker value={countryCode} onChange={setCountryCode} />
          </View>
        </View>
        <TextInput accessibilityLabel={t('Full name')} style={styles.input} placeholder={t('Full name')} value={name} onChangeText={setName} autoCapitalize="words" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.button, loading && styles.disabled]} disabled={loading} onPress={() => void submit()}>
          {loading ? <ActivityIndicator color="#111827" /> : <Text style={styles.buttonText}>{t('Continue')}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '800', color: clientTheme.text },
  subtitle: { marginTop: 8, marginBottom: 24, fontSize: 15, lineHeight: 22, color: clientTheme.textMuted },
  countryField: { marginBottom: 16 },
  countryLabel: { marginBottom: 8, fontSize: 13, fontWeight: '700', color: '#374151' },
  countryPickerWrap: { minHeight: 56, borderWidth: 1, borderColor: clientTheme.border, borderRadius: 16, justifyContent: 'center' },
  input: { minHeight: 56, borderWidth: 1, borderColor: clientTheme.border, borderRadius: 16, paddingHorizontal: 16, fontSize: 16, color: clientTheme.text },
  error: { marginTop: 10, color: '#C62828' },
  button: { minHeight: 54, borderRadius: 16, backgroundColor: clientTheme.accent, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  disabled: { opacity: 0.6 }, buttonText: { fontSize: 16, fontWeight: '800', color: '#111827' },
});
