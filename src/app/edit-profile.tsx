import { useRouter } from 'expo-router';
import type { CountryCode } from 'libphonenumber-js';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CountryPicker } from '@/components/country-picker';
import { clientTheme } from '@/components/tracking-ui';
import { getCountryLabel, normalizeCountryCode } from '@/lib/country-currency';
import { updateCustomerProfile } from '@/lib/api';
import { updateCustomerSessionProfile, useAuthSession } from '@/lib/auth-token';

export default function EditProfileScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const auth = useAuthSession();
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftCountryCode, setDraftCountryCode] = useState<CountryCode | null>(
    normalizeCountryCode(auth.user?.countryCode),
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const name = draftName ?? auth.user?.name ?? '';
  const countryCode =
    draftCountryCode ??
    normalizeCountryCode(auth.user?.countryCode) ??
    'LB';

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    if (loading) {
      return;
    }

    if (trimmedName.length < 2 || !normalizedCountryCode) {
      setError(t('Enter your full name.'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await updateCustomerProfile(trimmedName, normalizedCountryCode);
      await updateCustomerSessionProfile({
        name: result.name,
        countryCode: result.countryCode,
      });
      router.back();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('Unable to update your profile.'),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>{t('Edit Profile')}</Text>
            <Text style={styles.subtitle}>
              {t('Update your account details below.')}
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('Full name')}</Text>
              <TextInput
                accessibilityLabel={t('Full name')}
                style={styles.input}
                placeholder={t('Full name')}
                value={name}
                onChangeText={setDraftName}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('Country')}</Text>
              <View style={styles.countryPickerWrap}>
                <CountryPicker value={countryCode} onChange={setDraftCountryCode} />
              </View>
              <Text style={styles.countryMeta}>{getCountryLabel(countryCode)}</Text>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('Email')}</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyValue}>{auth.user?.email || t('No email')}</Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>{t('Phone number')}</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyValue}>
                  {auth.user?.phoneNumber || t('No phone number')}
                </Text>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              style={[styles.button, loading && styles.disabled]}
              disabled={loading}
              onPress={() => void submit()}
            >
              {loading ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.buttonText}>{t('Save Changes')}</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 20,
  },
  card: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: clientTheme.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: clientTheme.textMuted,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    color: clientTheme.text,
    backgroundColor: '#FFFFFF',
  },
  countryPickerWrap: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 16,
    justifyContent: 'center',
  },
  countryMeta: {
    fontSize: 13,
    color: clientTheme.textMuted,
  },
  readOnlyField: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
  },
  readOnlyValue: {
    width: '100%',
    fontSize: 16,
    color: clientTheme.textMuted,
  },
  error: {
    color: '#C62828',
  },
  button: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
});
