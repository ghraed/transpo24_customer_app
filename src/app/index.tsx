import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

import { LoginIntroGate } from '@/components/login-intro-gate';
import { clientTheme } from '@/components/tracking-ui';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { postLogin } from '@/lib/api';
import { setAccessToken } from '@/lib/auth-token';
import { registerCustomerPushNotifications } from '@/notifications/registerPushNotifications';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('raed.ghanim.2014@gmail.com');
  const [password, setPassword] = useState('Voltermot1');
  const keyboardInset = useAndroidKeyboardInset();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onLoginPress = useCallback(async () => {
    setError('');
    if (!email.trim() || !password) {
      setError(t('Email and password are required.'));
      return;
    }

    setIsLoading(true);
    try {
      const data = await postLogin({ email: email.trim().toLowerCase(), password });
      if (!data.accessToken) {
        setError(t('Invalid server response. Please try again.'));
        return;
      }

      await setAccessToken(data.accessToken);
      try {
        await registerCustomerPushNotifications();
      } catch (pushError) {
        console.warn('Customer push registration failed after login.', pushError);
      }

      router.replace('/(tabs)/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Network error. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }, [email, password, router, t]);

  return (
    <LoginIntroGate>
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
              <Text style={styles.title}>{t('Welcome back')}</Text>
              <Text style={styles.subtitle}>{t('Sign in to continue your ride requests')}</Text>

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
                onPress={onLoginPress}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={clientTheme.text} />
                ) : (
                  <Text style={styles.buttonText}>{t('Sign in')}</Text>
                )}
              </Pressable>

              <Link href="/forgot-password" style={styles.linkText}>
                {t('Forgot your password?')}
              </Link>

              <Link href="/register" style={styles.linkTextSecondary}>
                <Text style={styles.linkTextBlack}>{t('New customer?')}</Text>{' '}
                {t('Create an account')}
              </Link>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LoginIntroGate>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
    opacity: 1,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 12,
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#FFFFFF',
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
  linkTextSecondary: {
    marginTop: 10,
    color: clientTheme.accentStrong,
    fontWeight: '700',
    textAlign: 'center',
  },
  linkTextBlack: {
    color: clientTheme.text,
  },
  errorText: {
    color: '#DC2626',
    marginBottom: 8,
    fontSize: 14,
  },
});
