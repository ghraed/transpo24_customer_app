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
      <Text style={styles.title}>Create Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Full name"
        autoCapitalize="words"
        value={name}
        onChangeText={setName}
      />

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={[styles.input, styles.passwordInput]}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={onRegisterPress}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Register</Text>
        )}
      </Pressable>

      <Link href="/" style={styles.linkText}>
        Already have an account? Login
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
    marginBottom: 20,
    color: '#111111',
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
  passwordInput: {
    color: '#000000',
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
});
