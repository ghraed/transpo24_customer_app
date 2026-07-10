import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { getApiBaseUrl } from '@/config/backend';
import { M3LoginColors } from '@/constants/theme';

interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

interface RegisterSuccessResponse {
  accessToken?: string;
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  message?: string;
}

interface RegisterErrorResponse {
  message?: string | string[];
}

export default function RegisterScreen() {
  const router = useRouter();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const onRegisterPress = useCallback(async () => {
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email, and password are required.');
      return;
    }

    setIsLoading(true);

    try {
      const payload: RegisterRequest = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      };

      const response = await fetch(`${apiBaseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = (await response.json()) as RegisterErrorResponse;
        const message = Array.isArray(errorData.message)
          ? errorData.message[0]
          : errorData.message;
        setError(message ?? 'Registration failed. Please try again.');
        return;
      }

      const data = (await response.json()) as RegisterSuccessResponse;

      if (!data.user && !data.accessToken) {
        setError('Invalid server response. Please try again.');
        return;
      }

      router.replace('/home');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, email, name, password, router]);

  return (
    <View style={styles.container}>
      <View style={styles.backgroundAccent} />

      <View style={styles.card}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Transpo24 to start making requests</Text>

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={M3LoginColors.textTertiary}
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
          />
        </View>

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

        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={M3LoginColors.textTertiary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={onRegisterPress}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={M3LoginColors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>Create Account</Text>
          )}
        </Pressable>

        <Link href="/" style={styles.linkText}>
          Already have an account? Sign in
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
});
