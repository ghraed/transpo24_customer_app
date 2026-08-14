import {
  CardField,
  confirmPayment,
  confirmPlatformPayPayment,
  isPlatformPaySupported,
  PlatformPay,
} from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  cancelPaymentHold,
  confirmDriverOffer,
  finalizeAcceptedOfferPayment,
  getCustomerRequestStatus,
  getRequestPaymentStatus,
} from '@/lib/api';
import type {
  CustomerRequestOfferSummary,
  PaymentMethod,
  PaymentStatus,
  PaymentSummary,
  RequestStatusResponse,
} from '@/types/customer-request';

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
    description: 'Pay the agreed amount now with your credit card.',
    icon: { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' },
  },
  {
    method: 'DEBIT_CARD',
    title: 'Debit Card',
    description: 'Pay the agreed amount now with your debit card.',
    icon: { ios: 'creditcard', android: 'payments', web: 'payments' },
  },
  {
    method: 'APPLE_PAY',
    title: 'Apple Pay',
    description: 'Pay now with Apple Pay in a development or production build.',
    icon: { ios: 'apple.logo', android: 'smartphone', web: 'smartphone' },
  },
  {
    method: 'GOOGLE_PAY',
    title: 'Google Pay',
    description: 'Pay now with Google Pay in a development or production build.',
    icon: { ios: 'globe', android: 'android', web: 'android' },
  },
  {
    method: 'APP_WALLET',
    title: 'App Wallet',
    description: 'Pay now using your available in-app wallet balance.',
    icon: { ios: 'wallet.bifold.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' },
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
  return parsed.toLocaleString(undefined, { hour12: false });
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

function isSuccessfulPaymentStatus(status: PaymentStatus): boolean {
  return status === 'PAYMENT_HELD' || status === 'PAYMENT_CAPTURE_PENDING' || status === 'PAYMENT_CAPTURED';
}

function isPendingPaymentStatus(status: PaymentStatus): boolean {
  return status === 'PAYMENT_HOLD_PENDING';
}

function isFinalizedRequestStatus(status: RequestStatusResponse['status']): boolean {
  return (
    status === 'DRIVER_GOING_TO_PICKUP' ||
    status === 'DRIVER_ARRIVED_PICKUP' ||
    status === 'ITEM_PICKED_UP' ||
    status === 'DRIVER_GOING_TO_DROPOFF' ||
    status === 'DELIVERED' ||
    status === 'COMPLETED'
  );
}

export default function RequestPaymentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
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

  const rawPublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  const publishableKey =
    rawPublishableKey &&
    !rawPublishableKey.startsWith('replace_') &&
    rawPublishableKey.startsWith('pk_')
      ? rawPublishableKey
      : '';
  const merchantCountryCode =
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_COUNTRY_CODE?.trim().toUpperCase() || 'US';
  const merchantIdentifier = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER?.trim() || '';
  const isExpoGo = Constants.appOwnership === 'expo';

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CREDIT_CARD');
  const [cardComplete, setCardComplete] = useState(false);
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [supportCheckComplete, setSupportCheckComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPaymentNotice, setShowPaymentNotice] = useState(false);

  const amount = offerData ? offerData.proposedPrice ?? offerData.price : 0;
  const currency = offerData?.currency ?? 'USD';

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const appleSupported =
          Platform.OS === 'ios' && !isExpoGo ? await isPlatformPaySupported() : false;
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
        if (active) setSupportCheckComplete(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [isExpoGo]);

  const selectedOption =
    PAYMENT_OPTIONS.find((option) => option.method === selectedMethod) ?? PAYMENT_OPTIONS[0];
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
    if (selectedMethod === 'APPLE_PAY' && !merchantIdentifier) {
      return 'Apple Pay is not configured. Set EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER to your real Apple merchant identifier and rebuild the iOS app.';
    }
    if (needsStripe && !publishableKey) {
      return 'Stripe is not configured. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to a real pk_test_ or pk_live_ key.';
    }
    if (!requestData || !offerData || !requestId || !offerId) {
      return 'Missing payment context. Please go back and choose the offer again.';
    }
    if (needsCardField && !cardComplete) {
      return 'Complete your card details to continue.';
    }
    return '';
  }, [
    cardComplete,
    isExpoGo,
    merchantIdentifier,
    needsCardField,
    needsStripe,
    offerData,
    offerId,
    publishableKey,
    requestData,
    requestId,
    selectedMethod,
  ]);

  const submitLabel = useMemo(() => {
    if (selectedMethod === 'APP_WALLET') return 'Pay from Wallet';
    if (selectedMethod === 'APPLE_PAY') return 'Pay with Apple Pay';
    if (selectedMethod === 'GOOGLE_PAY') return 'Pay with Google Pay';
    return 'Pay Now';
  }, [selectedMethod]);

  const navigateToNextStep = (nextRequestId: string): void => {
    router.replace({
      pathname: '/request-status',
      params: { requestId: nextRequestId },
    });
  };

  const recoverFinalizedRequestState = async (): Promise<boolean> => {
    try {
      const currentRequest = await getCustomerRequestStatus(requestId);
      if (!isFinalizedRequestStatus(currentRequest.status)) {
        return false;
      }
      navigateToNextStep(currentRequest.id);
      return true;
    } catch {
      return false;
    }
  };

  const recoverExistingPaymentState = async (): Promise<PaymentSummary | null> => {
    try {
      const existingPayment = await getRequestPaymentStatus(requestId);
      setPaymentResult(existingPayment);
      return existingPayment;
    } catch {
      return null;
    }
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

      if (result.error) throw new Error(toStripeErrorMessage(result.error.message));
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

      if (result.error) throw new Error(toStripeErrorMessage(result.error.message));
      return;
    }

    const result = await confirmPayment(payment.stripeClientSecret, {
      paymentMethodType: 'Card',
    });

    if (result.error) throw new Error(toStripeErrorMessage(result.error.message));
  };

  const onSubmit = async (): Promise<void> => {
    if (isSubmitting || methodDisabledReason) {
      if (methodDisabledReason) setErrorMessage(methodDisabledReason);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    let createdPayment: PaymentSummary | null = null;
    let latestPayment: PaymentSummary | null = null;

    try {
      try {
        const response = await confirmDriverOffer(requestId, offerId, {
          confirm: true,
          paymentMethod: selectedMethod,
        });

        createdPayment = response.payment;
        setPaymentResult(response.payment);

        if (response.nextStep === 'TRACK_REQUEST') {
          if (!(await recoverFinalizedRequestState())) {
            navigateToNextStep(response.request.id);
          }
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        const canRecoverFromExistingState =
          message.includes('payment attempt is already in progress') ||
          message.includes('internal server error');

        if (!canRecoverFromExistingState) throw error;
        if (await recoverFinalizedRequestState()) return;

        const existingPayment = await recoverExistingPaymentState();
        if (!existingPayment) throw error;

        createdPayment = existingPayment;
        setPaymentResult(existingPayment);
      }

      if (!createdPayment) throw new Error('Missing payment information.');

      if (selectedMethod !== 'APP_WALLET' && isPendingPaymentStatus(createdPayment.status)) {
        await confirmStripeBackedPayment(createdPayment);
      }

      latestPayment = await getRequestPaymentStatus(requestId);
      setPaymentResult(latestPayment);

      if (!isSuccessfulPaymentStatus(latestPayment.status)) {
        throw new Error(
          `Payment was not completed successfully. Current status: ${latestPayment.status}.`,
        );
      }

      await finalizeAcceptedOfferPayment(requestId);
      const finalizedRequest = await getCustomerRequestStatus(requestId);
      if (!isFinalizedRequestStatus(finalizedRequest.status)) {
        throw new Error(
          `Payment succeeded but request finalization is still pending. Current request status: ${finalizedRequest.status}.`,
        );
      }

      navigateToNextStep(finalizedRequest.id);
    } catch (error) {
      if (await recoverFinalizedRequestState()) return;

      if (createdPayment && isSuccessfulPaymentStatus(latestPayment?.status ?? createdPayment.status)) {
        navigateToNextStep(requestId);
        return;
      }

      if (createdPayment && !isSuccessfulPaymentStatus(latestPayment?.status ?? createdPayment.status)) {
        try {
          const releasedPayment = await cancelPaymentHold(requestId);
          setPaymentResult(releasedPayment);
        } catch {
          // Preserve original error.
        }
      }

      setErrorMessage(error instanceof Error ? error.message : 'Failed to complete payment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPaymentNotice = (): void => {
    if (isSubmitting || methodDisabledReason) {
      if (methodDisabledReason) setErrorMessage(methodDisabledReason);
      return;
    }
    setErrorMessage('');
    setShowPaymentNotice(true);
  };

  const closePaymentNotice = (): void => {
    if (isSubmitting) return;
    setShowPaymentNotice(false);
  };

  const confirmPaymentNotice = (): void => {
    setShowPaymentNotice(false);
    void onSubmit();
  };

  if (!requestData || !offerData || !requestId || !offerId) {
    return (
      <SafeAreaView style={styles.screen} edges={['left', 'right']}>
        <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
        <View style={styles.centeredContainer}>
          <Text style={styles.errorText}>
            Missing payment context. Please go back and choose the driver again.
          </Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom + 32, 42),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroBadge}>
              <IconSymbol
                name={{ ios: 'creditcard.fill', android: 'payments', web: 'payments' }}
                color="#111827"
                size={20}
              />
            </View>
            <Text style={styles.heroLabel}>Payment</Text>
          </View>
          <Text style={styles.heroTitle}>Pay Now</Text>
          <Text style={styles.heroSubtitle}>
            The agreed amount will be collected now when you confirm the driver. If you cancel before pickup, 85% is refunded automatically and 15% is kept as the cancellation fee.
          </Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Selected driver</Text>
            <Text style={styles.summaryValue}>{offerData.driverName || 'Driver'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Agreed amount</Text>
            <Text style={styles.summaryValue}>{formatMoney(amount, currency)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Pickup</Text>
            <Text style={styles.summaryValue}>{requestData.pickupLocation.address || 'N/A'}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Estimated pickup</Text>
            <Text style={styles.summaryValue}>{formatDate(offerData.estimatedPickupAt)}</Text>
          </View>
          <Text style={styles.helperText}>
            This payment is collected now and held in the platform until the trip outcome is resolved.
          </Text>
        </View>

        <View style={styles.sectionCard}>
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
                style={[styles.methodCard, isSelected && styles.methodCardSelected]}
                onPress={() => setSelectedMethod(option.method)}
              >
                <View style={styles.methodLeading}>
                  <View style={styles.methodIconWrap}>
                    <IconSymbol name={option.icon} color="#111827" size={18} />
                  </View>
                  <View style={styles.methodCopy}>
                    <Text style={styles.methodTitle}>{option.title}</Text>
                    <Text style={styles.methodDescription}>{option.description}</Text>
                    {isUnavailableInExpoGo ? (
                      <Text style={styles.methodHint}>
                        Development build required. Native wallets do not work in Expo Go.
                      </Text>
                    ) : null}
                    {isUnavailableOnPlatform ? (
                      <Text style={styles.methodHint}>
                        This payment method is not available on this platform.
                      </Text>
                    ) : null}
                    {option.method === 'APPLE_PAY' &&
                    supportCheckComplete &&
                    Platform.OS === 'ios' &&
                    !isExpoGo &&
                    !applePaySupported ? (
                      <Text style={styles.methodHint}>
                        Apple Pay is currently unavailable on this device.
                      </Text>
                    ) : null}
                    {option.method === 'GOOGLE_PAY' &&
                    supportCheckComplete &&
                    Platform.OS === 'android' &&
                    !isExpoGo &&
                    !googlePaySupported ? (
                      <Text style={styles.methodHint}>
                        Google Pay is currently unavailable on this device.
                      </Text>
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
            <Text style={styles.sectionTitle}>Card Details</Text>
            <View style={styles.cardFieldWrap}>
              <CardField
                postalCodeEnabled={false}
                placeholders={{ number: '4242 4242 4242 4242' }}
                cardStyle={{
                  backgroundColor: '#F8FAFC',
                  textColor: '#111827',
                  borderColor: '#E5E7EB',
                  borderWidth: 1,
                  borderRadius: 18,
                  placeholderColor: '#98A2B3',
                }}
                style={styles.cardField}
                onCardChange={(details) => setCardComplete(Boolean(details.complete))}
              />
            </View>
            <Text style={styles.helperText}>
              {selectedMethod === 'CREDIT_CARD'
                ? 'Your credit card will be charged now when you confirm the payment.'
                : 'Your debit card will be charged now when you confirm the payment.'}
            </Text>
          </View>
        ) : null}

        {!supportCheckComplete && (selectedMethod === 'APPLE_PAY' || selectedMethod === 'GOOGLE_PAY') ? (
          <View style={styles.inlineInfo}>
            <ActivityIndicator size="small" color="#111827" />
            <Text style={styles.helperText}>Checking device payment support…</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Review</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Chosen method</Text>
            <Text style={styles.summaryValue}>{getPaymentMethodLabel(selectedOption.method)}</Text>
          </View>
          {selectedMethod === 'APPLE_PAY' ? (
            <Text style={styles.helperText}>
              {merchantIdentifier
                ? `Merchant identifier configured: ${merchantIdentifier}`
                : 'Apple Pay requires a real EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER and an iOS rebuild.'}
            </Text>
          ) : null}
          {selectedMethod === 'GOOGLE_PAY' ? (
            <Text style={styles.helperText}>
              Google Pay on Android does not use an Apple merchant identifier.
            </Text>
          ) : null}
          {paymentResult ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Payment status</Text>
                <Text style={styles.summaryValue}>{paymentResult.status}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Collected amount</Text>
                <Text style={styles.summaryValue}>
                  {formatMoney(
                    paymentResult.capturedAmount > 0 ? paymentResult.capturedAmount : paymentResult.amount,
                    paymentResult.currency,
                  )}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (Boolean(methodDisabledReason) || isSubmitting) && styles.disabledButton]}
          disabled={Boolean(methodDisabledReason) || isSubmitting}
          onPress={openPaymentNotice}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Processing payment…' : submitLabel}
          </Text>
        </Pressable>

        {methodDisabledReason ? <Text style={styles.helperText}>{methodDisabledReason}</Text> : null}

        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Back to Offers</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showPaymentNotice} transparent animationType="fade" onRequestClose={closePaymentNotice}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalBadge}>
              <Text style={styles.modalBadgeText}>Important</Text>
            </View>
            <Text style={styles.modalTitle}>Immediate payment capture</Text>
            <Text style={styles.modalBody}>
              Confirming this driver charges {formatMoney(amount, currency)} immediately.
            </Text>

            <View style={styles.noticePanel}>
              <Text style={styles.noticePanelTitle}>Cancellation policy</Text>
              <Text style={styles.noticePanelText}>
                Before pickup: 85% is refunded automatically and 15% is kept as the cancellation fee.
              </Text>
              <Text style={styles.noticePanelText}>
                After pickup: automatic cancellation is not available and the case goes to manual review.
              </Text>
            </View>

            <Text style={styles.modalFootnote}>
              Continue only if you want to pay now and lock this offer for the selected driver.
            </Text>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondaryButton} onPress={closePaymentNotice}>
                <Text style={styles.modalSecondaryButtonText}>Review again</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPrimaryButton, isSubmitting && styles.disabledButton]}
                disabled={isSubmitting}
                onPress={confirmPaymentNotice}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  {isSubmitting ? 'Processing…' : 'Confirm and Pay'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#FAFAFA',
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
    marginTop: 8,
    color: '#68768A',
    fontSize: 14,
    lineHeight: 20,
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#68768A',
  },
  summaryValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  helperText: {
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10,
  },
  methodCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginTop: 12,
  },
  methodCardSelected: {
    borderColor: '#FFC548',
    backgroundColor: '#FFF7E1',
  },
  methodLeading: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  methodIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodCopy: {
    flex: 1,
    gap: 4,
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  methodDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#68768A',
  },
  methodHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
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
  inlineInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
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
  secondaryButton: {
    minHeight: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
  },
  modalBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#FFF3D6',
    marginBottom: 12,
  },
  modalBadgeText: {
    color: '#D89A1A',
    fontSize: 12,
    fontWeight: '800',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
  },
  modalBody: {
    marginTop: 10,
    color: '#68768A',
    fontSize: 14,
    lineHeight: 20,
  },
  noticePanel: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
    padding: 14,
    gap: 8,
  },
  noticePanelTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  noticePanelText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#68768A',
  },
  modalFootnote: {
    marginTop: 14,
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalSecondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 14,
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC548',
  },
  modalPrimaryButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
  },
});
