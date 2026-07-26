import Constants from 'expo-constants';
import { CardField, confirmPayment, confirmPlatformPayPayment, isPlatformPaySupported, PlatformPay } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { M3LoginColors } from '@/constants/theme';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { createWalletTopUp, getWalletTopUpStatus } from '@/lib/api';
import type { CustomerWalletTopUpResponse, PaymentMethod } from '@/types/customer-request';

type PaymentOption = {
  method: PaymentMethod;
  title: string;
  description: string;
};

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    method: 'CREDIT_CARD',
    title: 'Credit Card',
    description: 'Add money using a card entered securely with Stripe.',
  },
  {
    method: 'DEBIT_CARD',
    title: 'Debit Card',
    description: 'Add money using a debit card entered securely with Stripe.',
  },
  {
    method: 'APPLE_PAY',
    title: 'Apple Pay',
    description: 'Use Apple Pay in a development build or production build.',
  },
  {
    method: 'GOOGLE_PAY',
    title: 'Google Pay',
    description: 'Use Google Pay in a development build or production build.',
  },
];

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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            keyboardInset > 0 ? { paddingBottom: 16 + keyboardInset } : undefined,
          ]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Add Money</Text>
          <Text style={styles.heroSubtitle}>
            Funds are added to your app wallet after Stripe confirms the payment.
          </Text>
          <Text style={styles.currencyText}>Wallet currency: {defaultCurrency}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Amount</Text>
          <TextInput
            value={amountValue}
            onChangeText={setAmountValue}
            keyboardType="decimal-pad"
            placeholder="25.00"
            placeholderTextColor="#94A3B8"
            style={styles.input}
          />
          <Text style={styles.hint}>
            {amount > 0 ? `You will add ${formatMoney(amount, defaultCurrency)}.` : 'Enter the amount to top up.'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Payment method</Text>
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
                <View style={styles.optionTextBlock}>
                  <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                    {option.title}
                  </Text>
                  <Text style={[styles.optionDescription, isSelected && styles.optionTitleSelected]}>
                    {option.description}
                  </Text>
                  {isUnsupported ? (
                    <Text style={[styles.optionHint, isSelected && styles.optionTitleSelected]}>
                      Not available on this device/build.
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected ? <View style={styles.radioInner} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {needsCardField ? (
          <View style={styles.section}>
            <Text style={styles.label}>Card details</Text>
            <CardField
              postalCodeEnabled={false}
              placeholders={{ number: '4242 4242 4242 4242' }}
              cardStyle={{
                backgroundColor: '#FFFFFF',
                textColor: '#0F172A',
                placeholderColor: '#94A3B8',
                borderColor: '#CBD5E1',
              }}
              style={styles.cardField}
              onCardChange={(details) => setCardComplete(Boolean(details.complete))}
            />
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        {methodDisabledReason ? <Text style={styles.hint}>{methodDisabledReason}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (Boolean(methodDisabledReason) || isSubmitting) && styles.disabledButton]}
          disabled={Boolean(methodDisabledReason) || isSubmitting}
          onPress={() => void onSubmit()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
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
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 18,
    gap: 8,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroSubtitle: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
  currencyText: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 13,
  },
  section: {
    gap: 10,
  },
  label: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  optionCard: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 14,
  },
  optionCardSelected: {
    borderColor: '#1D4ED8',
    backgroundColor: '#EFF6FF',
  },
  optionTextBlock: {
    flex: 1,
    gap: 4,
  },
  optionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
  },
  optionTitleSelected: {
    color: '#0F172A',
  },
  optionDescription: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 18,
  },
  optionHint: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '600',
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
    borderColor: '#1D4ED8',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1D4ED8',
  },
  cardField: {
    width: '100%',
    height: 52,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },
  errorText: {
    color: M3LoginColors.error,
    fontSize: 14,
  },
  footerText: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
