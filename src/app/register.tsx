import { Link, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

function getResponseMessage(raw: string, fallback: string): string {
  try {
    const parsed = JSON.parse(raw) as RegisterErrorResponse | RegisterSuccessResponse;
    const message = parsed?.message;
    if (Array.isArray(message)) {
      return message[0] ?? fallback;
    }
    return message ?? fallback;
  } catch {
    return raw.trim() || fallback;
  }
}

export default function RegisterScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const keyboardInset = useAndroidKeyboardInset();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onRegisterPress = useCallback(async () => {
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError(t('Name, email, and password are required.'));
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
        const raw = await response.text();
        setError(getResponseMessage(raw, t('Registration failed. Please try again.')));
        return;
      }

      const raw = await response.text();
      let data: RegisterSuccessResponse;
      try {
        data = JSON.parse(raw) as RegisterSuccessResponse;
      } catch {
        setError(raw.trim() || t('Invalid server response. Please try again.'));
        return;
      }

      if (!data.user && !data.accessToken) {
        setError(t('Invalid server response. Please try again.'));
        return;
      }

      router.replace('/home');
    } catch {
      setError(t('Network error. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }, [apiBaseUrl, email, name, password, router, t]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.container,
            keyboardInset > 0 ? styles.containerKeyboardOpen : undefined,
            keyboardInset > 0 ? { paddingBottom: 24 + keyboardInset } : undefined,
          ]}
        >
          <View style={styles.backgroundAccent} />
          <View style={styles.logoWrapper}>
            <Image
              source={require('@/assets/images/run_and_Transpo24.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{t('Create Account')}</Text>
            <Text style={styles.subtitle}>{t('Join Transpo24 to start making requests')}</Text>

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder={t('Full name')}
                placeholderTextColor="#8A94A6"
                autoCapitalize="words"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputWrapper}>
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

            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                placeholder={t('Password')}
                placeholderTextColor="#8A94A6"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.button, isLoading ? styles.buttonDisabled : null]}
              onPress={onRegisterPress}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={clientTheme.text} />
              ) : (
                <Text style={styles.buttonText}>{t('Create Account')}</Text>
              )}
            </Pressable>

            <Link href="/" style={styles.linkText}>
              {t('Already have an account? Sign in')}
            </Link>
          </View>
        </View>
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
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: clientTheme.background,
    overflow: 'hidden',
  },
  containerKeyboardOpen: {
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  backgroundAccent: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '100%',
    height: '35%',
    backgroundColor: clientTheme.accent,
    opacity: 0.08,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 12,
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: clientTheme.background,
  },
  logo: {
    width: 400,
    height: 200,
  },
  card: {
    backgroundColor: clientTheme.surface,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: clientTheme.border,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    color: clientTheme.text,
  },
  subtitle: {
    fontSize: 15,
    color: clientTheme.textMuted,
    marginBottom: 24,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: clientTheme.surfaceMuted,
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: clientTheme.text,
  },
  button: {
    height: 52,
    borderRadius: 16,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: clientTheme.text,
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    marginTop: 16,
    color: clientTheme.accentStrong,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorText: {
    color: '#DC2626',
    marginBottom: 8,
    fontSize: 14,
  },
});
