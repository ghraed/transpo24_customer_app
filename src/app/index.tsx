import { Redirect, useRouter } from 'expo-router';
import type { CountryCode } from 'libphonenumber-js';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import { CountryPicker } from '@/components/country-picker';
import { LoginIntroGate } from '@/components/login-intro-gate';
import { clientTheme } from '@/components/tracking-ui';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { sendPhoneVerificationCode } from '@/lib/api';
import { useAuthSession } from '@/lib/auth-token';
import { normalizePhoneNumber } from '@/lib/phone-number';
import { useAppLanguage } from '@/localization/provider';

export default function PhoneLoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL } = useAppLanguage();
  const auth = useAuthSession();
  const keyboardInset = useAndroidKeyboardInset();
  const [country, setCountry] = useState<CountryCode>('LB');
  const [localNumber, setLocalNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const sendCode = useCallback(async () => {
    if (isLoading) return;
    const phoneNumber = normalizePhoneNumber(localNumber, country);
    if (!phoneNumber) {
      setError(t('Enter a valid phone number.'));
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      await sendPhoneVerificationCode(phoneNumber);
      router.push({ pathname: '/verify-phone' as never, params: { phoneNumber } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('Unable to send a verification code.'));
    } finally {
      setIsLoading(false);
    }
  }, [country, isLoading, localNumber, router, t]);

  if (auth.status === 'authenticated') return <Redirect href="/(tabs)/home" />;
  if (auth.status === 'needsProfileCompletion') return <Redirect href={'/complete-profile' as never} />;

  return (
    <LoginIntroGate>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.container, keyboardInset > 0 && { paddingBottom: keyboardInset + 20 }]}>
            <Image source={require('@/assets/images/run_and_Transpo24.png')} style={styles.logo} resizeMode="contain" accessibilityLabel="Transpo24" />
            <View style={styles.card}>
              <View style={styles.smsBadge}><Text style={styles.smsText}>SMS</Text></View>
              <Text style={[styles.title, isRTL && styles.rtl]}>{t('Continue with your phone number')}</Text>
              <Text style={[styles.subtitle, isRTL && styles.rtl]}>{t('We will send a six-digit verification code by SMS.')}</Text>
              <Text style={[styles.label, isRTL && styles.rtl]}>{t('Phone number')}</Text>
              <View style={[styles.phoneField, isRTL && styles.phoneFieldRtl]}>
                <CountryPicker value={country} onChange={setCountry} />
                <TextInput
                  accessibilityLabel={t('Phone number')}
                  style={[styles.phoneInput, isRTL && styles.rtlInput]}
                  value={localNumber}
                  onChangeText={(value) => setLocalNumber(value.replace(/[^\d+() -]/g, ''))}
                  placeholder="70 123 456"
                  placeholderTextColor="#8A94A6"
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  returnKeyType="done"
                  onSubmitEditing={() => void sendCode()}
                />
              </View>
              {error ? <Text accessibilityRole="alert" style={[styles.error, isRTL && styles.rtl]}>{error}</Text> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={t('Send verification code')} style={[styles.button, isLoading && styles.disabled]} disabled={isLoading} onPress={() => void sendCode()}>
                {isLoading ? <ActivityIndicator color="#111827" /> : <Text style={styles.buttonText}>{t('Send verification code')}</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LoginIntroGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: '#FFFFFF' },
  logo: { position: 'absolute', top: 2, alignSelf: 'center', width: 330, height: 160 },
  card: { marginTop: 85, borderRadius: 28, padding: 24, backgroundColor: clientTheme.surface, borderWidth: 1, borderColor: clientTheme.border, elevation: 7, shadowColor: '#111827', shadowOpacity: 0.1, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } },
  smsBadge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2563EB', marginBottom: 16 },
  smsText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  title: { fontSize: 27, lineHeight: 34, fontWeight: '800', color: clientTheme.text },
  subtitle: { marginTop: 8, marginBottom: 22, fontSize: 15, lineHeight: 22, color: clientTheme.textMuted },
  label: { marginBottom: 8, fontSize: 13, color: clientTheme.text, fontWeight: '700' },
  phoneField: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: clientTheme.border, borderRadius: 16, overflow: 'hidden', backgroundColor: clientTheme.surfaceMuted },
  phoneFieldRtl: { flexDirection: 'row-reverse' },
  phoneInput: { flex: 1, minHeight: 56, paddingHorizontal: 14, fontSize: 17, color: clientTheme.text, textAlign: 'left' },
  rtlInput: { textAlign: 'right' }, rtl: { textAlign: 'right', writingDirection: 'rtl' },
  error: { color: '#C62828', fontSize: 14, marginTop: 10 },
  button: { minHeight: 54, borderRadius: 16, backgroundColor: clientTheme.accent, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  disabled: { opacity: 0.65 }, buttonText: { fontSize: 16, fontWeight: '800', color: '#111827' },
});
