import { M3LoginColors } from '@/constants/theme';
import { postLogin } from '@/lib/api';
import { setAccessToken } from '@/lib/auth-token';
import { registerCustomerPushNotifications } from '@/notifications/registerPushNotifications';
import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('raed.ghanim.2014@gmail.com');
  const [password, setPassword] = useState<string>('Voltermot1');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const onLoginPress = useCallback(async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setIsLoading(true);
    try {
      const data = await postLogin({ email: email.trim().toLowerCase(), password });
      if (!data.accessToken) {
        setError('Invalid server response. Please try again.');
        return;
      }

      setAccessToken(data.accessToken);
      try {
        await registerCustomerPushNotifications();
      } catch (pushError) {
        // Push registration is best-effort and should not block login.
        console.warn('Customer push registration failed after login.', pushError);
      }

      router.replace('/(tabs)/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [email, password, router]);

  return (
    <View style={styles.container}>
      <View style={styles.backgroundAccent} />
      <View style={styles.logoWrapper}>
        <Image source={require('@/assets/images/run_and_Transpo24.png')} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.card}>

        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue your ride requests</Text>

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

        <Pressable style={[styles.button, isLoading && styles.buttonDisabled]} onPress={onLoginPress} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color={M3LoginColors.onPrimary} /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>

        {/* <Link href="/forgot-password" style={styles.linkText}>
          Forgot your password?
        </Link> */}
        <Link href="/register" style={styles.linkTextSecondary}>
          <Text style={styles.black}>New customer?</Text> Create an account
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
  brandBadge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  brandText: {
    color: M3LoginColors.onPrimary,
    fontSize: 24,
    fontWeight: '700',
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
  linkText: {
    marginTop: 16,
    color: M3LoginColors.primary,
    textAlign: 'center',
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
