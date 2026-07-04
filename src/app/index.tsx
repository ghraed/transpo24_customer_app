import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { postLogin } from '@/lib/api';
import { setAccessToken } from '@/lib/auth-token';
import { registerCustomerPushNotifications } from '@/notifications/registerPushNotifications';
export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState<string>('raed.ghanim.2014@gmail.com');
  const [password, setPassword] = useState<string>('Voltermot1');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const onLoginPress = useCallback(async () => {
    setError('');
    if (!email.trim() || !password) { setError('Email and password are required.'); return; }
    setIsLoading(true);
    try {
      const data = await postLogin({ email: email.trim().toLowerCase(), password });
      if (!data.accessToken) { setError('Invalid server response. Please try again.'); return; }
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
    } finally { setIsLoading(false); }
  }, [email, password, router]);
  return <View style={styles.container}><Text style={styles.title}>Customer Login</Text><TextInput style={styles.input} placeholder="Email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={email} onChangeText={setEmail} /><TextInput style={[styles.input, styles.passwordInput]} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />{!!error && <Text style={styles.errorText}>{error}</Text>}<Pressable style={[styles.button, isLoading && styles.buttonDisabled]} onPress={onLoginPress} disabled={isLoading}>{isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}</Pressable><Link href="/forgot-password" style={styles.linkText}>Forgot your password?</Link><Link href="/register" style={styles.linkTextSecondary}>New customer? Create an account</Link></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' }, title: { fontSize: 26, fontWeight: '700', marginBottom: 20, color: '#111111' }, input: { borderWidth: 1, borderColor: '#d0d0d0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 12, backgroundColor: '#ffffff' }, passwordInput: { color: '#000000' }, button: { height: 48, borderRadius: 10, backgroundColor: '#1a73e8', alignItems: 'center', justifyContent: 'center', marginTop: 6 }, buttonDisabled: { opacity: 0.7 }, buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' }, linkText: { marginTop: 16, color: '#1a73e8', textAlign: 'center', fontWeight: '500' }, linkTextSecondary: { marginTop: 12, color: '#2563eb', textAlign: 'center', fontWeight: '500' }, errorText: { color: '#d93025', marginBottom: 8 } });
