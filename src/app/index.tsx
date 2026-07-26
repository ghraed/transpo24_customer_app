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
import { useTranslation } from 'react-i18next';

import { M3LoginColors } from '@/constants/theme';
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
            placeholder={t('Password')}
            placeholderTextColor={M3LoginColors.textTertiary}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={onLoginPress}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={M3LoginColors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>{t('Sign in')}</Text>
          )}
        </Pressable>

        <Link href="/register" style={styles.linkTextSecondary}>
          <Text style={styles.black}>{t('New customer?')}</Text> {t('Create an account')}
        </Link>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: M3LoginColors.background,
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
    backgroundColor: M3LoginColors.background,
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
  black: {
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
  linkTextSecondary: {
    marginTop: 10,
    color: M3LoginColors.linkColor,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 12,
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: M3LoginColors.background,
  },
  logo: {
    width: 400,
    height: 200,
  },
  errorText: {
    color: M3LoginColors.error,
    marginBottom: 8,
    fontSize: 14,
  },
});
