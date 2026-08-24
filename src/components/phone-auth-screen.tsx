import { Redirect, useRouter } from 'expo-router';
import type { CountryCode } from 'libphonenumber-js';
import { useCallback, useEffect, useState } from 'react';
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
import {
  sendPhoneVerificationCode,
  skipPhoneVerificationForTemporaryTestCustomer,
} from '@/lib/api';
import {
  getTrustedCustomer,
  restoreTrustedCustomerSession,
  setCustomerSession,
  useAuthSession,
} from '@/lib/auth-token';
import { registerCustomerPushNotifications } from '@/notifications/registerPushNotifications';
import { normalizePhoneNumber } from '@/lib/phone-number';
import {
  LANGUAGE_CONFIGS,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from '@/localization/languages';
import { useAppLanguage } from '@/localization/provider';

type PhoneAuthScreenProps = {
  mode: 'login' | 'register';
};

export function PhoneAuthScreen({ mode }: PhoneAuthScreenProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const {
    hasSavedLanguage,
    isChangingLanguage,
    isRTL,
    setLanguage,
  } = useAppLanguage();
  const auth = useAuthSession();
  const keyboardInset = useAndroidKeyboardInset();
  const [country, setCountry] = useState<CountryCode>('LB');
  const [localNumber, setLocalNumber] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasAcceptedLegal, setHasAcceptedLegal] = useState(false);
  const [trustedPhoneNumber, setTrustedPhoneNumber] = useState('');
  const [isLoadingTrustedSession, setIsLoadingTrustedSession] = useState(mode === 'login');
  const [isUsingDifferentPhoneNumber, setIsUsingDifferentPhoneNumber] = useState(false);
  const [isRestoringTrustedSession, setIsRestoringTrustedSession] = useState(false);
  const [isSkippingVerification, setIsSkippingVerification] = useState(false);

  const normalizedPhoneNumber = normalizePhoneNumber(localNumber, country);
  const hasTrustedCustomer = mode === 'login' && Boolean(trustedPhoneNumber);
  const showTrustedCustomerChoice = hasTrustedCustomer && !isUsingDifferentPhoneNumber;
  const needsDefaultLanguage = mode === 'register' && !hasSavedLanguage;

  useEffect(() => {
    if (mode !== 'login') return;

    let isActive = true;
    void getTrustedCustomer()
      .then((customer) => {
        if (isActive) setTrustedPhoneNumber(customer?.phoneNumber ?? '');
      })
      .finally(() => {
        if (isActive) setIsLoadingTrustedSession(false);
      });

    return () => {
      isActive = false;
    };
  }, [mode]);

  const sendCode = useCallback(async () => {
    if (isLoading) return;

    if (mode === 'register' && !hasAcceptedLegal) {
      setError(t('Please accept the Terms of Service and Privacy Policy to create an account.'));
      return;
    }

    if (!normalizedPhoneNumber) {
      setError(t('Enter a valid phone number.'));
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await sendPhoneVerificationCode(normalizedPhoneNumber);
      router.push({ pathname: '/verify-phone' as never, params: { phoneNumber: normalizedPhoneNumber } });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('Unable to send a verification code.'),
      );
    } finally {
      setIsLoading(false);
    }
  }, [hasAcceptedLegal, isLoading, mode, normalizedPhoneNumber, router, t]);

  const continueTrustedSession = useCallback(async () => {
    if (!hasTrustedCustomer || isRestoringTrustedSession) return;

    setError('');
    setIsRestoringTrustedSession(true);
    const result = await restoreTrustedCustomerSession();
    if (result.status === 'invalid') {
      setTrustedPhoneNumber('');
      setError(t('Unable to continue. Please request a verification code.'));
    } else if (result.status === 'unavailable') {
      setError(t('Your saved device is still trusted. Check your connection and try again.'));
    }
    setIsRestoringTrustedSession(false);
  }, [hasTrustedCustomer, isRestoringTrustedSession, t]);

  const useDifferentPhoneNumber = useCallback(() => {
    setError('');
    setLocalNumber('');
    setIsUsingDifferentPhoneNumber(true);
  }, []);

  const useTrustedPhoneNumber = useCallback(() => {
    setError('');
    setLocalNumber('');
    setIsUsingDifferentPhoneNumber(false);
  }, []);

  const skipVerification = useCallback(async () => {
    if (isSkippingVerification) return;

    setError('');
    setIsSkippingVerification(true);
    try {
      const session = await skipPhoneVerificationForTemporaryTestCustomer();
      await setCustomerSession(session);
      void registerCustomerPushNotifications().catch(() => undefined);
      router.dismissAll();
      router.replace((session.profileCompleted ? '/(tabs)/home' : '/complete-profile') as never);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('Unable to sign in to the temporary test account.'),
      );
    } finally {
      setIsSkippingVerification(false);
    }
  }, [isSkippingVerification, router, t]);

  const handleCountryChange = useCallback((nextCountry: CountryCode) => {
    setCountry(nextCountry);
  }, []);

  const handleNumberChange = useCallback((value: string) => {
    setLocalNumber(value.replace(/[^\d+() -]/g, ''));
  }, []);

  const goToAlternateScreen = useCallback(() => {
    if (mode === 'login') {
      router.push('/register');
      return;
    }

    router.replace('/');
  }, [mode, router]);

  const selectDefaultLanguage = useCallback((nextLanguage: AppLanguage) => {
    setError('');
    void setLanguage(nextLanguage);
  }, [setLanguage]);

  if (auth.status === 'authenticated') return <Redirect href="/(tabs)/home" />;
  if (auth.status === 'needsProfileCompletion') return <Redirect href={'/complete-profile' as never} />;

  return (
    <LoginIntroGate>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.container,
              keyboardInset > 0 && styles.containerKeyboardOpen,
              keyboardInset > 0 && { paddingBottom: keyboardInset + 20 },
            ]}
          >
            <View style={[styles.brandHeader, keyboardInset > 0 && styles.brandHeaderCompact]}>
              <Image
                source={require('@/assets/images/run_and_Transpo24.png')}
                style={[styles.logo, keyboardInset > 0 && styles.logoCompact]}
                resizeMode="contain"
                accessibilityLabel="Transpo24"
              />
            </View>
            <View style={styles.card}>
              {mode === 'login' ? (
                <Text style={[styles.title, isRTL && styles.rtl]}>
                  {t('Continue with your phone number')}
                </Text>
              ) : null}
              {error ? (
                <Text accessibilityRole="alert" style={[styles.error, isRTL && styles.rtl]}>
                  {error}
                </Text>
              ) : null}
              {needsDefaultLanguage ? (
                <View>
                  <Text style={[styles.title, isRTL && styles.rtl]}>{t('Select language')}</Text>
                  <Text style={[styles.languageHelp, isRTL && styles.rtl]}>
                    {t('Choose the app language before confirming the switch.')}
                  </Text>
                  <View style={styles.languageChoices}>
                    {SUPPORTED_LANGUAGES.map((code) => {
                      const config = LANGUAGE_CONFIGS[code];
                      return (
                        <Pressable
                          key={code}
                          accessibilityRole="button"
                          accessibilityLabel={config.nativeLabel}
                          style={[styles.languageChoice, isChangingLanguage && styles.disabled]}
                          disabled={isChangingLanguage}
                          onPress={() => selectDefaultLanguage(code)}
                        >
                          <Text style={styles.languageChoiceNative}>{config.nativeLabel}</Text>
                          <Text style={styles.languageChoiceLabel}>{t(config.label)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : isLoadingTrustedSession ? (
                <View style={styles.trustedSessionLoading}>
                  <ActivityIndicator color="#9A6500" />
                </View>
              ) : showTrustedCustomerChoice ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Continue as {{phone}}', { phone: trustedPhoneNumber })}
                    style={[styles.secondaryButton, isRestoringTrustedSession && styles.disabled]}
                    disabled={isRestoringTrustedSession}
                    onPress={() => void continueTrustedSession()}
                  >
                    {isRestoringTrustedSession ? (
                      <ActivityIndicator color="#9A6500" />
                    ) : (
                      <Text style={styles.secondaryButtonText}>
                        {t('Continue as {{phone}}', { phone: trustedPhoneNumber })}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.secondaryButton}
                    onPress={useDifferentPhoneNumber}
                  >
                    <Text style={styles.secondaryButtonText}>{t('Use a different phone number')}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {hasTrustedCustomer ? (
                    <Pressable accessibilityRole="button" onPress={useTrustedPhoneNumber}>
                      <Text style={styles.useTrustedPhoneText}>
                        {t('Continue as {{phone}}', { phone: trustedPhoneNumber })}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text style={[styles.label, isRTL && styles.rtl]}>{t('Phone number')}</Text>
                  <View style={[styles.phoneField, isRTL && styles.phoneFieldRtl]}>
                    <CountryPicker value={country} onChange={handleCountryChange} displayMode="callingCode" />
                    <TextInput
                      accessibilityLabel={t('Phone number')}
                      style={[styles.phoneInput, isRTL && styles.rtlInput]}
                      value={localNumber}
                      onChangeText={handleNumberChange}
                      placeholder="70 123 456"
                      placeholderTextColor="#8A94A6"
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      returnKeyType="done"
                      onSubmitEditing={() => void sendCode()}
                    />
                  </View>
                  {mode === 'register' ? (
                    <View style={styles.legalConsent}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: hasAcceptedLegal }}
                        accessibilityLabel={t('Agree to Terms of Service and Privacy Policy')}
                        style={[styles.checkbox, hasAcceptedLegal && styles.checkboxChecked]}
                        onPress={() => {
                          setError('');
                          setHasAcceptedLegal((accepted) => !accepted);
                        }}
                      >
                        {hasAcceptedLegal ? <Text style={styles.checkmark}>✓</Text> : null}
                      </Pressable>
                      <View style={styles.legalCopy}>
                        <Text style={[styles.legalText, isRTL && styles.rtl]}>
                          {t('I agree to the')}
                        </Text>
                        <Pressable
                          accessibilityRole="link"
                          onPress={() => router.push('/legal?document=terms' as never)}
                        >
                          <Text style={[styles.legalLink, isRTL && styles.rtl]}>{t('Terms of Service')}</Text>
                        </Pressable>
                        <Text style={[styles.legalText, isRTL && styles.rtl]}>{t('and')}</Text>
                        <Pressable
                          accessibilityRole="link"
                          onPress={() => router.push('/legal?document=privacy' as never)}
                        >
                          <Text style={[styles.legalLink, isRTL && styles.rtl]}>{t('Privacy Policy')}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Send verification code')}
                    style={[styles.button, (isLoading || (mode === 'register' && !hasAcceptedLegal)) && styles.disabled]}
                    disabled={isLoading || (mode === 'register' && !hasAcceptedLegal)}
                    onPress={() => void sendCode()}
                  >
                    {isLoading ? <ActivityIndicator color="#111827" /> : <Text style={styles.buttonText}>{t('Send verification code')}</Text>}
                  </Pressable>
                  {mode === 'login' && __DEV__ ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('Skip verification')}
                      style={[styles.secondaryButton, isSkippingVerification && styles.disabled]}
                      disabled={isSkippingVerification}
                      onPress={() => void skipVerification()}
                    >
                      {isSkippingVerification ? (
                        <ActivityIndicator color="#9A6500" />
                      ) : (
                        <Text style={styles.secondaryButtonText}>{t('Skip verification')}</Text>
                      )}
                    </Pressable>
                  ) : null}
                </>
              )}
              <View style={styles.footerRow}>
                {mode === 'login' ? (
                  <>
                    <Text style={[styles.footerText, isRTL && styles.rtl]}>{t('New customer?')}</Text>
                    <Pressable onPress={goToAlternateScreen} accessibilityRole="button">
                      <Text style={[styles.footerLink, isRTL && styles.rtl]}>
                        {t('Create an account')}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable onPress={goToAlternateScreen} accessibilityRole="button">
                    <Text style={[styles.footerLink, isRTL && styles.rtl]}>
                      {t('Already have an account? Sign in')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LoginIntroGate>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 22,
    backgroundColor: '#FFFFFF',
  },
  containerKeyboardOpen: {
    paddingTop: 0,
  },
  brandHeader: {
    height: 224,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandHeaderCompact: {
    height: 108,
  },
  logo: {
    width: 540,
    maxWidth: '100%',
    height: 294,
  },
  logoCompact: {
    width: 230,
    height: 96,
  },
  card: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    elevation: 7,
    shadowColor: '#111827',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  trustedSessionLoading: { minHeight: 116, alignItems: 'center', justifyContent: 'center' },
  useTrustedPhoneText: { color: '#9A6500', fontSize: 14, fontWeight: '800', marginBottom: 14 },
  title: { fontSize: 18, lineHeight: 34, fontWeight: '800', color: clientTheme.text, marginBottom: 22 },
  label: { marginBottom: 8, fontSize: 13, color: clientTheme.text, fontWeight: '700' },
  phoneField: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: clientTheme.surfaceMuted,
  },
  phoneFieldRtl: { flexDirection: 'row-reverse' },
  phoneInput: {
    flex: 1,
    minHeight: 56,
    paddingHorizontal: 14,
    fontSize: 17,
    color: clientTheme.text,
    textAlign: 'left',
  },
  rtlInput: { textAlign: 'right' },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  error: { color: '#C62828', fontSize: 14, marginTop: 10 },
  languageHelp: { color: clientTheme.textMuted, fontSize: 14, lineHeight: 21, marginTop: -14, marginBottom: 18 },
  languageChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  languageChoice: {
    flexGrow: 1,
    flexBasis: '47%',
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1A52A',
    backgroundColor: '#FFF9E8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  languageChoiceNative: { color: clientTheme.text, fontSize: 15, fontWeight: '800' },
  languageChoiceLabel: { color: '#9A6500', fontSize: 12, marginTop: 2 },
  legalConsent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 18,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#B9850C',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: { backgroundColor: '#F6C90E' },
  checkmark: { color: '#111827', fontSize: 16, fontWeight: '900', lineHeight: 18 },
  legalCopy: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 1 },
  legalText: { color: clientTheme.textMuted, fontSize: 13, lineHeight: 20 },
  legalLink: { color: '#8A5B00', fontSize: 13, fontWeight: '800', lineHeight: 20 },
  button: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1A52A',
    backgroundColor: '#FFF9E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  disabled: { opacity: 0.65 },
  buttonText: { fontSize: 16, fontWeight: '800', color: '#111827' },
  secondaryButtonText: { fontSize: 15, fontWeight: '800', color: '#9A6500' },
  footerRow: {
    marginTop: 18,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerText: { fontSize: 14, color: clientTheme.textMuted },
  footerLink: { fontSize: 14, fontWeight: '800', color: '#9A6500' },
});
