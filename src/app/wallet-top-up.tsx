import { CardField, confirmPayment, confirmPlatformPayPayment, isPlatformPaySupported, PlatformPay } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { createWalletTopUp, getWalletTopUpStatus } from '@/lib/api';
import type { CustomerWalletTopUpResponse, PaymentMethod } from '@/types/customer-request';

type PaymentOption = {
  method: PaymentMethod;
  title: string;
  description: string;
  icon: SymbolViewProps['name'];
};

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    method: 'CREDIT_CARD',
    title: 'Credit Card',
    description: 'Add money using a card entered securely with Stripe.',
    icon: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' },
  },
  {
    method: 'DEBIT_CARD',
    title: 'Debit Card',
    description: 'Add money using a debit card entered securely with Stripe.',
    icon: { ios: 'creditcard', android: 'payments', web: 'payments' },
  },
  {
    method: 'APPLE_PAY',
    title: 'Apple Pay',
    description: 'Use Apple Pay in a development build or production build.',
    icon: { ios: 'apple.logo', android: 'smartphone', web: 'smartphone' },
  },
  {
    method: 'GOOGLE_PAY',
    title: 'Google Pay',
    description: 'Use Google Pay in a development build or production build.',
    icon: { ios: 'globe', android: 'android', web: 'android' },
  },
];

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function toStripeErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('canceled') || normalized.includes('cancelled')) {
    return 'Payment confirmation was cancelled. You can try again.';
  }

  if (normalized.includes('invalid api key provided')) {
    return 'Stripe is not configured correctly. Set a real EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in the client app and a matching STRIPE_SECRET_KEY in the backend.';
  }

  return message;
}

function isTerminalStatus(status: CustomerWalletTopUpResponse['topUp']['status']): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED';
}

