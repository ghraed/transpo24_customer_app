import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CardField,
  confirmPayment,
  confirmPlatformPayPayment,
  isPlatformPaySupported,
  PlatformPay,
} from '@stripe/stripe-react-native';

import { cancelPaymentHold, confirmDriverOffer } from '@/lib/api';
import type {
  CustomerRequestOfferSummary,
  PaymentMethod,
  PaymentSummary,
  RequestStatusResponse,
} from '@/types/customer-request';

type PaymentOption = {
  method: PaymentMethod;
  title: string;
  description: string;
};

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    method: 'CREDIT_CARD',
    title: 'Credit Card',
    description: 'Authorize the amount now and capture it after delivery.',
  },
  {
    method: 'DEBIT_CARD',
    title: 'Debit Card',
    description: 'Authorize the amount now and capture it after delivery.',
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
  {
    method: 'APP_WALLET',
    title: 'App Wallet',
    description: 'Reserve the amount from your in-app wallet balance.',
  },
];

function parseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = currency?.trim() || 'USD';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function getPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'CREDIT_CARD':
      return 'Credit card';
    case 'DEBIT_CARD':
      return 'Debit card';
    case 'APPLE_PAY':
      return 'Apple Pay';
    case 'GOOGLE_PAY':
      return 'Google Pay';
    case 'APP_WALLET':
      return 'App wallet';
    default:
      return method;
  }
}

function buildTrackingHref(request: RequestStatusResponse): Href {
  return {
    pathname: '/customer-tracking',
    params: {
      tripId: request.id,
      pickupLatitude: String(request.pickupLocation.latitude),
      pickupLongitude: String(request.pickupLocation.longitude),
      pickupAddress: request.pickupLocation.address ?? '',
      dropoffLatitude: String(request.dropoffLocation.latitude),
      dropoffLongitude: String(request.dropoffLocation.longitude),
      dropoffAddress: request.dropoffLocation.address ?? '',
    },
  };
}

function toStripeErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('canceled') || normalized.includes('cancelled')) {
    return 'Payment confirmation was cancelled. You can try again.';
  }

  return message;
}

