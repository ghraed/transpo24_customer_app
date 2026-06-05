import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getApiBaseUrl } from '@/config/backend';
import {
  cancelPaymentHold,
  getCustomerRequestOffers,
  getCustomerRequestStatus,
  getRequestPaymentStatus,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth-token';
import {
  connectSocket,
  onAdditionalChargeAdded,
  onOfferNew,
  onPaymentCancelled,
  onPaymentCaptured,
  onPaymentFailed,
  onPaymentHeld,
  onRequestDriverSelected,
  onSocketConnected,
  onSocketDisconnect,
  onSocketError,
  waitForSocketConnection,
} from '@/services/socketService';
import type {
  AdditionalCharge,
  CustomerRequestOfferSummary,
  CustomerRequestStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentSummary,
  RequestStatusResponse,
} from '@/types/customer-request';

interface TimelineStep {
  key: string;
  label: string;
}

type SocketState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'unavailable';

const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'REQUEST_SUBMITTED', label: 'Request submitted' },
  { key: 'PENDING_QUOTES', label: 'Waiting for offers' },
  { key: 'QUOTED', label: 'Choose driver' },
  { key: 'DRIVER_GOING_TO_PICKUP', label: 'Driver going to pickup' },
  { key: 'DRIVER_ARRIVED_PICKUP', label: 'Driver arrived at pickup' },
  { key: 'IN_TRANSIT', label: 'In transit' },
  { key: 'DELIVERED', label: 'Delivered' },
];

const STATUS_PROGRESS: Record<CustomerRequestStatus, number> = {
  DRAFT: 0,
  PENDING_QUOTES: 1,
  QUOTED: 2,
  ACCEPTED: 2,
  DRIVER_ASSIGNED: 3,
  DRIVER_GOING_TO_PICKUP: 3,
  DRIVER_ARRIVED_PICKUP: 4,
  PICKUP_IN_PROGRESS: 4,
  IN_TRANSIT: 5,
  DRIVER_GOING_TO_DROPOFF: 5,
  DELIVERED: 6,
  COMPLETED: 6,
  CANCELLED: -1,
};

const STATUS_LABELS: Partial<Record<CustomerRequestStatus, string>> = {
  PENDING_QUOTES: 'Waiting for driver offers',
  QUOTED: 'Choose your driver',
  DRIVER_ASSIGNED: 'Driver selected',
  DRIVER_GOING_TO_PICKUP: 'Driver going to pickup',
};

function parseInitialRequest(raw: string | undefined): RequestStatusResponse | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as RequestStatusResponse;
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

function shortRequestId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function resolveAssetUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|file:|content:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function formatLocation(
  location: RequestStatusResponse['pickupLocation'] | RequestStatusResponse['dropoffLocation'],
): string {
  if (location.address) return location.address;
  if (location.latitude === null || location.longitude === null) return 'N/A';
  return `Lat ${location.latitude.toFixed(6)}, Lng ${location.longitude.toFixed(6)}`;
}

