import { Link } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { getApiBaseUrl } from '@/config/backend';
import { clientTheme } from '@/components/tracking-ui';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';

interface ForgotPasswordRequest {
  email: string;
}

interface ForgotPasswordResponse {
  message?: string;
}

interface ForgotPasswordErrorResponse {
  message?: string | string[];
}

function getResponseMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as ForgotPasswordErrorResponse | ForgotPasswordResponse;
    const message = parsed?.message;
    if (Array.isArray(message)) {
      return message[0] ?? fallback;
    }
    return message ?? fallback;
  } catch {
    return raw.trim() || fallback;
  }
}

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const keyboardInset = useAndroidKeyboardInset();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onResetPress = useCallback(async () => {
    setError('');
    setSuccessMessage('');

    if (!email.trim()) {
      setError(t('Email is required.'));
      return;
    }

    setIsLoading(true);

    try {
      const payload: ForgotPasswordRequest = {
        email: email.trim().toLowerCase(),
      };

      const response = await fetch(`${apiBaseUrl}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const raw = await response.text();
        setError(getResponseMessage(raw, t('Could not send reset link. Please try again.')));
        return;
      }

      const raw = await response.text();
      setSuccessMessage(
        getResponseMessage(raw, t('If this email exists, a reset link has been sent.')),
      );
    } catch {
      setError(t('Network error. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, email, t]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={clientTheme.background} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            keyboardInset > 0 ? { paddingBottom: 24 + keyboardInset } : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>{t('Password Reset')}</Text>
            <Text style={styles.heroTitle}>{t('Reset your password')}</Text>
            <Text style={styles.heroDescription}>
              {t('Enter your account email and we will send the reset instructions.')}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('Recovery email')}</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('Email')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('Email')}
                placeholderTextColor="#8A94A6"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}
            {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}

            <Pressable
              style={[styles.primaryButton, isLoading ? styles.buttonDisabled : null]}
              onPress={onResetPress}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={clientTheme.text} />
              ) : (
                <Text style={styles.primaryButtonText}>{t('Send reset link')}</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.card}>
            <Link href="/" style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{t('Back to sign in')}</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: clientTheme.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 22,
  },
  heroEyebrow: {
    color: clientTheme.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  heroTitle: {
    color: clientTheme.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 8,
  },
  heroDescription: {
    color: clientTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 24,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 20,
    gap: 14,
  },
  sectionTitle: {
    color: clientTheme.text,
    fontSize: 22,
    fontWeight: '800',
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    color: clientTheme.text,
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: clientTheme.border,
    backgroundColor: clientTheme.surfaceMuted,
    paddingHorizontal: 16,
    color: clientTheme.text,
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: clientTheme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: clientTheme.surfaceMuted,
    borderWidth: 1,
    borderColor: clientTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: clientTheme.text,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    lineHeight: 20,
  },
  successText: {
    color: '#15803D',
    fontSize: 14,
    lineHeight: 20,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