export default function WalletTopUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const keyboardInset = useAndroidKeyboardInset();
  const insets = useSafeAreaInsets();
  const requestedCurrency =
    typeof params.currency === 'string' && params.currency.trim()
      ? params.currency.trim().toUpperCase()
      : '';
  const defaultCurrency =
    requestedCurrency ||
    process.env.EXPO_PUBLIC_DEFAULT_WALLET_CURRENCY?.trim().toUpperCase() ||
    'CHF';
  const amountValueInitial = typeof params.amount === 'string' ? params.amount : '';
  const rawPublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  const publishableKey =
    rawPublishableKey &&
    !rawPublishableKey.startsWith('replace_') &&
    rawPublishableKey.startsWith('pk_')
      ? rawPublishableKey
      : '';
  const merchantCountryCode =
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_COUNTRY_CODE?.trim().toUpperCase() || 'US';
  const merchantIdentifier =
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER?.trim() || '';
  const isExpoGo = Constants.appOwnership === 'expo';

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CREDIT_CARD');
  const [amountValue, setAmountValue] = useState(amountValueInitial);
  const [cardComplete, setCardComplete] = useState(false);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [supportCheckComplete, setSupportCheckComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const amount = useMemo(() => {
    const normalized = Number.parseFloat(amountValue.replace(',', '.'));
    return Number.isFinite(normalized) ? normalized : 0;
  }, [amountValue]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const appleSupported =
          Platform.OS === 'ios' && !isExpoGo
            ? await isPlatformPaySupported()
            : false;
        const googleSupported =
          Platform.OS === 'android' && !isExpoGo
            ? await isPlatformPaySupported({
                googlePay: { testEnv: __DEV__, existingPaymentMethodRequired: false },
              })
            : false;

        if (!active) return;
        setApplePaySupported(appleSupported);
        setGooglePaySupported(googleSupported);
      } finally {
        if (active) {
          setSupportCheckComplete(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [isExpoGo]);

  const needsCardField = selectedMethod === 'CREDIT_CARD' || selectedMethod === 'DEBIT_CARD';
  const methodDisabledReason = useMemo(() => {
    if ((selectedMethod === 'APPLE_PAY' || selectedMethod === 'GOOGLE_PAY') && isExpoGo) {
      return 'Apple Pay and Google Pay require a development build or production build. They are not available in Expo Go.';
    }

    if (selectedMethod === 'APPLE_PAY' && Platform.OS !== 'ios') {
      return 'Apple Pay is only available on iOS.';
    }

    if (selectedMethod === 'GOOGLE_PAY' && Platform.OS !== 'android') {
      return 'Google Pay is only available on Android.';
    }

    if (selectedMethod === 'APPLE_PAY' && !merchantIdentifier) {
      return 'Apple Pay is not configured. Set EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER and rebuild the iOS app.';
    }

    if (!publishableKey) {
      return 'Stripe is not configured. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to a real pk_test_ or pk_live_ key.';
    }

    if (amount <= 0) {
      return 'Enter a valid amount to continue.';
    }

    if (needsCardField && !cardComplete) {
      return 'Complete your card details to continue.';
    }

    return '';
  }, [amount, cardComplete, isExpoGo, merchantIdentifier, needsCardField, publishableKey, selectedMethod]);

  const confirmStripeTopUp = async (topUp: CustomerWalletTopUpResponse['topUp']): Promise<void> => {
    if (!topUp.stripeClientSecret) {
      throw new Error('Missing Stripe client secret from the backend.');
    }

    if (selectedMethod === 'APPLE_PAY') {
      const result = await confirmPlatformPayPayment(topUp.stripeClientSecret, {
        applePay: {
          merchantCountryCode,
          currencyCode: topUp.currency,
          cartItems: [
            {
              label: 'Wallet top-up',
              amount: amount.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
        },
      });

      if (result.error) {
        throw new Error(toStripeErrorMessage(result.error.message));
      }

      return;
    }

    if (selectedMethod === 'GOOGLE_PAY') {
      const result = await confirmPlatformPayPayment(topUp.stripeClientSecret, {
        googlePay: {
          merchantCountryCode,
          currencyCode: topUp.currency,
          testEnv: __DEV__,
        },
      });

      if (result.error) {
        throw new Error(toStripeErrorMessage(result.error.message));
      }

      return;
    }

    const result = await confirmPayment(topUp.stripeClientSecret, {
      paymentMethodType: 'Card',
    });

    if (result.error) {
      throw new Error(toStripeErrorMessage(result.error.message));
    }
  };

  const pollTopUpUntilSettled = async (topUpId: string): Promise<CustomerWalletTopUpResponse> => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const status = await getWalletTopUpStatus(topUpId);
      if (isTerminalStatus(status.topUp.status)) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Wallet top-up is still pending. Please check your wallet again in a moment.');
  };

  const onSubmit = async (): Promise<void> => {
    if (methodDisabledReason || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const createdTopUp = await createWalletTopUp({
        amount,
        currency: defaultCurrency,
        paymentMethod: selectedMethod,
      });
      await confirmStripeTopUp(createdTopUp.topUp);
      const settled = await pollTopUpUntilSettled(createdTopUp.topUp.id);

      if (settled.topUp.status === 'SUCCEEDED') {
        router.replace((`/wallet?refreshTs=${Date.now()}`) as Href);
        return;
      }

      throw new Error(
        settled.topUp.failureReason ||
          (settled.topUp.status === 'CANCELLED'
            ? 'Wallet top-up was cancelled.'
            : 'Wallet top-up failed.'),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to add money to wallet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom + 32, 42) + keyboardInset,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.heroBadge}>
                <IconSymbol
                  name={{ ios: 'plus', android: 'add', web: 'add' }}
                  color="#111827"
                  size={20}
                />
              </View>
              <Text style={styles.heroLabel}>Wallet Top-Up</Text>
            </View>
            <Text style={styles.heroTitle}>Add Money</Text>
            <Text style={styles.heroSubtitle}>
              Funds are added to your app wallet after Stripe confirms the payment.
            </Text>
            <View style={styles.currencyRow}>
              <View style={styles.currencyIconWrap}>
                <IconSymbol
                  name={{ ios: 'creditcard', android: 'payments', web: 'payments' }}
                  color="#111827"
                  size={16}
                />
              </View>
              <Text style={styles.currencyText}>Wallet currency: {defaultCurrency}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Amount</Text>
            <TextInput
              value={amountValue}
              onChangeText={setAmountValue}
              keyboardType="decimal-pad"
              placeholder="25.00"
              placeholderTextColor="#98A2B3"
              style={styles.input}
            />
            <Text style={styles.hint}>
              {amount > 0 ? `You will add ${formatMoney(amount, defaultCurrency)}.` : 'Enter the amount to top up.'}
            </Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Payment method</Text>
            {PAYMENT_OPTIONS.map((option) => {
              const isSelected = option.method === selectedMethod;
              const isUnsupported =
                (option.method === 'APPLE_PAY' && (!supportCheckComplete || !applePaySupported)) ||
                (option.method === 'GOOGLE_PAY' && (!supportCheckComplete || !googlePaySupported));

              return (
                <Pressable
                  key={option.method}
                  style={[styles.optionCard, isSelected && styles.optionCardSelected]}
                  onPress={() => setSelectedMethod(option.method)}
                >
                  <View style={styles.optionLeading}>
                    <View style={styles.optionIconWrap}>
                      <IconSymbol name={option.icon} color="#111827" size={18} />
                    </View>
                    <View style={styles.optionTextBlock}>
                      <Text style={styles.optionTitle}>{option.title}</Text>
                      <Text style={styles.optionDescription}>{option.description}</Text>
                      {isUnsupported ? (
                        <Text style={styles.optionHint}>Not available on this device/build.</Text>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                    {isSelected ? <View style={styles.radioInner} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {needsCardField ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Card details</Text>
              <View style={styles.cardFieldWrap}>
                <CardField
                  postalCodeEnabled={false}
                  placeholders={{ number: '4242 4242 4242 4242' }}
                  cardStyle={{
                    backgroundColor: '#F8FAFC',
                    textColor: '#111827',
                    placeholderColor: '#98A2B3',
                    borderColor: '#E5E7EB',
                    borderWidth: 1,
                    borderRadius: 18,
                  }}
                  style={styles.cardField}
                  onCardChange={(details) => setCardComplete(Boolean(details.complete))}
                />
              </View>
            </View>
          ) : null}

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          {methodDisabledReason ? <Text style={styles.hint}>{methodDisabledReason}</Text> : null}

          <Pressable
            style={[
              styles.primaryButton,
              (Boolean(methodDisabledReason) || isSubmitting) && styles.disabledButton,
            ]}
            disabled={Boolean(methodDisabledReason) || isSubmitting}
            onPress={() => void onSubmit()}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#111827" />
            ) : (
              <Text style={styles.primaryButtonText}>Confirm Top-Up</Text>
            )}
          </Pressable>

          <Text style={styles.footerText}>
            Saved cards are not used automatically for wallet top-ups in this version.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
  },
  heroSubtitle: {
    color: '#68768A',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  currencyIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF7E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyText: {
    color: '#68768A',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  input: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  hint: {
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  optionCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    marginTop: 12,
  },
  optionCardSelected: {
    borderColor: '#FFC548',
    backgroundColor: '#FFF7E1',
  },
  optionLeading: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  optionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextBlock: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  optionDescription: {
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
  },
  optionHint: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#D89A1A',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D89A1A',
  },
  cardFieldWrap: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardField: {
    width: '100%',
    height: 56,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
  },
  footerText: {
    color: '#68768A',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
