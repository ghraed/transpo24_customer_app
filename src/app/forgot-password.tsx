import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
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

export default function ForgotPasswordScreen() {
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const onResetPress = useCallback(async () => {
    setError('');
    setSuccessMessage('');

    if (!email.trim()) {
      setError('Email is required.');
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
        const errorData = (await response.json()) as ForgotPasswordErrorResponse;
        const message = Array.isArray(errorData.message)
          ? errorData.message[0]
          : errorData.message;
        setError(message ?? 'Could not send reset link. Please try again.');
        return;
      }

      const data = (await response.json()) as ForgotPasswordResponse;
      setSuccessMessage(data.message ?? 'If this email exists, a reset link has been sent.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, email]);

  return (
    <View style={styles.container}>
      <View style={styles.backgroundAccent} />

      <View style={styles.card}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>Enter your email to receive a password reset link.</Text>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Email"
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
            <Text style={styles.buttonText}>Send Reset Link</Text>
          )}
        </Pressable>

        <Link href="/" style={styles.linkText}>
          Back to Sign in
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
