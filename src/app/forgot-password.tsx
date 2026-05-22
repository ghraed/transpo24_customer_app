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
  const apiBaseUrl = useMemo(() => {
    return process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://10.0.2.2:3000';
  }, []);

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
      <Text style={styles.title}>Reset Password</Text>
      <Text style={styles.subtitle}>Enter your email to receive a password reset link.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}

      <Pressable
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={onResetPress}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send Reset Link</Text>
        )}
      </Pressable>

      <Link href="/" style={styles.linkText}>
        Back to Login
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
    color: '#111111',
  },
  subtitle: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#ffffff',
  },
  button: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    marginTop: 16,
    color: '#1a73e8',
    textAlign: 'center',
    fontWeight: '500',
  },
  errorText: {
    color: '#d93025',
    marginBottom: 8,
  },
  successText: {
    color: '#188038',
    marginBottom: 8,
  },
});
