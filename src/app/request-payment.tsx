import { getStripePublishableKey } from '@/lib/stripe-config';
import { PaymentInfo, usePaymentPolicy } from '@/components/payment-info';
import { PaymentSummary as PaymentSummaryCard } from '@/components/payment-summary';
import { PaymentConditions } from '@/components/payment-conditions';
import {
  confirmPayment,
  confirmSetupIntent,
  confirmPlatformPaySetupIntent,
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
  createCardSetup,
  saveDefaultPaymentMethod,
  confirmDriverOffer,
  confirmFurnitureReservation,
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
import { SavedCardPicker, EMPTY_CARD_SELECTION } from '@/components/saved-card-picker';
import appI18n from '@/localization/i18n';
import { getVisiblePaymentOptions } from '@/lib/ios-payment-options';

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
    return appI18n.t("{{value0}} {{value1}}", { value0: amount.toFixed(2), value1: code });
  }
}

function getPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'CREDIT_CARD':
      return appI18n.t("Credit card");
    case 'DEBIT_CARD':
      return appI18n.t("Debit card");
    case 'APPLE_PAY':
      return appI18n.t("Apple Pay");
    case 'GOOGLE_PAY':
      return appI18n.t("Google Pay");
    case 'APP_WALLET':
      return appI18n.t("App wallet");
    default:
      return method;
  }
}

function toStripeErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('canceled') || normalized.includes('cancelled')) {
    return appI18n.t("Payment confirmation was cancelled. You can try again.");
  }
  if (normalized.includes('invalid api key provided')) {
    return appI18n.t("Stripe is not configured correctly. Set a real EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY in the client app and a matching STRIPE_SECRET_KEY in the backend.");
  }
  if (normalized.includes('something went wrong') || normalized.includes('request id')) {
    return appI18n.t("Stripe could not confirm this payment. Check that the client publishable key and backend secret key use the same Stripe account and mode. The 4242 test card only works with pk_test_ and sk_test_ keys.");
  }
  return message;
}

function getStripePublishableKeyMode(key: string): 'test' | 'live' | null {
  if (key.startsWith('pk_test_')) return 'test';
  if (key.startsWith('pk_live_')) return 'live';
  return null;
}

function isSuccessfulPaymentStatus(status: PaymentStatus): boolean {
  return status === 'PAYMENT_HELD' || status === 'PAYMENT_CAPTURE_PENDING' || status === 'PAYMENT_CAPTURED';
}

function isPendingPaymentStatus(status: PaymentStatus): boolean {
  return status === 'PAYMENT_HOLD_PENDING';
}