function sortOffers(offers: CustomerRequestOfferSummary[]): CustomerRequestOfferSummary[] {
  const statusRank: Record<string, number> = {
    ACCEPTED: 0,
    PENDING: 1,
    REJECTED: 2,
    EXPIRED: 3,
    CANCELLED: 4,
  };

  return [...offers].sort((left, right) => {
    const leftRank = statusRank[left.offerStatus ?? left.status] ?? 99;
    const rightRank = statusRank[right.offerStatus ?? right.status] ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftPrice = left.proposedPrice ?? left.price;
    const rightPrice = right.proposedPrice ?? right.price;
    if (leftPrice !== rightPrice) {
      return leftPrice - rightPrice;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function upsertOffer(
  previousOffers: CustomerRequestOfferSummary[],
  nextOffer: CustomerRequestOfferSummary,
): CustomerRequestOfferSummary[] {
  const nextOfferId = nextOffer.offerId || nextOffer.id;
  const index = previousOffers.findIndex((offer) => (offer.offerId || offer.id) === nextOfferId);

  if (index === -1) {
    return sortOffers([...previousOffers, nextOffer]);
  }

  const nextOffers = [...previousOffers];
  nextOffers[index] = nextOffer;
  return sortOffers(nextOffers);
}

function getHeadline(status: CustomerRequestStatus, offersCount: number): string {
  if (status === 'PENDING_QUOTES' && offersCount === 0) return 'Waiting for driver offers';
  if (status === 'QUOTED' || offersCount > 0) return 'Choose your driver';
  if (status === 'DRIVER_ASSIGNED' || status === 'DRIVER_GOING_TO_PICKUP') return 'Driver selected';
  return 'Request Status';
}

function getSocketStateLabel(socketState: SocketState): string {
  switch (socketState) {
    case 'connecting':
      return 'Realtime connecting…';
    case 'connected':
      return 'Realtime connected';
    case 'disconnected':
      return 'Realtime disconnected';
    case 'error':
      return 'Realtime connection issue';
    case 'unavailable':
      return 'Realtime unavailable';
    default:
      return 'Realtime idle';
  }
}

function getRatingText(rating: number | null): string {
  if (rating === null) return 'No rating yet';
  return `★ ${rating.toFixed(1)}`;
}

function buildOffersHelperText(requestData: RequestStatusResponse, offersCount: number): string {
  if (offersCount > 0) {
    const lowestOffer = requestData.quotesSummary.lowestPrice;
    const lowestCurrency = requestData.quotesSummary.currency;

    if (lowestOffer !== null && lowestCurrency) {
      return `${offersCount} offers available • Lowest ${lowestOffer} ${lowestCurrency}`;
    }

    return `${offersCount} offers available`;
  }

  if (requestData.dispatchSummary?.noConnectedDriversAvailable) {
    return 'Your request was created. We are waiting for available drivers.';
  }

  if ((requestData.dispatchSummary?.eligibleDriversCount ?? 0) > 0) {
    return `Sent to ${requestData.dispatchSummary?.eligibleDriversCount ?? 0} eligible drivers.`;
  }

  return 'Drivers will review your request and send offers soon.';
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

function getPaymentStatusLabel(status: PaymentStatus): string {
  switch (status) {
    case 'PAYMENT_HOLD_PENDING':
      return 'Payment hold pending';
    case 'PAYMENT_HELD':
      return 'Amount held';
    case 'PAYMENT_FAILED':
      return 'Payment failed';
    case 'DELIVERY_CONFIRMED':
      return 'Delivery confirmed';
    case 'PAYMENT_CAPTURE_PENDING':
      return 'Capture pending';
    case 'PAYMENT_CAPTURED':
      return 'Payment captured';
    case 'PAYMENT_RELEASED':
      return 'Hold released';
    case 'PAYMENT_CANCELLED':
      return 'Payment cancelled';
    case 'PAYMENT_REFUNDED':
      return 'Payment refunded';
    default:
      return status;
  }
}

function buildTrackingHref(requestData: RequestStatusResponse): Href {
  return {
    pathname: '/customer-tracking',
    params: {
      tripId: requestData.id,
      pickupLatitude: String(requestData.pickupLocation.latitude),
      pickupLongitude: String(requestData.pickupLocation.longitude),
      pickupAddress: requestData.pickupLocation.address ?? '',
      dropoffLatitude: String(requestData.dropoffLocation.latitude),
      dropoffLongitude: String(requestData.dropoffLocation.longitude),
      dropoffAddress: requestData.dropoffLocation.address ?? '',
    },
  };
}

export default function RequestStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const initialRequest = useMemo(
    () => parseInitialRequest(typeof params.initialRequest === 'string' ? params.initialRequest : undefined),
    [params.initialRequest],
  );
  const accessToken = useMemo(() => getAccessToken(), []);

  const [requestData, setRequestData] = useState<RequestStatusResponse | null>(initialRequest);
  const [offers, setOffers] = useState<CustomerRequestOfferSummary[]>([]);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const [isOpeningPaymentOfferId, setIsOpeningPaymentOfferId] = useState<string>('');
  const [isCancellingPayment, setIsCancellingPayment] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(!initialRequest);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [socketState, setSocketState] = useState<SocketState>(accessToken ? 'idle' : 'unavailable');
  const [socketMessage, setSocketMessage] = useState<string>(
    accessToken ? '' : 'Missing auth token. Realtime offer updates are unavailable.',
  );

  const loadStatus = useCallback(
    async (refresh: boolean): Promise<void> => {
      if (!requestId) {
        setErrorMessage('Missing request id. Please go back and submit your request again.');
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage('');

      try {
        const data = await getCustomerRequestStatus(requestId);
        const offersResponse = await getCustomerRequestOffers(requestId);
        let nextPayment: PaymentSummary | null = null;

        try {
          nextPayment = await getRequestPaymentStatus(requestId);
        } catch (paymentError) {
          const paymentMessage =
            paymentError instanceof Error ? paymentError.message.toLowerCase() : '';

          if (
            !paymentMessage.includes('payment hold not found') &&
            !paymentMessage.includes('not found')
          ) {
            throw paymentError;
          }
        }

        setRequestData(data);
        setOffers(sortOffers(offersResponse.offers ?? []));
        setPaymentSummary(nextPayment);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load request status.';
        const normalized = message.toLowerCase();

        if (normalized.includes('not found')) {
          setErrorMessage('Request not found.');
        } else if (normalized.includes('forbidden') || normalized.includes('access')) {
          setErrorMessage('You do not have access to this request.');
        } else {
          setErrorMessage(message);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [requestId],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadStatus(false);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadStatus]);

  useEffect(() => {
    if (!requestId || !accessToken) return;

    setSocketState('connecting');

    try {
      connectSocket(accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect realtime socket.';
      setSocketState('error');
      setSocketMessage(message);
      return;
    }

    void waitForSocketConnection(5000)
      .then(() => {
        setSocketState('connected');
        setSocketMessage('');
      })
      .catch((error) => {
        setSocketState('error');
        setSocketMessage(error instanceof Error ? error.message : 'Realtime connection timeout.');
      });

    const unsubOfferNew = onOfferNew((payload) => {
      if (payload.requestId !== requestId) return;

      setSuccessMessage('A new driver offer arrived.');
      setOffers((previousOffers) => {
        const nextOffers = upsertOffer(previousOffers, payload.offer);
        setRequestData((previousRequestData) => {
          if (!previousRequestData) return previousRequestData;

          const lowestOffer = nextOffers.reduce<CustomerRequestOfferSummary | null>((lowest, offer) => {
            if (!lowest) return offer;
            const offerPrice = offer.proposedPrice ?? offer.price;
            const lowestPrice = lowest.proposedPrice ?? lowest.price;
            return offerPrice < lowestPrice ? offer : lowest;
          }, null);

          return {
            ...previousRequestData,
            status: payload.requestStatus,
            statusLabel: STATUS_LABELS[payload.requestStatus] ?? previousRequestData.statusLabel,
            quotesSummary: {
              count: nextOffers.length,
              lowestPrice: lowestOffer ? lowestOffer.proposedPrice ?? lowestOffer.price : null,
              currency: lowestOffer?.currency ?? previousRequestData.quotesSummary.currency,
              hasOffers: nextOffers.length > 0,
            },
          };
        });

        return nextOffers;
      });
    });

    const unsubDriverSelected = onRequestDriverSelected((payload) => {
      if (payload.request.id !== requestId) return;

      setSuccessMessage('Driver selected successfully.');
      setPaymentSummary(payload.payment);
      setRequestData((previousRequestData) =>
        previousRequestData
          ? {
              ...previousRequestData,
              status: payload.request.status,
              statusLabel: STATUS_LABELS[payload.request.status] ?? previousRequestData.statusLabel,
              driverSummary: {
                ...previousRequestData.driverSummary,
                assigned: true,
                driverId: payload.request.assignedDriverId,
              },
            }
          : previousRequestData,
      );
    });

    const unsubPaymentHeld = onPaymentHeld((payload) => {
      if (payload.requestId !== requestId) return;
      setPaymentSummary(payload);
      setSuccessMessage('Your payment hold is active.');
    });

    const unsubPaymentFailed = onPaymentFailed((payload) => {
      if (payload.requestId !== requestId) return;
      setPaymentSummary(payload);
      setErrorMessage('Payment authorization failed. Please try again.');
    });

    const unsubPaymentCaptured = onPaymentCaptured((payload) => {
      if (payload.requestId !== requestId) return;
      setPaymentSummary(payload);
      setSuccessMessage('Payment captured after delivery confirmation.');
    });

    const unsubPaymentCancelled = onPaymentCancelled((payload) => {
      if (payload.requestId !== requestId) return;
      setPaymentSummary(payload);
      setSuccessMessage('Payment hold released.');
    });

    const unsubAdditionalChargeAdded = onAdditionalChargeAdded((payload) => {
      if (payload.requestId !== requestId) return;

      setAdditionalCharges((previousCharges) => {
        const index = previousCharges.findIndex((charge) => charge.id === payload.id);
        if (index === -1) {
          return [payload, ...previousCharges];
        }

        const nextCharges = [...previousCharges];
        nextCharges[index] = payload;
        return nextCharges;
      });

      setSuccessMessage('An additional charge was added.');
    });

    const unsubConnected = onSocketConnected(() => {
      setSocketState('connected');
      setSocketMessage('');
    });

    const unsubDisconnected = onSocketDisconnect(() => {
      setSocketState('disconnected');
      setSocketMessage('Socket disconnected. Waiting to reconnect...');
    });

    const unsubSocketError = onSocketError((message) => {
      setSocketState('error');
      setSocketMessage(message);
    });

    return () => {
      unsubOfferNew();
      unsubDriverSelected();
      unsubPaymentHeld();
      unsubPaymentFailed();
      unsubPaymentCaptured();
      unsubPaymentCancelled();
      unsubAdditionalChargeAdded();
      unsubConnected();
      unsubDisconnected();
      unsubSocketError();
    };
  }, [accessToken, requestId]);

  const pendingOffers = offers.filter((offer) => (offer.offerStatus ?? offer.status) === 'PENDING');
  const acceptedOffer = offers.find((offer) => (offer.offerStatus ?? offer.status) === 'ACCEPTED') ?? null;
  const effectiveSelectedOfferId =
    pendingOffers.find((offer) => (offer.offerId || offer.id) === selectedOfferId)?.offerId ??
    pendingOffers.find((offer) => (offer.offerId || offer.id) === selectedOfferId)?.id ??
    pendingOffers[0]?.offerId ??
    pendingOffers[0]?.id ??
    '';
  const selectedOffer =
    pendingOffers.find((offer) => (offer.offerId || offer.id) === effectiveSelectedOfferId) ?? null;

  const canOpenTrackingMap = Boolean(
    requestData &&
      requestData.pickupLocation.latitude !== null &&
      requestData.pickupLocation.longitude !== null &&
      requestData.dropoffLocation.latitude !== null &&
      requestData.dropoffLocation.longitude !== null,
  );

  const openTracking = useCallback((): void => {
    if (!requestData || !canOpenTrackingMap) return;
    router.push(buildTrackingHref(requestData));
  }, [canOpenTrackingMap, requestData, router]);

  const openPaymentScreen = useCallback((): void => {
    if (!requestData || !selectedOffer) return;

    const offerId = selectedOffer.offerId || selectedOffer.id;
    setErrorMessage('');
    setSuccessMessage('');
    setIsOpeningPaymentOfferId(offerId);

    router.push(
      (`/request-payment?requestId=${encodeURIComponent(requestData.id)}&offerId=${encodeURIComponent(offerId)}&request=${encodeURIComponent(JSON.stringify(requestData))}&offer=${encodeURIComponent(JSON.stringify(selectedOffer))}`) as Href,
    );

    setTimeout(() => setIsOpeningPaymentOfferId(''), 0);
  }, [requestData, router, selectedOffer]);

  const onCancelPayment = useCallback((): void => {
    if (!requestData || !paymentSummary || isCancellingPayment) return;

    void (async () => {
      setIsCancellingPayment(true);
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const response = await cancelPaymentHold(requestData.id);
        setPaymentSummary(response);
        setSuccessMessage('Payment hold released successfully.');
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to release payment hold.',
        );
      } finally {
        setIsCancellingPayment(false);
      }
    })();
  }, [isCancellingPayment, paymentSummary, requestData]);

  if (isLoading && !requestData) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading request status…</Text>
      </SafeAreaView>
    );
  }

  if (!requestData) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.title}>Request Status</Text>
        <Text style={styles.errorText}>{errorMessage || 'Unable to load request status.'}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadStatus(false)}>
          <Text style={styles.primaryButtonText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const progressIndex = STATUS_PROGRESS[requestData.status];
  const headline = getHeadline(requestData.status, offers.length);
  const helperText = buildOffersHelperText(requestData, offers.length);
  const canChooseOffer = requestData.status === 'PENDING_QUOTES' || requestData.status === 'QUOTED';
  const canCancelPaymentHold =
    paymentSummary !== null &&
    (paymentSummary.status === 'PAYMENT_HOLD_PENDING' || paymentSummary.status === 'PAYMENT_HELD');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadStatus(true)} />}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>{headline}</Text>
          <Text style={styles.subtitle}>
            Track the progress of your transport request and compare driver offers.
          </Text>
          <Text style={styles.statusPill}>
            {requestData.statusLabel || STATUS_LABELS[requestData.status] || requestData.status}
          </Text>
          <Text style={styles.metaText}>Request #{shortRequestId(requestData.id)}</Text>
          <Text style={styles.metaText}>Submitted: {formatDate(requestData.submittedAt)}</Text>
          <Text style={styles.helperText}>{helperText}</Text>
          {paymentSummary ? (
            <Text style={styles.helperText}>
              Payment: {getPaymentStatusLabel(paymentSummary.status)} via{' '}
              {getPaymentMethodLabel(paymentSummary.paymentMethod)}
            </Text>
          ) : null}
          <View
            style={[
              styles.socketBadge,
              socketState === 'connected'
                ? styles.socketBadgeConnected
                : socketState === 'error' || socketState === 'disconnected'
                  ? styles.socketBadgeWarning
                  : styles.socketBadgeNeutral,
            ]}
          >
            <Text style={styles.socketBadgeText}>{getSocketStateLabel(socketState)}</Text>
          </View>
          {socketMessage ? <Text style={styles.socketMessage}>{socketMessage}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Progress</Text>
          {requestData.status === 'CANCELLED' ? (
            <Text style={styles.errorText}>This request has been cancelled.</Text>
          ) : (
            TIMELINE_STEPS.map((step, index) => {
              const isDone = progressIndex > index;
              const isCurrent = progressIndex === index;

              return (
                <View key={step.key} style={styles.timelineRow}>
                  <View
                    style={[
                      styles.timelineDot,
                      isDone ? styles.timelineDotDone : undefined,
                      isCurrent ? styles.timelineDotCurrent : undefined,
                    ]}
                  />
                  <Text
                    style={[
                      styles.timelineText,
                      isDone ? styles.timelineTextDone : undefined,
                      isCurrent ? styles.timelineTextCurrent : undefined,
                    ]}
                  >
                    {step.label}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Request Summary</Text>
          <Text style={styles.rowLabel}>Service</Text>
          <Text style={styles.rowValue}>
            {requestData.service?.nameEn || requestData.service?.key || requestData.serviceId}
          </Text>
          <Text style={styles.rowLabel}>Pickup</Text>
          <Text style={styles.rowValue}>{formatLocation(requestData.pickupLocation)}</Text>
          <Text style={styles.rowLabel}>Dropoff</Text>
          <Text style={styles.rowValue}>{formatLocation(requestData.dropoffLocation)}</Text>
          <Text style={styles.rowLabel}>Date & Time</Text>
          <Text style={styles.rowValue}>
            {requestData.schedule.isImmediate
              ? 'Immediate pickup'
              : formatDate(requestData.schedule.scheduledPickupAt)}
          </Text>
          <Text style={styles.rowLabel}>Item</Text>
          <Text style={styles.rowValue}>
            {requestData.itemDetails.title || 'N/A'} ({requestData.itemDetails.type || 'N/A'})
          </Text>
          {requestData.itemDetails.description ? (
            <Text style={styles.rowValue}>{requestData.itemDetails.description}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Hold</Text>
          {paymentSummary ? (
            <>
              <Text style={styles.rowLabel}>Agreed amount</Text>
              <Text style={styles.rowValue}>
                {formatMoney(paymentSummary.amount, paymentSummary.currency)}
              </Text>
              <Text style={styles.rowLabel}>Payment method</Text>
              <Text style={styles.rowValue}>
                {getPaymentMethodLabel(paymentSummary.paymentMethod)}
              </Text>
              <Text style={styles.rowLabel}>Status</Text>
              <Text style={styles.rowValue}>{getPaymentStatusLabel(paymentSummary.status)}</Text>
              <Text style={styles.rowLabel}>Held amount</Text>
              <Text style={styles.rowValue}>
                {formatMoney(paymentSummary.heldAmount, paymentSummary.currency)}
              </Text>
              <Text style={styles.rowLabel}>Captured amount</Text>
              <Text style={styles.rowValue}>
                {formatMoney(paymentSummary.capturedAmount, paymentSummary.currency)}
              </Text>
              <Text style={styles.helperText}>
                The agreed amount will be held now and will only be permanently deducted after final delivery is confirmed.
              </Text>
              {canCancelPaymentHold ? (
                <Pressable
                  style={[styles.secondaryButton, isCancellingPayment && styles.disabledButton]}
                  disabled={isCancellingPayment}
                  onPress={onCancelPayment}
                >
                  <Text style={styles.secondaryButtonText}>
                    {isCancellingPayment ? 'Releasing hold…' : 'Release Payment Hold'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <Text style={styles.rowValue}>
              No payment hold yet. Choose a driver offer to continue to payment.
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver Offers</Text>
          {offers.length === 0 ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.rowValue}>Waiting for offers…</Text>
            </View>
          ) : (
            <Text style={styles.rowValue}>{helperText}</Text>
          )}

          {selectedOffer ? (
            <View style={styles.selectedOfferBanner}>
              <Text style={styles.selectedOfferLabel}>Selected offer</Text>
              <Text style={styles.selectedOfferValue}>
                {selectedOffer.driverName || 'Driver'} •{' '}
                {formatMoney(selectedOffer.proposedPrice ?? selectedOffer.price, selectedOffer.currency)}
              </Text>
            </View>
          ) : null}

          {acceptedOffer ? (
            <View style={styles.offerCardAccepted}>
              <Text style={styles.offerCardTitle}>Accepted Offer</Text>
              <Text style={styles.offerPrimaryValue}>
                {acceptedOffer.driverName || 'Driver'} •{' '}
                {formatMoney(acceptedOffer.proposedPrice ?? acceptedOffer.price, acceptedOffer.currency)}
              </Text>
              <Text style={styles.rowValue}>Accepted at: {formatDate(acceptedOffer.acceptedAt)}</Text>
            </View>
          ) : null}

          {offers.map((offer) => {
            const offerKey = offer.offerId || offer.id;
            const isPending = (offer.offerStatus ?? offer.status) === 'PENDING';
            const isSelected = effectiveSelectedOfferId === offerKey;
            const isOpening = isOpeningPaymentOfferId === offerKey;

            return (
              <Pressable
                key={offerKey}
                style={[styles.offerCard, isSelected ? styles.offerCardSelected : undefined]}
                disabled={!isPending}
                onPress={() => setSelectedOfferId(offerKey)}
              >
                <View style={styles.offerTopRow}>
                  {offer.driverVehiclePhoto ? (
                    <Image
                      source={{ uri: resolveAssetUrl(offer.driverVehiclePhoto) }}
                      style={styles.offerVehiclePhoto}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.offerVehiclePhotoPlaceholder}>
                      <Text style={styles.offerVehiclePhotoPlaceholderText}>No Photo</Text>
                    </View>
                  )}
                  <View style={styles.offerTopText}>
                    <Text style={styles.offerCardTitle}>{offer.driverName || 'Driver'}</Text>
                    <Text style={styles.offerRatingText}>{getRatingText(offer.driverRating)}</Text>
                    <Text style={styles.offerStatusText}>
                      Status: {offer.offerStatus || offer.status}
                    </Text>
                  </View>
                  <View style={styles.offerPriceBlock}>
                    <Text style={styles.offerPriceValue}>
                      {formatMoney(offer.proposedPrice ?? offer.price, offer.currency)}
                    </Text>
                    <Text style={styles.offerArrivalText}>
                      ETA {offer.estimatedArrivalTime ? formatDate(offer.estimatedArrivalTime) : 'N/A'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.rowValue}>
                  Estimated delivery:{' '}
                  {offer.estimatedDeliveryAt ? formatDate(offer.estimatedDeliveryAt) : 'N/A'}
                </Text>
                {offer.message ? <Text style={styles.rowValue}>Message: {offer.message}</Text> : null}

                {isPending ? (
                  <Pressable
                    style={[
                      styles.primaryButton,
                      (!canChooseOffer || Boolean(isOpeningPaymentOfferId)) && styles.disabledButton,
                    ]}
                    disabled={!canChooseOffer || Boolean(isOpeningPaymentOfferId)}
                    onPress={() => {
                      setSelectedOfferId(offerKey);
                      if (isSelected) {
                        openPaymentScreen();
                      }
                    }}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isOpening ? 'Opening payment…' : isSelected ? 'Continue to Payment' : 'Select Driver'}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}

          {offers.length > 0 && pendingOffers.length === 0 && !acceptedOffer ? (
            <Text style={styles.rowValue}>All offers are no longer pending.</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Driver & Tracking</Text>
          {requestData.driverSummary.assigned ? (
            <>
              <Text style={styles.rowValue}>Driver: {requestData.driverSummary.driverName || 'N/A'}</Text>
              <Text style={styles.rowValue}>Vehicle: {requestData.driverSummary.vehicleInfo || 'N/A'}</Text>
            </>
          ) : (
            <Text style={styles.rowValue}>No driver assigned yet.</Text>
          )}
          {requestData.trackingSummary.available ? (
            <Text style={styles.rowValue}>
              Tracking updated {formatDate(requestData.trackingSummary.lastUpdatedAt)}
            </Text>
          ) : (
            <Text style={styles.rowValue}>Tracking is not available yet.</Text>
          )}
          <Pressable
            style={[styles.primaryButton, !canOpenTrackingMap && styles.disabledButton]}
            onPress={openTracking}
            disabled={!canOpenTrackingMap}
          >
            <Text style={styles.primaryButtonText}>Open Live Map</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Additional Charges</Text>
          {additionalCharges.length === 0 ? (
            <Text style={styles.rowValue}>No additional charges yet.</Text>
          ) : (
            additionalCharges.map((charge) => (
              <View key={charge.id} style={styles.additionalChargeCard}>
                <Text style={styles.offerPrimaryValue}>
                  {formatMoney(charge.amount, charge.currency)}
                </Text>
                <Text style={styles.rowValue}>Reason: {charge.reason}</Text>
                {charge.equipmentType ? (
                  <Text style={styles.rowValue}>Equipment: {charge.equipmentType}</Text>
                ) : null}
                <Text style={styles.rowValue}>Status: {charge.status}</Text>
                <Text style={styles.rowValue}>Added: {formatDate(charge.createdAt)}</Text>
                {charge.invoiceUrl ? (
                  <Text style={styles.rowValue}>Invoice: {resolveAssetUrl(charge.invoiceUrl)}</Text>
                ) : null}
              </View>
            ))
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Photos</Text>
          {requestData.photos.length === 0 ? (
            <Text style={styles.rowValue}>No photos added.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {requestData.photos.map((photo) => (
                <Image
                  key={photo.id}
                  source={{ uri: resolveAssetUrl(photo.url) }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          )}
        </View>

        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.primaryButton} onPress={() => void loadStatus(false)}>
            <Text style={styles.primaryButtonText}>{isRefreshing ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)/home' as Href)}>
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </Pressable>
        </View>
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
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 6,
    color: '#475569',
    fontSize: 14,
  },
  statusPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: '600',
  },
  metaText: {
    marginTop: 8,
    color: '#334155',
    fontSize: 13,
  },
  helperText: {
    marginTop: 8,
    color: '#475569',
    fontSize: 13,
  },
  socketBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  socketBadgeConnected: {
    backgroundColor: '#DCFCE7',
  },
  socketBadgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  socketBadgeNeutral: {
    backgroundColor: '#E2E8F0',
  },
  socketBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  socketMessage: {
    marginTop: 8,
    color: '#B45309',
    fontSize: 13,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#CBD5E1',
  },
  timelineDotDone: {
    backgroundColor: '#10B981',
  },
  timelineDotCurrent: {
    backgroundColor: '#2563EB',
  },
  timelineText: {
    color: '#64748B',
    fontSize: 14,
  },
  timelineTextDone: {
    color: '#0F172A',
    fontWeight: '500',
  },
  timelineTextCurrent: {
    color: '#1D4ED8',
    fontWeight: '700',
  },
  rowLabel: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    color: '#0F172A',
    marginTop: 2,
  },
  emptyState: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  selectedOfferBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  selectedOfferLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    textTransform: 'uppercase',
  },
  selectedOfferValue: {
    marginTop: 4,
    color: '#0F172A',
    fontWeight: '600',
  },
  offerCardAccepted: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
  },
  offerCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  offerCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FBFF',
  },
  offerTopRow: {
    flexDirection: 'row',
    gap: 10,
  },
  offerVehiclePhoto: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  offerVehiclePhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  offerVehiclePhotoPlaceholderText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
  },
  offerTopText: {
    flex: 1,
    gap: 3,
  },
  offerCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  offerRatingText: {
    color: '#475569',
    fontSize: 13,
  },
  offerStatusText: {
    color: '#64748B',
    fontSize: 12,
  },
  offerPriceBlock: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
  offerPriceValue: {
    fontWeight: '700',
    color: '#0F172A',
    fontSize: 14,
    textAlign: 'right',
  },
  offerArrivalText: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 12,
    textAlign: 'right',
  },
  offerPrimaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  additionalChargeCard: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 4,
  },
  photoRow: {
    gap: 10,
  },
  photo: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  actionsRow: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
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
  disabledButton: {
    opacity: 0.6,
  },
  loadingText: {
    color: '#475569',
    marginTop: 8,
    fontSize: 14,
  },
  successText: {
    color: '#15803D',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
});
