import { Link } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getApiBaseUrl } from '@/config/backend';
import { M3LoginColors } from '@/constants/theme';

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
        getResponseMessage(
          raw,
          t('If this email exists, a reset link has been sent.'),
        ),
      );
    } catch {
      setError(t('Network error. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, email, t]);

  return (
    <View style={styles.container}>
      <View style={styles.backgroundAccent} />

      <View style={styles.card}>
        <Text style={styles.title}>{t('Reset Password')}</Text>
        <Text style={styles.subtitle}>
          {t('Enter your email to receive a password reset link.')}
        </Text>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder={t('Email')}
            placeholderTextColor={M3LoginColors.textTertiary}
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
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={onResetPress}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={M3LoginColors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('Send Reset Link')}</Text>
          )}
        </Pressable>

        <Link href="/" style={styles.linkText}>
          {t('Back to Sign in')}
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: M3LoginColors.background,
    overflow: 'hidden',
  },
  backgroundAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '100%',
    height: '35%',
    backgroundColor: M3LoginColors.primaryContainer,
    opacity: 0.06,
  },
  card: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: M3LoginColors.textSecondary,
    marginBottom: 24,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: M3LoginColors.surfaceContainer,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: M3LoginColors.textPrimary,
  },
  button: {
    height: 52,
    borderRadius: 16,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: M3LoginColors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    marginTop: 16,
    color: M3LoginColors.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorText: {
    color: M3LoginColors.error,
    marginBottom: 8,
    fontSize: 14,
  },
  successText: {
    color: '#188038',
    marginBottom: 8,
    fontSize: 14,
  },
});