function isFinalizedRequestStatus(status: RequestStatusResponse['status']): boolean {
  return (
    status === 'DRIVER_ASSIGNED' ||
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

  const { policy, error: policyError } = usePaymentPolicy(requestData?.paymentPolicy);
  const delayed = policy?.booking.authorization === 'AFTER_COUNTDOWN';

  const publishableKey = getStripePublishableKey();
  const isStripeTestMode = publishableKey.startsWith('pk_test_');
  const merchantCountryCode =
    process.env.EXPO_PUBLIC_STRIPE_MERCHANT_COUNTRY_CODE?.trim().toUpperCase() ||
    (Platform.OS === 'ios' ? '' : 'US');
  const merchantIdentifier = process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER?.trim() || '';
  const isExpoGo = Constants.appOwnership === 'expo';

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CREDIT_CARD');
  const [cardSelection, setCardSelection] = useState(EMPTY_CARD_SELECTION);
  const cardComplete = cardSelection.complete && !cardSelection.busy;
  const [applePaySupported, setApplePaySupported] = useState(false);
  const [googlePaySupported, setGooglePaySupported] = useState(false);
  const [supportCheckComplete, setSupportCheckComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [showPaymentNotice, setShowPaymentNotice] = useState(false);

  const amount = paymentResult?.amount ?? (offerData ? offerData.proposedPrice ?? offerData.price : 0);
  const customerPlatformFeeAmount = paymentResult?.customerPlatformFeeAmount
    ?? offerData?.customerPlatformFeeAmount
    ?? 0;
  const currency = offerData?.currency ?? 'USD';

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const appleSupported =
          Platform.OS === 'ios' && !isExpoGo
            ? await isPlatformPaySupported().catch(() => false)
            : false;
        const googleSupported =
          Platform.OS === 'android' && !isExpoGo
            ? await isPlatformPaySupported({
                googlePay: { testEnv: isStripeTestMode, existingPaymentMethodRequired: false },
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
  }, [isExpoGo, isStripeTestMode]);

  const paymentOptions = useMemo(() => getVisiblePaymentOptions(PAYMENT_OPTIONS, Platform.OS, {
    merchantIdentifier,
    merchantCountryCode,
    supported: applePaySupported && Boolean(publishableKey),
  }), [applePaySupported, merchantCountryCode, merchantIdentifier, publishableKey]);
  const showPaymentDiagnostics = Platform.OS !== 'ios' || __DEV__;

  const selectedOption =
    PAYMENT_OPTIONS.find((option) => option.method === selectedMethod) ?? PAYMENT_OPTIONS[0];
  const needsStripe = selectedMethod !== 'APP_WALLET';
  const needsCardField = selectedMethod === 'CREDIT_CARD' || selectedMethod === 'DEBIT_CARD';
  const methodDisabledReason = useMemo(() => {
    if (!policy) return appI18n.t(policyError ? 'payment_info.unavailable' : 'payment_info.loading');
    if ((selectedMethod === 'APPLE_PAY' || selectedMethod === 'GOOGLE_PAY') && isExpoGo) {
      return appI18n.t("Apple Pay and Google Pay require a development build or production build. They are not available in Expo Go.");
    }
    if (selectedMethod === 'APPLE_PAY' && Platform.OS !== 'ios') {
      return appI18n.t("Apple Pay is only available on iOS.");
    }
    if (selectedMethod === 'GOOGLE_PAY' && Platform.OS !== 'android') {
      return appI18n.t("Google Pay is only available on Android.");
    }
    if (selectedMethod === 'APPLE_PAY' && !merchantIdentifier) {
      return appI18n.t("Apple Pay is not configured. Set EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER to your real Apple merchant identifier and rebuild the iOS app.");
    }
    if (needsStripe && !publishableKey) {
      return appI18n.t("Stripe is not configured. Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to a real pk_test_ or pk_live_ key.");
    }
    if (!requestData || !offerData || !requestId || !offerId) {
      return appI18n.t("Missing payment context. Please go back and choose the offer again.");
    }
    if (needsCardField && !cardComplete) {
      return appI18n.t("Complete your card details to continue.");
    }
    return '';
  }, [
    cardComplete,
    isExpoGo,
    merchantIdentifier,
    policy,
    policyError,
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
    if (delayed) return appI18n.t('payment_info.confirm_offer');
    if (selectedMethod === 'APP_WALLET') return appI18n.t("Pay from Wallet");
    if (selectedMethod === 'APPLE_PAY') return appI18n.t("Pay with Apple Pay");
    if (selectedMethod === 'GOOGLE_PAY') return appI18n.t("Pay with Google Pay");
    return appI18n.t("Pay Now");
  }, [selectedMethod, delayed]);

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
    const clientStripeMode = getStripePublishableKeyMode(publishableKey);
    if (
      payment.stripeMode &&
      clientStripeMode &&
      payment.stripeMode !== clientStripeMode
    ) {
      throw new Error(
        appI18n.t("Stripe configuration mismatch: this payment was created in {{value0}} mode, but the app is using a {{value1}} publishable key. Use matching Stripe keys. The 4242 test card requires pk_test_ in the app and sk_test_ in the backend.", {
          value0: payment.stripeMode,
          value1: clientStripeMode,
        }),
      );
    }

    if (!payment.stripeClientSecret) {
      throw new Error(appI18n.t("Missing Stripe client secret from the backend."));
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
          testEnv: isStripeTestMode,
          merchantCountryCode,
          currencyCode: payment.currency,
          merchantName: 'Transpo 24',
        },
      });

      if (result.error) throw new Error(toStripeErrorMessage(result.error.message));
      return;
    }

    const result = await confirmPayment(payment.stripeClientSecret,
      cardSelection.paymentMethodId
        ? { paymentMethodType: 'Card', paymentMethodData: { paymentMethodId: cardSelection.paymentMethodId } }
        : { paymentMethodType: 'Card' },
    );

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
      let selectedPaymentMethodId = cardSelection.paymentMethodId;
      if (delayed && selectedMethod !== 'APP_WALLET' && (!selectedPaymentMethodId || selectedMethod === 'APPLE_PAY' || selectedMethod === 'GOOGLE_PAY')) {
        const setup = await createCardSetup();
        const result = selectedMethod === 'APPLE_PAY'
          ? await confirmPlatformPaySetupIntent(setup.clientSecret, { applePay: { merchantCountryCode, currencyCode: currency, cartItems: [{ label: 'Transpo 24', amount: amount.toFixed(2), paymentType: PlatformPay.PaymentType.Deferred, deferredDate: Math.floor(Date.now() / 1000) + (policy?.booking.freeCancellationSeconds ?? 600) }] } })
          : selectedMethod === 'GOOGLE_PAY'
            ? await confirmPlatformPaySetupIntent(setup.clientSecret, { googlePay: { testEnv: isStripeTestMode, merchantCountryCode, currencyCode: currency, merchantName: 'Transpo 24' } })
            : await confirmSetupIntent(setup.clientSecret, { paymentMethodType: 'Card' });
        const id = result.setupIntent?.paymentMethodId;
        if (result.error || result.setupIntent?.status !== 'Succeeded' || !id) throw new Error(result.error?.message ?? appI18n.t('payment_info.setup_failed'));
        await saveDefaultPaymentMethod(id);
        selectedPaymentMethodId = id;
      }
      try {
        const response = await (requestData?.status === 'RESERVED'
          ? confirmFurnitureReservation(requestId, {
              confirm: true, paymentMethod: selectedMethod, stripePaymentMethodId: selectedPaymentMethodId || undefined, policyVersion: policy?.version,
            })
          : confirmDriverOffer(requestId, offerId, {
          confirm: true,
          paymentMethod: selectedMethod,
          stripePaymentMethodId: selectedPaymentMethodId || undefined, policyVersion: policy?.version,
        }));

        createdPayment = response.payment;
        setPaymentResult(response.payment);

        if (response.nextStep === 'WAIT_CONFIRMATION') {
          navigateToNextStep(response.request.id);
          return;
        }
        if (response.nextStep === 'RESERVATION_CONFIRMED') {
          router.replace({ pathname: '/request-status', params: { requestId } });
          return;
        }
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

        if (existingPayment.confirmation) { navigateToNextStep(requestId); return; }
        createdPayment = existingPayment;
        setPaymentResult(existingPayment);
      }

      if (!createdPayment) throw new Error(appI18n.t("Missing payment information."));

      if (selectedMethod !== 'APP_WALLET' && isPendingPaymentStatus(createdPayment.status)) {
        await confirmStripeBackedPayment(createdPayment);
      }

      latestPayment = await getRequestPaymentStatus(requestId);
      setPaymentResult(latestPayment);

      if (!isSuccessfulPaymentStatus(latestPayment.status)) {
        throw new Error(
          appI18n.t("Payment was not completed successfully. Current status: {{value0}}.", { value0: latestPayment.status }),
        );
      }

      await finalizeAcceptedOfferPayment(requestId);
      const finalizedRequest = await getCustomerRequestStatus(requestId);
      if (!isFinalizedRequestStatus(finalizedRequest.status)) {
        throw new Error(
          appI18n.t("Payment succeeded but request finalization is still pending. Current request status: {{value0}}.", { value0: finalizedRequest.status }),
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

      setErrorMessage(error instanceof Error ? error.message : appI18n.t("Failed to complete payment."));
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
            {appI18n.t("Missing payment context. Please go back and choose the driver again.")}</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryButtonText}>{appI18n.t("Go Back")}</Text>
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
            <Text style={styles.heroLabel}>{appI18n.t("Payment")}</Text>
          </View>
          <Text style={styles.heroTitle}>{appI18n.t("Pay Now")}</Text>
          <Text style={styles.heroSubtitle}>
            {appI18n.t("The agreed amount will be collected now when you confirm the driver.")}</Text>
        </View>

        <PaymentInfo context={requestData?.status === 'RESERVED' ? 'reservation' : 'booking'} policy={policy} details={[formatMoney(amount, currency), getPaymentMethodLabel(selectedMethod)]} />
        <PaymentSummaryCard
          policy={policy ?? undefined}
          amountLabel={formatMoney(amount, currency)}
          currency={currency}
          commissionLabel={customerPlatformFeeAmount > 0
            ? appI18n.t('Includes 5% platform commission ({{amount}}).', {
                amount: formatMoney(customerPlatformFeeAmount, currency),
              })
            : undefined}
          driverLabel={`${appI18n.t(offerData.driverType === 'COMPANY' ? 'Company' : 'Personal')}${requestData.driverDetailsAvailable && offerData.driverName ? ` • ${offerData.driverName}` : ''}`}
          pickupAddress={requestData.pickupLocation.address || 'N/A'}
          estimatedPickup={formatDate(offerData.estimatedPickupAt)}
        />

        <PaymentConditions policy={policy ?? undefined} />

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{appI18n.t("Choose Payment Method")}</Text>
          {paymentOptions.map((option) => {
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
                disabled={isSubmitting || cardSelection.busy}
                onPress={() => setSelectedMethod(option.method)}
              >
                <View style={styles.methodLeading}>
                  <View style={styles.methodIconWrap}>
                    <IconSymbol name={option.icon} color="#111827" size={18} />
                  </View>
                  <View style={styles.methodCopy}>
                    <Text style={styles.methodTitle}>{appI18n.t(option.title)}</Text>
                    <Text style={styles.methodDescription}>
                      {appI18n.t(Platform.OS === 'ios' && option.method === 'APPLE_PAY'
                        ? 'Pay with Apple Pay'
                        : option.description)}
                    </Text>
                    {isUnavailableInExpoGo ? (
                      <Text style={styles.methodHint}>
                        {appI18n.t("Development build required. Native wallets do not work in Expo Go.")}</Text>
                    ) : null}
                    {isUnavailableOnPlatform ? (
                      <Text style={styles.methodHint}>
                        {appI18n.t("This payment method is not available on this platform.")}</Text>
                    ) : null}
                    {option.method === 'APPLE_PAY' &&
                    supportCheckComplete &&
                    Platform.OS === 'ios' &&
                    !isExpoGo &&
                    !applePaySupported ? (
                      <Text style={styles.methodHint}>
                        {appI18n.t("Apple Pay is currently unavailable on this device.")}</Text>
                    ) : null}
                    {option.method === 'GOOGLE_PAY' &&
                    supportCheckComplete &&
                    Platform.OS === 'android' &&
                    !isExpoGo &&
                    !googlePaySupported ? (
                      <Text style={styles.methodHint}>
                        {appI18n.t("Google Pay is currently unavailable on this device.")}</Text>
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
            <Text style={styles.sectionTitle}>{appI18n.t("Card Details")}</Text>
            <SavedCardPicker disabled={isSubmitting} onChange={setCardSelection} />
            <Text style={styles.helperText}>
              {selectedMethod === 'CREDIT_CARD'
                ? delayed ? 'payment_info.delayed_capture' : 'Your credit card will be charged now when you confirm the payment.'
                : delayed ? 'payment_info.delayed_capture' : 'Your debit card will be charged now when you confirm the payment.'}
            </Text>
          </View>
        ) : null}

        {!supportCheckComplete && (selectedMethod === 'APPLE_PAY' || selectedMethod === 'GOOGLE_PAY') ? (
          <View style={styles.inlineInfo}>
            <ActivityIndicator size="small" color="#111827" />
            <Text style={styles.helperText}>{appI18n.t("Checking device payment support…")}</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{appI18n.t("Review")}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>{appI18n.t("Chosen method")}</Text>
            <Text style={styles.summaryValue}>{getPaymentMethodLabel(selectedOption.method)}</Text>
          </View>
          {showPaymentDiagnostics && selectedMethod === 'APPLE_PAY' ? (
            <Text style={styles.helperText}>
              {merchantIdentifier
                ? `Merchant identifier configured: ${merchantIdentifier}`
                : 'Apple Pay requires a real EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER and an iOS rebuild.'}
            </Text>
          ) : null}
          {selectedMethod === 'GOOGLE_PAY' ? (
            <Text style={styles.helperText}>
              {appI18n.t("Google Pay on Android does not use an Apple merchant identifier.")}</Text>
          ) : null}
          {paymentResult ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{appI18n.t("Payment status")}</Text>
                <Text style={styles.summaryValue}>{paymentResult.status}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{appI18n.t("Collected amount")}</Text>
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
          <Text style={styles.secondaryButtonText}>{appI18n.t("Back to Offers")}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showPaymentNotice} transparent animationType="fade" onRequestClose={closePaymentNotice}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalBadge}>
                <Text style={styles.modalBadgeText}>{appI18n.t("Important")}</Text>
              </View>
              <Text style={styles.modalTitle}>{appI18n.t(delayed ? 'payment_info.confirm_offer' : requestData?.status === 'RESERVED' ? "Confirm pickup and pay" : "Immediate payment capture")}</Text>
              <PaymentInfo context="booking" policy={policy} details={[formatMoney(amount, currency), getPaymentMethodLabel(selectedMethod)]} />
              <Text style={styles.modalBody}>
                {appI18n.t(delayed ? 'payment_info.confirm_amount' : 'Confirming this driver charges {{amount}} immediately.', {
                  amount: formatMoney(amount, currency),
                })}
              </Text>

              {customerPlatformFeeAmount > 0 ? (
                <Text style={styles.modalBody}>
                  {appI18n.t('Includes 5% platform commission ({{amount}}).', {
                    amount: formatMoney(customerPlatformFeeAmount, currency),
                  })}
                </Text>
              ) : null}

              <PaymentConditions compact policy={policy ?? undefined} />

              <Text style={styles.modalFootnote}>
                {appI18n.t(delayed ? "payment_info.delayed_start" : "Continue only if you want to pay now and lock this offer for the selected driver.", { minutes: (policy?.booking.freeCancellationSeconds ?? 600) / 60 })}</Text>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalSecondaryButton} onPress={closePaymentNotice}>
                <Text style={styles.modalSecondaryButtonText}>{appI18n.t("Review again")}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPrimaryButton, isSubmitting && styles.disabledButton]}
                disabled={isSubmitting}
                testID="request-payment-confirm"
                onPress={confirmPaymentNotice}
              >
                <Text style={styles.modalPrimaryButtonText}>
                  {isSubmitting ? appI18n.t('Processing…') : appI18n.t(delayed ? 'payment_info.confirm_offer' : 'Confirm and Pay')}
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
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
  },
  modalScroll: {
    flexGrow: 0,
    flexShrink: 1,
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