export default function RequestPaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const offerId = typeof params.offerId === 'string' ? params.offerId.trim() : '';
  const requestData = useMemo(
    () => parseJson<RequestStatusResponse>(typeof params.request === 'string' ? params.request : undefined),
    [params.request],
  );
  const offerData = useMemo(
    () => parseJson<CustomerRequestOfferSummary>(typeof params.offer === 'string' ? params.offer : undefined),
    [params.offer],
  );

  const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  const merchantCountryCode =
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_COUNTRY_CODE?.trim().toUpperCase() || 'US';
  const merchantIdentifier =
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER?.trim() || 'merchant.com.example.transpo24';
  const isExpoGo = Constants.expoGoConfig != null;

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CREDIT_CARD');
  const [cardComplete, setCardComplete] = useState<boolean>(false);
  const [applePaySupported, setApplePaySupported] = useState<boolean>(false);
  const [googlePaySupported, setGooglePaySupported] = useState<boolean>(false);
  const [supportCheckComplete, setSupportCheckComplete] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [paymentResult, setPaymentResult] = useState<PaymentSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const amount = offerData ? offerData.proposedPrice ?? offerData.price : 0;
  const currency = offerData?.currency ?? 'USD';
  const hasValidTrackingData = Boolean(
    requestData &&
      requestData.pickupLocation.latitude !== null &&
      requestData.pickupLocation.longitude !== null &&
      requestData.dropoffLocation.latitude !== null &&
      requestData.dropoffLocation.longitude !== null,
  );

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

  const selectedOption = PAYMENT_OPTIONS.find((option) => option.method === selectedMethod) ?? PAYMENT_OPTIONS[0];
  const needsStripe = selectedMethod !== 'APP_WALLET';
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

    if (selectedMethod === 'APPLE_PAY' && supportCheckComplete && !applePaySupported) {
      return 'Apple Pay is not available on this device right now.';
    }

    if (selectedMethod === 'GOOGLE_PAY' && supportCheckComplete && !googlePaySupported) {
      return 'Google Pay is not available on this device right now.';
    }

    if (needsStripe && !publishableKey) {
      return 'EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing.';
    }

    if (!requestData || !offerData || !requestId || !offerId) {
      return 'Missing payment context. Please go back and choose the offer again.';
    }

    if (needsCardField && !cardComplete) {
      return 'Complete your card details to continue.';
    }

    return '';
  }, [
    applePaySupported,
    googlePaySupported,
    isExpoGo,
    needsCardField,
    needsStripe,
    offerData,
    offerId,
    publishableKey,
    requestData,
    requestId,
    selectedMethod,
    supportCheckComplete,
    cardComplete,
  ]);

  const submitLabel = useMemo(() => {
    if (selectedMethod === 'APP_WALLET') return 'Hold Amount from Wallet';
    if (selectedMethod === 'APPLE_PAY') return 'Authorize with Apple Pay';
    if (selectedMethod === 'GOOGLE_PAY') return 'Authorize with Google Pay';
    return 'Authorize Payment Hold';
  }, [selectedMethod]);

  const navigateToNextStep = (payment: PaymentSummary): void => {
    if (requestData && hasValidTrackingData) {
      router.replace(buildTrackingHref(requestData));
      return;
    }

    router.replace({
      pathname: '/request-status',
      params: {
        requestId: payment.requestId,
      },
    });
  };

  const confirmStripeBackedPayment = async (payment: PaymentSummary): Promise<void> => {
    if (!payment.stripeClientSecret) {
      throw new Error('Missing Stripe client secret from the backend.');
    }

    if (selectedMethod === 'APPLE_PAY') {
      const result = await confirmPlatformPayPayment(payment.stripeClientSecret, {
        applePay: {
          merchantCountryCode,
          currencyCode: payment.currency,
          cartItems: [
            {
              label: 'Transport request',
              amount: payment.heldAmount.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
            {
              label: 'Transpo 24',
              amount: payment.heldAmount.toFixed(2),
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
      const result = await confirmPlatformPayPayment(payment.stripeClientSecret, {
        googlePay: {
          testEnv: __DEV__,
          merchantCountryCode,
          currencyCode: payment.currency,
          merchantName: 'Transpo 24',
        },
      });

      if (result.error) {
        throw new Error(toStripeErrorMessage(result.error.message));
      }

      return;
    }

    const result = await confirmPayment(payment.stripeClientSecret, {
      paymentMethodType: 'Card',
    });

    if (result.error) {
      throw new Error(toStripeErrorMessage(result.error.message));
    }
  };

  const onSubmit = async (): Promise<void> => {
    if (isSubmitting || methodDisabledReason) {
      if (methodDisabledReason) {
        setErrorMessage(methodDisabledReason);
      }
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    let createdPayment: PaymentSummary | null = null;

    try {
      const response = await confirmDriverOffer(requestId, offerId, {
        confirm: true,
        paymentMethod: selectedMethod,
      });

      createdPayment = response.payment;
      setPaymentResult(response.payment);

      if (selectedMethod !== 'APP_WALLET') {
        await confirmStripeBackedPayment(response.payment);
      }

      navigateToNextStep(response.payment);
    } catch (error) {
      if (createdPayment && selectedMethod !== 'APP_WALLET') {
        try {
          const releasedPayment = await cancelPaymentHold(requestId);
          setPaymentResult(releasedPayment);
        } catch {
          // Keep the original error visible; the customer can still refresh request status if release fails.
        }
      }

      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to authorize the payment hold.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!requestData || !offerData || !requestId || !offerId) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>
          Missing payment context. Please go back and choose the driver again.
        </Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Confirm Payment Hold</Text>
          <Text style={styles.subtitle}>
            We’ll place a hold on the agreed amount now and capture it only after final delivery is confirmed.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          <Text style={styles.label}>Selected driver</Text>
          <Text style={styles.value}>{offerData.driverName || 'Driver'}</Text>
          <Text style={styles.label}>Agreed amount</Text>
          <Text style={styles.value}>{formatMoney(amount, currency)}</Text>
          <Text style={styles.label}>Pickup</Text>
          <Text style={styles.value}>{requestData.pickupLocation.address || 'N/A'}</Text>
          <Text style={styles.label}>Estimated pickup</Text>
          <Text style={styles.value}>{formatDate(offerData.estimatedPickupAt)}</Text>
          <Text style={styles.helperText}>
            The agreed amount will be held now and will only be permanently deducted after final delivery is confirmed.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Choose Payment Method</Text>
          {PAYMENT_OPTIONS.map((option) => {
            const isSelected = option.method === selectedMethod;
            const isUnavailableInExpoGo =
              isExpoGo && (option.method === 'APPLE_PAY' || option.method === 'GOOGLE_PAY');
            const isUnavailableOnPlatform =
              (option.method === 'APPLE_PAY' && Platform.OS !== 'ios') ||
              (option.method === 'GOOGLE_PAY' && Platform.OS !== 'android');

            return (
              <Pressable
                key={option.method}
                style={[styles.methodCard, isSelected ? styles.methodCardSelected : undefined]}
                onPress={() => setSelectedMethod(option.method)}
              >
                <Text style={styles.methodTitle}>{option.title}</Text>
                <Text style={styles.methodDescription}>{option.description}</Text>
                {isUnavailableInExpoGo ? (
                  <Text style={styles.methodHint}>
                    Development build required. Native wallets do not work in Expo Go.
                  </Text>
                ) : null}
                {isUnavailableOnPlatform ? (
                  <Text style={styles.methodHint}>This payment method is not available on this platform.</Text>
                ) : null}
                {option.method === 'APPLE_PAY' && supportCheckComplete && Platform.OS === 'ios' && !isExpoGo && !applePaySupported ? (
                  <Text style={styles.methodHint}>Apple Pay is currently unavailable on this device.</Text>
                ) : null}
                {option.method === 'GOOGLE_PAY' && supportCheckComplete && Platform.OS === 'android' && !isExpoGo && !googlePaySupported ? (
                  <Text style={styles.methodHint}>Google Pay is currently unavailable on this device.</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        {needsCardField ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Card Details</Text>
            <CardField
              postalCodeEnabled={false}
              placeholders={{ number: '4242 4242 4242 4242' }}
              cardStyle={{
                backgroundColor: '#FFFFFF',
                textColor: '#0F172A',
                borderColor: '#CBD5E1',
                borderWidth: 1,
                borderRadius: 12,
                placeholderColor: '#94A3B8',
              }}
              style={styles.cardField}
              onCardChange={(details) => setCardComplete(Boolean(details.complete))}
            />
            <Text style={styles.helperText}>
              {selectedMethod === 'CREDIT_CARD'
                ? 'Your credit card will be authorized now and captured after delivery.'
                : 'Your debit card will be authorized now and captured after delivery.'}
            </Text>
          </View>
        ) : null}

        {!supportCheckComplete && (selectedMethod === 'APPLE_PAY' || selectedMethod === 'GOOGLE_PAY') ? (
          <View style={styles.inlineRow}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.helperText}>Checking device payment support…</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Review</Text>
          <Text style={styles.label}>Chosen method</Text>
          <Text style={styles.value}>{getPaymentMethodLabel(selectedOption.method)}</Text>
          {merchantIdentifier ? (
            <Text style={styles.helperText}>
              Merchant identifier configured: {merchantIdentifier}
            </Text>
          ) : null}
          {paymentResult ? (
            <>
              <Text style={styles.label}>Hold status</Text>
              <Text style={styles.value}>{paymentResult.status}</Text>
              <Text style={styles.label}>Held amount</Text>
              <Text style={styles.value}>
                {formatMoney(paymentResult.heldAmount, paymentResult.currency)}
              </Text>
            </>
          ) : null}
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (Boolean(methodDisabledReason) || isSubmitting) && styles.disabledButton]}
          disabled={Boolean(methodDisabledReason) || isSubmitting}
          onPress={() => void onSubmit()}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Authorizing…' : submitLabel}
          </Text>
        </Pressable>

        {methodDisabledReason ? <Text style={styles.helperText}>{methodDisabledReason}</Text> : null}

        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Back to Offers</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 6,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  label: {
    marginTop: 8,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  value: {
    color: '#0F172A',
    fontSize: 15,
  },
  helperText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  methodCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 4,
  },
  methodCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  methodDescription: {
    color: '#475569',
    fontSize: 13,
  },
  methodHint: {
    color: '#B45309',
    fontSize: 12,
  },
  cardField: {
    width: '100%',
    height: 50,
    marginTop: 8,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
});
