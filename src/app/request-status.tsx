import { PaymentInfo, usePaymentPolicy } from '@/components/payment-info';
import { BookingPaymentStatus } from '@/components/booking-payment-status';
import { OrderSectionHeading, OrderDetailRow, OrderRouteCard, OrderNotice, OrderEmptyState, OrderProgress } from '@/components/order-ui';
import { orderColors as colors } from '@/theme/order-theme';
import { MapLocationMarker, MAP_COLORS } from '@/components/map-location-marker';
import { RequestDocuments } from '@/components/request-documents';
import { ReportDriver } from '@/components/report-driver';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ColorValue,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isNativeMapRuntimeAvailable,
  NativeMapView,
  NativeMapViewDirections,
  NativeMarker,
  PROVIDER_GOOGLE,
  type Region,
} from '@/components/native-maps';
import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import { getApiBaseUrl } from '@/config/backend';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { useTransportRequestChatRoom } from '@/hooks/use-transport-request-chat-room';
import {
  approveAdditionalCharge,
  confirmDriverOffer,
  cancelFurnitureReservation,
  cancelCollectedTrip,
  deleteCustomerRequest,
  getCustomerRequestOffers,
  getCustomerRequestStatus,
  getDefaultPaymentMethod,
  getRequestAdditionalCharges,
  getRequestTracking,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth-token';
import { isHistoryRequestStatus } from '@/lib/request-status';
import { DEFAULT_LANGUAGE } from '@/localization/languages';
import { useAppLanguage } from '@/localization/provider';
import {
  connectSocket,
  disconnectSocket,
  joinTripRoom,
  leaveTripRoom,
  onAdditionalChargeAdded,
  onDriverLocationUpdated,
  onDriverNearDelivery,
  onItemDelivered,
  onItemPickedUp,
  onOfferNew,
  onRequestDriverSelected,
  onSocketConnected,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
  waitForSocketConnection,
} from '@/services/socketService';
import type {
  AdditionalCharge,
  CustomerRequestOfferSummary,
  CustomerRequestStatus,
  DriverLocation,
  ProofPhoto,
  RequestStatusResponse,
  RequestTracking,
  RequestTrackingStatus,
  SavedPaymentMethodSummary,
} from '@/types/customer-request';
import { validateItemDeliveredPayload } from '@/utils/deliveryValidation';
import {
  validateDriverLocationUpdatedPayload,
  validateDriverNearDeliveryPayload,
  validateItemPickedUpPayload,
  validateTripStatusUpdatedPayload,
} from '@/utils/pickupValidation';
import appI18n from '@/localization/i18n';

interface OrderProgressStep {
  id: number;
  label: string;
}

type SocketState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'unavailable';

const STATUS_LABELS: Partial<Record<CustomerRequestStatus, string>> = {
  RESERVED: 'Driver reserved — awaiting payment',
  PENDING_QUOTES: 'Waiting for driver offers',
  QUOTED: 'Choose your driver',
  ACCEPTED: 'Driver before starting the order',
  DRIVER_ASSIGNED: 'Driver before starting the order',
  DRIVER_GOING_TO_PICKUP: 'Driver is on the way to the pickup location',
  DRIVER_ARRIVED_PICKUP: 'Driver has arrived at the pickup location',
  PICKUP_IN_PROGRESS: 'Driver has arrived at the pickup location',
  ITEM_PICKED_UP: 'Pickup completed',
  IN_TRANSIT: 'Driver is on the way to the delivery location',
  DRIVER_GOING_TO_DROPOFF: 'Driver is on the way to the delivery location',
  DELIVERED: 'Delivered',
  COMPLETED: 'Delivered',
};

const ORDER_PROGRESS_STEPS: OrderProgressStep[] = [
  { id: 1, label: 'Submitted' },
  { id: 2, label: 'Driver Found' },
  { id: 3, label: 'Picked Up' },
  { id: 4, label: 'In Transit' },
  { id: 5, label: 'Delivered' },
];

function formatDate(value: string | null | undefined): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { hour12: false });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getOrderReference(id: string): string {
  const compact = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return appI18n.t("TRP-{{value0}}", { value0: compact || id });
}

function resolveAssetUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|file:|content:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const baseUrl = getApiBaseUrl();
  return appI18n.t("{{value0}}{{value1}}{{value2}}", { value0: baseUrl, value1: trimmed.startsWith('/') ? '' : '/', value2: trimmed });
}

function formatLocation(
  location: RequestStatusResponse['pickupLocation'] | RequestStatusResponse['dropoffLocation'],
): string {
  if (location.address) return location.address;
  if (location.latitude === null || location.longitude === null) return 'N/A';
  return appI18n.t("Lat {{value0}}, Lng {{value1}}", { value0: location.latitude.toFixed(6), value1: location.longitude.toFixed(6) });
}

function getOrderProgressStep(
  status: CustomerRequestStatus | RequestTrackingStatus,
): number {
  switch (status) {
    case 'DELIVERED':
    case 'COMPLETED':
      return 5;
    case 'IN_TRANSIT':
    case 'DRIVER_GOING_TO_DROPOFF':
      return 4;
    case 'ITEM_PICKED_UP':
      return 3;
    case 'ACCEPTED':
    case 'DRIVER_ASSIGNED':
    case 'DRIVER_GOING_TO_PICKUP':
    case 'DRIVER_ARRIVED_PICKUP':
    case 'PICKUP_IN_PROGRESS':
      return 2;
    case 'CANCELLED':
      return 0;
    default:
      return 1;
  }
}

function getDriverInitials(name: string | null | undefined): string {
  const clean = name?.trim();
  if (!clean) {
    return 'DR';
  }

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function buildMapRegion(
  pickupLocation: RequestStatusResponse['pickupLocation'],
  dropoffLocation: RequestStatusResponse['dropoffLocation'],
  driverLocation: DriverLocation | null,
): Region {
  const coordinates = [
    pickupLocation.latitude,
    dropoffLocation.latitude,
    driverLocation?.latitude ?? null,
  ].filter((value): value is number => value !== null);
  const coordinatesLng = [
    pickupLocation.longitude,
    dropoffLocation.longitude,
    driverLocation?.longitude ?? null,
  ].filter((value): value is number => value !== null);

  const minLat = Math.min(...coordinates);
  const maxLat = Math.max(...coordinates);
  const minLng = Math.min(...coordinatesLng);
  const maxLng = Math.max(...coordinatesLng);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.8, 0.03),
    longitudeDelta: Math.max((maxLng - minLng) * 1.8, 0.03),
  };
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

function getSocketStateLabel(socketState: SocketState): string {
  switch (socketState) {
    case 'connecting':
      return appI18n.t("Realtime connecting…");
    case 'connected':
      return appI18n.t("Realtime connected");
    case 'disconnected':
      return appI18n.t("Realtime disconnected");
    case 'error':
      return appI18n.t("Realtime connection issue");
    case 'unavailable':
      return appI18n.t("Realtime unavailable");
    default:
      return appI18n.t("Realtime idle");
  }
}

function getRatingText(rating: number | null): string {
  if (rating === null) return appI18n.t("No rating yet");
  return appI18n.t("★ {{value0}}", { value0: rating.toFixed(1) });
}

async function waitForCancelledStatus(
  requestId: string,
  attempts = 10,
  delayMs = 1000,
): Promise<RequestStatusResponse | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await getCustomerRequestStatus(requestId).catch(() => null);

    if (status?.status === 'CANCELLED') {
      return status;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

function IconSymbol({
  name,
  color,
  size = 20,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

function canDeleteRequest(status: CustomerRequestStatus): boolean {
  return (
    status === 'DRAFT' ||
    status === 'PENDING_QUOTES' ||
    status === 'QUOTED' ||
    status === 'CANCELLED'
  );
}

function buildOffersHelperText(requestData: RequestStatusResponse, offersCount: number): string {
  if (offersCount > 0) {
    const lowestOffer = requestData.quotesSummary.lowestPrice;
    const lowestCurrency = requestData.quotesSummary.currency;

    if (lowestOffer !== null && lowestCurrency) {
      return appI18n.t("{{value0}} offers available • Lowest {{value1}} {{value2}}", { value0: offersCount, value1: lowestOffer, value2: lowestCurrency });
    }

    return appI18n.t("{{value0}} offers available", { value0: offersCount });
  }

  if (requestData.dispatchSummary?.noConnectedDriversAvailable) {
    return appI18n.t("Your request was created. We are waiting for available drivers.");
  }

  if ((requestData.dispatchSummary?.eligibleDriversCount ?? 0) > 0) {
    return appI18n.t("Sent to {{value0}} eligible drivers.", { value0: requestData.dispatchSummary?.eligibleDriversCount ?? 0 });
  }

  return appI18n.t("Drivers will review your request and send offers soon.");
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

function formatSavedPaymentMethod(paymentMethod: SavedPaymentMethodSummary | null): string {
  if (!paymentMethod) {
    return appI18n.t("No saved card");
  }

  const brand = paymentMethod.brand?.toUpperCase() || 'CARD';
  const last4 = paymentMethod.last4 ?? '----';
  return appI18n.t("{{value0}} •••• {{value1}}", { value0: brand, value1: last4 });
}

function getAdditionalChargePaymentOption(charge: AdditionalCharge): 'SAVED_CARD' | 'CASH_ON_DELIVERY' | null {
  if (charge.payment.savedPaymentMethod || charge.payment.stripePaymentIntentId) {
    return 'SAVED_CARD';
  }

  if (charge.status === 'CAPTURED' && charge.approval.approvedAt) {
    return 'CASH_ON_DELIVERY';
  }

  return null;
}

function getAdditionalChargePaymentMethodLabel(
  charge: AdditionalCharge,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const option = getAdditionalChargePaymentOption(charge);

  if (option === 'CASH_ON_DELIVERY') {
    return t('extra_expense.cash_on_delivery_option');
  }

  if (charge.payment.savedPaymentMethod) {
    return formatSavedPaymentMethod(charge.payment.savedPaymentMethod);
  }

  return formatSavedPaymentMethod(null);
}

function dedupeProofPhotos(photos: ProofPhoto[]): ProofPhoto[] {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    if (seen.has(photo.id)) return false;
    seen.add(photo.id);
    return true;
  });
}

function getTrackingStatusLabel(
  status: CustomerRequestStatus | RequestTrackingStatus,
  nearDeliveryNotifiedAt: string | null,
  ratingAvailable: boolean,
): string {
  if (
    nearDeliveryNotifiedAt &&
    (status === 'IN_TRANSIT' || status === 'DRIVER_GOING_TO_DROPOFF')
  ) {
    return appI18n.t("Driver is near the delivery location");
  }

  if (ratingAvailable && (status === 'DELIVERED' || status === 'COMPLETED')) {
    return appI18n.t("Rating pending");
  }

  return appI18n.t(STATUS_LABELS[status as CustomerRequestStatus] ?? status);
}

function buildTrackingHref(
  requestData: RequestStatusResponse,
  trackingStatus: CustomerRequestStatus | RequestTrackingStatus,
): Href {
  const params = {
    tripId: requestData.id,
    pickupLatitude: String(requestData.pickupLocation.latitude),
    pickupLongitude: String(requestData.pickupLocation.longitude),
    pickupAddress: requestData.pickupLocation.address ?? '',
    dropoffLatitude: String(requestData.dropoffLocation.latitude),
    dropoffLongitude: String(requestData.dropoffLocation.longitude),
    dropoffAddress: requestData.dropoffLocation.address ?? '',
  };

  if (trackingStatus === 'DRIVER_ARRIVED_PICKUP' || trackingStatus === 'PICKUP_IN_PROGRESS') {
    return { pathname: '/waiting-for-pickup', params };
  }

  if (
    trackingStatus === 'ITEM_PICKED_UP' ||
    trackingStatus === 'IN_TRANSIT' ||
    trackingStatus === 'DRIVER_GOING_TO_DROPOFF'
  ) {
    return { pathname: '/customer-delivery-tracking', params };
  }

  if (trackingStatus === 'DELIVERED' || trackingStatus === 'COMPLETED') {
    return {
      pathname: '/customer-trip-delivered',
      params: { tripId: requestData.id },
    };
  }

  return {
    pathname: '/customer-tracking',
    params,
  };
}

export default function RequestStatusScreen() {
  const { policy: transactionPolicy } = usePaymentPolicy();
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const refreshTs = typeof params.refreshTs === 'string' ? params.refreshTs : '';
  const accessToken = useMemo(() => getAccessToken(), []);
  const mapsApiKey = GOOGLE_MAPS_API_KEY;

  const [requestData, setRequestData] = useState<RequestStatusResponse | null>(null);
  const [offers, setOffers] = useState<CustomerRequestOfferSummary[]>([]);
  const [trackingData, setTrackingData] = useState<RequestTracking | null>(null);
  const [latestDriverLocation, setLatestDriverLocation] = useState<DriverLocation | null>(null);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<SavedPaymentMethodSummary | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const [isOpeningPaymentOfferId, setIsOpeningPaymentOfferId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCancellingTrip, setIsCancellingTrip] = useState<boolean>(false);
  const [isCancelTripModalVisible, setIsCancelTripModalVisible] = useState<boolean>(false);
  const [activeAdditionalCharge, setActiveAdditionalCharge] = useState<AdditionalCharge | null>(null);
  const [additionalChargeConfirmationText, setAdditionalChargeConfirmationText] = useState<string>('');
  const [additionalChargePaymentOption, setAdditionalChargePaymentOption] =
    useState<'SAVED_CARD' | 'CASH_ON_DELIVERY'>('SAVED_CARD');
  const [isApprovingAdditionalCharge, setIsApprovingAdditionalCharge] = useState<boolean>(false);
  const [cancelTripDebugMessage, setCancelTripDebugMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [nearDeliveryMessage, setNearDeliveryMessage] = useState<string>('');
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string>('');
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  const [socketState, setSocketState] = useState<SocketState>(accessToken ? 'idle' : 'unavailable');
  const [, setSocketMessage] = useState<string>(
    accessToken ? '' : 'Missing auth token. Realtime offer updates are unavailable.',
  );
  const canUseRealtime = Boolean(
    accessToken &&
    requestId &&
    requestData &&
    !isHistoryRequestStatus(requestData.status),
  );

  const loadStatus = useCallback(
    async (refresh: boolean): Promise<void> => {
      if (!requestId) {
        setErrorMessage(appI18n.t("Missing request id. Please go back and submit your request again."));
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
        let data: RequestStatusResponse;
        try {
          data = await getCustomerRequestStatus(requestId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : appI18n.t("Unknown status error.");
          throw new Error(appI18n.t("Request status failed: {{value0}}", { value0: message }));
        }

        if (data.status === 'CANCELLED') {
          setRequestData(data);
          setOffers([]);
          setAdditionalCharges([]);
          setDefaultPaymentMethod(null);
          setTrackingData(null);
          setLatestDriverLocation(null);
          setNearDeliveryMessage('');
          return;
        }

        const [offersResponse, chargesResponse, paymentMethodResponse] =
          await Promise.all([
            getCustomerRequestOffers(requestId).catch((error: unknown) => {
              throw new Error(
                appI18n.t("Request offers failed: {{value0}}", { value0: error instanceof Error ? error.message : appI18n.t("Unknown offers error.") }),
              );
            }),
            getRequestAdditionalCharges(requestId).catch((error: unknown) => {
              throw new Error(
                appI18n.t("Additional charges failed: {{value0}}", { value0: error instanceof Error
                  ? error.message
                  : appI18n.t("Unknown additional charges error.") }),
              );
            }),
            getDefaultPaymentMethod().catch((error: unknown) => {
              throw new Error(
                appI18n.t("Default payment method failed: {{value0}}", { value0: error instanceof Error
                  ? error.message
                  : appI18n.t("Unknown payment method error.") }),
              );
            }),
          ]);
        let nextTracking: RequestTracking | null = null;

        try {
          nextTracking = await getRequestTracking(requestId);
        } catch (trackingError) {
          const trackingMessage =
            trackingError instanceof Error ? trackingError.message.toLowerCase() : '';

          if (!trackingMessage.includes('not found')) {
            throw new Error(
              appI18n.t("Request tracking failed: {{value0}}", { value0: trackingError instanceof Error
                ? trackingError.message
                : appI18n.t("Unknown tracking error.") }),
            );
          }
        }

        setRequestData(data);
        setOffers(sortOffers(offersResponse.offers ?? []));
        setAdditionalCharges(chargesResponse);
        setDefaultPaymentMethod(paymentMethodResponse);
        setTrackingData(nextTracking);
        setLatestDriverLocation(nextTracking?.latestDriverLocation ?? null);
        setNearDeliveryMessage(
          nextTracking?.nearDeliveryNotifiedAt
            ? 'Your driver is close to the delivery location. Delivery is approaching.'
            : '',
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : appI18n.t("Failed to load request status.");
        const normalized = message.toLowerCase();

        if (normalized.includes('not found')) {
          setErrorMessage(appI18n.t("Request not found."));
        } else if (normalized.includes('forbidden') || normalized.includes('access')) {
          setErrorMessage(appI18n.t("You do not have access to this request."));
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
  }, [loadStatus, refreshTs]);

  useEffect(() => {
    if (!requestData?.status || isHistoryRequestStatus(requestData.status)) return;
    const timer = setInterval(() => void loadStatus(true), 15000);
    return () => clearInterval(timer);
  }, [loadStatus, requestData?.status]);

  useEffect(() => {
    if (!canUseRealtime) {
      disconnectSocket();
      setTimeout(() => {
        setSocketState(accessToken ? 'idle' : 'unavailable');
        setSocketMessage(
          accessToken ? '' : 'Missing auth token. Realtime offer updates are unavailable.',
        );
      }, 0);
      return;
    }

    const socketAccessToken = accessToken;
    if (!socketAccessToken) {
      return;
    }

    setTimeout(() => setSocketState('connecting'), 0);

    try {
      connectSocket(socketAccessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : appI18n.t("Failed to connect realtime socket.");
      setTimeout(() => {
        setSocketState('error');
        setSocketMessage(message);
      }, 0);
      return;
    }

    void waitForSocketConnection(5000)
      .then(() => {
        setSocketState('connected');
        setSocketMessage('');
        if (requestData?.driverSummary.assigned && requestData.status !== 'RESERVED') joinTripRoom(requestId);
      })
      .catch((error) => {
        setSocketState('error');
        setSocketMessage(error instanceof Error ? error.message : appI18n.t("Realtime connection timeout."));
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
            canEdit: false,
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
      void loadStatus(true);
    });

    const unsubDriverLocation = onDriverLocationUpdated((payload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated || validated.tripId !== requestId) return;

      setLatestDriverLocation(validated);
      setTrackingData((previousTrackingData) =>
        previousTrackingData
          ? { ...previousTrackingData, latestDriverLocation: validated, updatedAt: validated.recordedAt }
          : previousTrackingData,
      );
    });

    const unsubTripStatusUpdated = onTripStatusUpdated((payload) => {
      const validated = validateTripStatusUpdatedPayload(payload);
      if (!validated || validated.tripId !== requestId) return;

      setRequestData((previousRequestData) =>
        previousRequestData
          ? {
            ...previousRequestData,
            status: validated.status as CustomerRequestStatus,
            statusLabel:
              STATUS_LABELS[validated.status as CustomerRequestStatus] ??
              previousRequestData.statusLabel,
            updatedAt: validated.updatedAt,
          }
          : previousRequestData,
      );

      setTrackingData((previousTrackingData) =>
        previousTrackingData
          ? {
            ...previousTrackingData,
            currentStatus: validated.status as RequestTrackingStatus,
            updatedAt: validated.updatedAt,
          }
          : previousTrackingData,
      );
    });

    const unsubItemPickedUp = onItemPickedUp((payload) => {
      const validated = validateItemPickedUpPayload(payload);
      if (!validated || validated.tripId !== requestId) return;

      setTrackingData((previousTrackingData) =>
        previousTrackingData
          ? {
            ...previousTrackingData,
            currentStatus: 'ITEM_PICKED_UP',
            pickupProofPhotos: dedupeProofPhotos([
              ...previousTrackingData.pickupProofPhotos,
              ...validated.pickupProofPhotos,
            ]),
            updatedAt: validated.pickedUpAt,
          }
          : previousTrackingData,
      );
      setSuccessMessage('Pickup completed with proof photos.');
    });

    const unsubItemDelivered = onItemDelivered((payload) => {
      const validated = validateItemDeliveredPayload(payload);
      if (!validated || validated.tripId !== requestId) return;

      setTrackingData((previousTrackingData) =>
        previousTrackingData
          ? {
            ...previousTrackingData,
            currentStatus: 'DELIVERED',
            deliveryProofPhotos: dedupeProofPhotos([
              ...previousTrackingData.deliveryProofPhotos,
              ...validated.deliveryProofPhotos,
            ]),
            deliveredAt: validated.deliveredAt,
            ratingAvailable: validated.ratingAvailable,
            updatedAt: validated.deliveredAt,
          }
          : previousTrackingData,
      );
      setSuccessMessage('Delivery confirmed. Proof photos are now available.');

      if (validated.ratingAvailable) {
        router.replace((`/customer-rate-driver?tripId=${encodeURIComponent(requestId)}`) as Href);
      }
    });

    const unsubNearDelivery = onDriverNearDelivery((payload) => {
      const validated = validateDriverNearDeliveryPayload(payload);
      if (!validated || validated.tripId !== requestId) return;

      setNearDeliveryMessage('Your driver is close to the delivery location. Delivery is approaching.');
      setTrackingData((previousTrackingData) =>
        previousTrackingData
          ? {
            ...previousTrackingData,
            nearDeliveryNotifiedAt: validated.notifiedAt,
            updatedAt: validated.notifiedAt,
          }
          : previousTrackingData,
      );
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
      if (requestData?.driverSummary.assigned && requestData.status !== 'RESERVED') joinTripRoom(requestId);
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
      unsubDriverLocation();
      unsubTripStatusUpdated();
      unsubItemPickedUp();
      unsubItemDelivered();
      unsubNearDelivery();
      unsubAdditionalChargeAdded();
      unsubConnected();
      unsubDisconnected();
      unsubSocketError();
      leaveTripRoom(requestId);
    };
  }, [accessToken, canUseRealtime, loadStatus, requestId, router, requestData?.driverSummary.assigned, requestData?.status]);

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

  const effectiveTrackingStatus =
    trackingData?.currentStatus ?? requestData?.status ?? 'PENDING_QUOTES';
  const nearDeliveryNotifiedAt = trackingData?.nearDeliveryNotifiedAt ?? null;
  const ratingAvailable = trackingData?.ratingAvailable ?? false;
  const isHistoryRequest = isHistoryRequestStatus(requestData?.status);
  const canOpenChat = Boolean(
    !isHistoryRequest &&
    requestData?.driverDetailsAvailable === true &&
    (acceptedOffer || requestData?.driverSummary.assigned) &&
    (requestData?.driverSummary.driverId || acceptedOffer?.driverId),
  );
  const { room: chatRoom, isLoading: isChatRoomLoading } = useTransportRequestChatRoom({
    transportRequestId: requestId,
    enabled: canOpenChat,
  });
  const confirmationKeyword = t('extra_expense.confirm_keyword', { defaultValue: 'Agree' });
  const resolvedConfirmationLocale = language || DEFAULT_LANGUAGE;
  const trimmedAdditionalChargeConfirmationText = additionalChargeConfirmationText.trim();
  const isAdditionalChargeConfirmationValid =
    trimmedAdditionalChargeConfirmationText === confirmationKeyword;
  const currentOrderStep = getOrderProgressStep(effectiveTrackingStatus);
  const requestReference = getOrderReference(requestData?.id ?? requestId);
  const driverName = requestData?.driverDetailsAvailable ? (
    trackingData?.driverName ||
    requestData?.driverSummary.driverName ||
    acceptedOffer?.driverName ||
    selectedOffer?.driverName ||
    null) : null;
  const driverVehicleInfo =
    requestData?.driverSummary.vehicleInfo ||
    requestData?.itemDetails.title ||
    null;
  const driverRating = acceptedOffer?.driverRating ?? selectedOffer?.driverRating ?? null;
  const shouldShowTrackingMap = Boolean(requestData);
  const usesPickupDestination =
    effectiveTrackingStatus === 'ACCEPTED' ||
    effectiveTrackingStatus === 'DRIVER_ASSIGNED' ||
    effectiveTrackingStatus === 'DRIVER_GOING_TO_PICKUP' ||
    effectiveTrackingStatus === 'DRIVER_ARRIVED_PICKUP' ||
    effectiveTrackingStatus === 'PICKUP_IN_PROGRESS';
  const trackingDestination = requestData
    ? usesPickupDestination
      ? requestData.pickupLocation
      : requestData.dropoffLocation
    : null;

  const openTracking = useCallback((): void => {
    if (!requestData || !canOpenTrackingMap) return;
    router.push(buildTrackingHref(requestData, effectiveTrackingStatus));
  }, [canOpenTrackingMap, effectiveTrackingStatus, requestData, router]);

  const openPaymentScreen = async (): Promise<void> => {
    if (!requestData || !selectedOffer || requestData.confirmation) return;

    const offerId = selectedOffer.offerId || selectedOffer.id;
    setErrorMessage('');
    setSuccessMessage('');
    setIsOpeningPaymentOfferId(offerId);

    if (requestData.deferredReservationEligible ?? requestData.deferredFurnitureEligible) {
      try {
        await confirmDriverOffer(requestData.id, offerId, { confirm: true });
        const refreshed = await getCustomerRequestStatus(requestData.id);
        setRequestData(refreshed);
        setSuccessMessage(appI18n.t('Driver reserved. Payment opens 48 hours before pickup.'));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : appI18n.t('Unable to reserve driver.'));
      } finally { setIsOpeningPaymentOfferId(''); }
      return;
    }

    router.push(
      (`/request-payment?requestId=${encodeURIComponent(requestData.id)}&offerId=${encodeURIComponent(offerId)}&request=${encodeURIComponent(JSON.stringify(requestData))}&offer=${encodeURIComponent(JSON.stringify(selectedOffer))}`) as Href,
    );

    setTimeout(() => setIsOpeningPaymentOfferId(''), 0);
  };

  const goToHome = useCallback((): void => {
    router.replace('/(tabs)/home' as Href);
  }, [router]);

  const openChat = useCallback((): void => {
    if (!chatRoom) {
      return;
    }

    router.push(
      (`/chat?chatRoomId=${encodeURIComponent(chatRoom.id)}&transportRequestId=${encodeURIComponent(
        chatRoom.transportRequestId,
      )}`) as Href,
    );
  }, [chatRoom, router]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      const actionType = event.data.action.type;

      if (actionType !== 'GO_BACK' && actionType !== 'POP') {
        return;
      }

      event.preventDefault();
      goToHome();
    });

    return unsubscribe;
  }, [goToHome, navigation]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  const closeCancelTripModal = useCallback((): void => {
    if (isCancellingTrip) {
      return;
    }

    setIsCancelTripModalVisible(false);
  }, [isCancellingTrip]);

  const confirmCancelTrip = useCallback(async (): Promise<void> => {
    if (!requestData || isCancellingTrip) {
      return;
    }

    const cancellationTerms = requestData.cancellation.refundPreview ? { expectedRetainedAmount: requestData.cancellation.refundPreview.retainedAmount, policyVersion: requestData.paymentPolicy?.version } : undefined;
    try {
      setIsCancelTripModalVisible(false);
      setIsCancellingTrip(true);
      setCancelTripDebugMessage('Starting cancellation request…');
      setErrorMessage('');
      setSuccessMessage('');

      const result = requestData.status === 'RESERVED' ? await cancelFurnitureReservation(requestData.id) : await cancelCollectedTrip(requestData.id, cancellationTerms);

      setRequestData((previousRequestData) =>
        previousRequestData
          ? {
            ...previousRequestData,
            status: result.requestStatus,
            statusLabel: 'Cancelled',
            cancellation: {
              canCancelCollectedTrip: false,
              reason: 'Trip already cancelled.',
              refundPreview: null,
              action: 'NONE',
            },
          }
          : previousRequestData,
      );
      setCancelTripDebugMessage('Cancellation response received. Waiting for backend status sync…');
      const latestStatus = await waitForCancelledStatus(requestData.id);

      setRequestData((previousRequestData) =>
        previousRequestData
          ? {
            ...previousRequestData,
            status: latestStatus?.status ?? result.requestStatus,
            statusLabel: latestStatus?.statusLabel ?? 'Cancelled',
            cancellation:
              latestStatus?.cancellation ?? {
                canCancelCollectedTrip: false,
                reason: 'Trip already cancelled.',
                refundPreview: null,
                action: 'NONE',
              },
          }
          : previousRequestData,
      );
      setOffers([]);
      setAdditionalCharges([]);
      setDefaultPaymentMethod(null);
      setTrackingData(null);
      setLatestDriverLocation(null);
      setNearDeliveryMessage('');
      setSuccessMessage(
        requestData.confirmation ? appI18n.t('payment_info.cancel_result', { fee: formatMoney(result.retainedAmount, result.currency), released: formatMoney(('releasedAmount' in result ? result.releasedAmount : 0) ?? 0, result.currency) }) : requestData.status === 'RESERVED' ? appI18n.t('Reservation cancelled. No cancellation fee applies.') : `Trip cancelled. Refunded ${formatMoney(
          result.refundedAmount,
          result.currency,
        )}. Cancellation fee kept: ${formatMoney(
          result.retainedAmount,
          result.currency,
        )}.`,
      );
      setCancelTripDebugMessage('Cancellation completed successfully.');
    } catch (error) {
      const rawErrorMessage = error instanceof Error ? error.message : appI18n.t("Failed to cancel this trip.");
      const primaryErrorMessage = rawErrorMessage.includes('cancellation fee changed') ? appI18n.t('payment_info.review_fee_changes') : rawErrorMessage;
      setCancelTripDebugMessage(
        `Primary cancellation call failed: ${primaryErrorMessage}`,
      );

      try {
        setCancelTripDebugMessage('Primary cancellation call failed. Retrying once…');
        await sleep(800);
        await cancelCollectedTrip(requestData.id, cancellationTerms).catch(() => null);
        setCancelTripDebugMessage('Retry finished. Checking backend status…');
        const latestStatus = await waitForCancelledStatus(requestData.id);

        if (latestStatus?.status === 'CANCELLED') {
          setRequestData(latestStatus);
          setOffers([]);
          setAdditionalCharges([]);
          setDefaultPaymentMethod(null);
          setTrackingData(null);
          setLatestDriverLocation(null);
          setNearDeliveryMessage('');
          setErrorMessage('');
          setSuccessMessage('Trip cancelled successfully.');
          setCancelTripDebugMessage('Fallback status refresh confirmed cancellation.');
          return;
        }

        setCancelTripDebugMessage(
          `Backend status did not switch to cancelled yet. Last error: ${primaryErrorMessage}`,
        );
      } catch (statusError) {
        setCancelTripDebugMessage(
          `Fallback status refresh failed: ${statusError instanceof Error ? statusError.message : appI18n.t("Unknown error.")
          }`,
        );
      }

      setErrorMessage(primaryErrorMessage);
    } finally {
      setIsCancellingTrip(false);
    }
  }, [isCancellingTrip, requestData]);

  const onCancelTrip = useCallback((): void => {
    if (!requestData || isCancellingTrip) {
      return;
    }

    setCancelTripDebugMessage('Waiting for cancellation confirmation…');
    setIsCancelTripModalVisible(true);
  }, [isCancellingTrip, requestData]);

  const onRateDriver = useCallback((): void => {
    if (!requestData) {
      return;
    }

    router.push(
      (`/customer-rate-driver?tripId=${encodeURIComponent(requestData.id)}`) as Href,
    );
  }, [requestData, router]);

  const openAdditionalChargeFlow = useCallback((charge: AdditionalCharge): void => {
    setErrorMessage('');
    setSuccessMessage('');
    setActiveAdditionalCharge(charge);
    setAdditionalChargeConfirmationText('');
    setAdditionalChargePaymentOption(defaultPaymentMethod ? 'SAVED_CARD' : 'CASH_ON_DELIVERY');
  }, [defaultPaymentMethod]);

  const closeAdditionalChargeModal = useCallback((): void => {
    if (isApprovingAdditionalCharge) {
      return;
    }

    setActiveAdditionalCharge(null);
    setAdditionalChargeConfirmationText('');
    setAdditionalChargePaymentOption(defaultPaymentMethod ? 'SAVED_CARD' : 'CASH_ON_DELIVERY');
  }, [defaultPaymentMethod, isApprovingAdditionalCharge]);

  const onApproveAdditionalCharge = useCallback(async (): Promise<void> => {
    if (!activeAdditionalCharge || !isAdditionalChargeConfirmationValid || !transactionPolicy) {
      return;
    }

    setIsApprovingAdditionalCharge(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const updatedCharge = await approveAdditionalCharge(requestId, activeAdditionalCharge.id, {
        confirmationLocale: resolvedConfirmationLocale,
        confirmationText: trimmedAdditionalChargeConfirmationText,
        paymentOption: additionalChargePaymentOption,
        policyVersion: transactionPolicy.version,
      });

      setAdditionalCharges((previousCharges) =>
        previousCharges.map((charge) =>
          charge.id === updatedCharge.id ? updatedCharge : charge,
        ),
      );
      if (updatedCharge.payment.savedPaymentMethod) {
        setDefaultPaymentMethod(updatedCharge.payment.savedPaymentMethod);
      }
      setActiveAdditionalCharge(null);
      setAdditionalChargeConfirmationText('');
      setSuccessMessage(t('extra_expense.success_message'));
      await loadStatus(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('extra_expense.approval_failed'),
      );
    } finally {
      setIsApprovingAdditionalCharge(false);
    }
  }, [
    activeAdditionalCharge,
    additionalChargePaymentOption,
    isAdditionalChargeConfirmationValid,
    loadStatus,
    requestId,
    transactionPolicy,
    resolvedConfirmationLocale,
    t,
    trimmedAdditionalChargeConfirmationText,
  ]);

  const renderTrackingMap = useCallback(
    (expanded: boolean): React.ReactNode => {
      if (!requestData || (!canOpenTrackingMap && !latestDriverLocation)) {
        return (
          <View style={[styles.mapFallbackCard, expanded ? styles.mapFallbackCardExpanded : null]}>
            <Text style={styles.cardTitle}>{appI18n.t("Live Map")}</Text>
            <Text style={styles.supportingText}>
              {appI18n.t("Live driver tracking becomes available after a driver is assigned and location updates start.")}</Text>
          </View>
        );
      }

      if (!isNativeMapRuntimeAvailable || !NativeMapView || !NativeMarker) {
        return (
          <View style={[styles.mapFallbackCard, expanded ? styles.mapFallbackCardExpanded : null]}>
            <Text style={styles.cardTitle}>{appI18n.t("Live Map")}</Text>
            <Text style={styles.supportingText}>
              {appI18n.t("Map preview is available on iOS and Android with Google Maps configured.")}</Text>
            <Pressable style={styles.outlineButton} onPress={openTracking}>
              <Text style={styles.outlineButtonText}>{appI18n.t("Open tracking screen")}</Text>
            </Pressable>
          </View>
        );
      }

      const region = buildMapRegion(
        requestData.pickupLocation,
        requestData.dropoffLocation,
        latestDriverLocation,
      );
      const mapHeightStyle = expanded ? styles.mapFrameExpanded : styles.mapFrameInline;
      const nextTrackingDestination = trackingDestination;
      const destinationCoordinate =
        nextTrackingDestination &&
          nextTrackingDestination.latitude !== null &&
          nextTrackingDestination.longitude !== null
          ? {
            latitude: nextTrackingDestination.latitude,
            longitude: nextTrackingDestination.longitude,
          }
          : null;
      const pickupCoordinate =
        requestData.pickupLocation.latitude !== null &&
          requestData.pickupLocation.longitude !== null
          ? {
            latitude: requestData.pickupLocation.latitude,
            longitude: requestData.pickupLocation.longitude,
          }
          : null;
      const dropoffCoordinate =
        requestData.dropoffLocation.latitude !== null &&
          requestData.dropoffLocation.longitude !== null
          ? {
            latitude: requestData.dropoffLocation.latitude,
            longitude: requestData.dropoffLocation.longitude,
          }
          : null;

      return (
        <View style={[styles.mapFrame, mapHeightStyle]}>
          <NativeMapView
            style={styles.mapFill}
            initialRegion={region}
            provider={PROVIDER_GOOGLE}
          >
            {pickupCoordinate ? (
              <MapLocationMarker
                kind="pickup"
                coordinate={pickupCoordinate}
                title={appI18n.t("Pickup")}
              />
            ) : null}
            {dropoffCoordinate ? (
              <MapLocationMarker
                kind="dropoff"
                coordinate={dropoffCoordinate}
                title={appI18n.t("Dropoff")}
              />
            ) : null}
            {latestDriverLocation ? (
              <MapLocationMarker
                kind="driver"
                coordinate={{
                  latitude: latestDriverLocation.latitude,
                  longitude: latestDriverLocation.longitude,
                }}
                title={appI18n.t("Driver")}
              />
            ) : null}
            {mapsApiKey && latestDriverLocation && destinationCoordinate && NativeMapViewDirections ? (
              <NativeMapViewDirections
                origin={{
                  latitude: latestDriverLocation.latitude,
                  longitude: latestDriverLocation.longitude,
                }}
                destination={destinationCoordinate}
                apikey={mapsApiKey}
                mode="DRIVING"
                precision="high"
                resetOnChange={false}
                strokeWidth={expanded ? 6 : 5}
                strokeColor={MAP_COLORS.route}
                onError={(message: string) => {
                  console.warn('Live tracking directions failed.', message);
                }}
              />
            ) : null}
          </NativeMapView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={appI18n.t('Live Map')}
            style={({ pressed }) => [styles.mapExpandButton, pressed && styles.disabledButton]}
            onPress={() => setIsMapExpanded((previous) => !previous)}
          >
            <IconSymbol
              name={
                expanded
                  ? { ios: 'xmark', android: 'close', web: 'close' }
                  : {
                    ios: 'arrow.up.left.and.arrow.down.right',
                    android: 'open_in_full',
                    web: 'open_in_full',
                  }
              }
              color="#111827"
              size={18}
            />
          </Pressable>

          <View style={styles.mapOverlayStatus}>
            <Text style={styles.mapOverlayStatusText}>
              {latestDriverLocation ? appI18n.t('Live route') : appI18n.t('Waiting for location')}
            </Text>
          </View>
        </View>
      );
    },
    [
      latestDriverLocation,
      mapsApiKey,
      openTracking,
      requestData,
      canOpenTrackingMap,
      trackingDestination,
    ],
  );

  if (isLoading && !requestData) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{appI18n.t("Loading request status…")}</Text>
      </SafeAreaView>
    );
  }

  if (!requestData) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.title}>{appI18n.t("Request Status")}</Text>
        <Text style={styles.errorText}>{errorMessage || appI18n.t("Unable to load request status.")}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadStatus(false)}>
          <Text style={styles.primaryButtonText}>{appI18n.t("Retry")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const helperText = buildOffersHelperText(requestData, offers.length);
  const canChooseOffer = !requestData.confirmation && (requestData.status === 'PENDING_QUOTES' || requestData.status === 'QUOTED');
  const canDeleteCurrentRequest = canDeleteRequest(requestData.status);
  const canCancelCurrentTrip = requestData.status === 'RESERVED' || requestData.cancellation.canCancelCollectedTrip;
  const cancellationReason = requestData.cancellation.reason;
  const refundPreview = requestData.cancellation.refundPreview;
  const liveStatusLabel = getTrackingStatusLabel(
    effectiveTrackingStatus,
    nearDeliveryNotifiedAt,
    ratingAvailable,
  );

  return (
    <SafeAreaView style={[styles.container, { direction: language === 'ar' ? 'rtl' : 'ltr' }]} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.canvas} />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            keyboardInset > 0 ? { paddingBottom: 24 + keyboardInset } : undefined,
          ]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadStatus(true)} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {requestData.payment?.confirmation ? <BookingPaymentStatus payment={requestData.payment} refresh={() => loadStatus(true)} cancel={() => setIsCancelTripModalVisible(true)} /> : null}
          <PaymentInfo context={requestData.status === 'RESERVED' || requestData.deferredReservationEligible || requestData.deferredFurnitureEligible ? 'reservation' : 'booking'} policy={requestData.paymentPolicy} details={[requestData.statusLabel, ...(requestData.reservation ? [`${appI18n.t('Payment opens')}: ${formatDate(requestData.reservation.confirmationOpensAt)}`, `${appI18n.t('Payment deadline')}: ${formatDate(requestData.reservation.paymentDeadlineAt)}`] : []), ...(requestData.payment ? [appI18n.t('payment_info.total', { amount: formatMoney(requestData.payment.amount, requestData.payment.currency) })] : [])]} />
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel={appI18n.t("Back")} style={({ pressed }) => [styles.topBarButton, pressed && styles.disabledButton]} onPress={goToHome}>
              <IconSymbol
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                color="#111827"
                size={24}
              />
            </Pressable>
            <View style={styles.topBarTitleWrap}>
              <Text style={styles.topBarTitle}>{appI18n.t('Order #{{reference}}', { reference: requestReference })}</Text>
              <Text style={styles.topBarSubtitle}>
                {requestData.service?.nameEn || requestData.service?.key || requestData.serviceId}
              </Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={appI18n.t("Request Status")} style={({ pressed }) => [styles.topBarButton, pressed && styles.disabledButton]} onPress={() => void loadStatus(true)}>
              <IconSymbol
                name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
                color="#111827"
                size={22}
              />
            </Pressable>
          </View>

          {requestData.driverDetailsAvailable && (requestData.driverSummary.assigned || acceptedOffer) ? (
            <ReportDriver key={requestData.id} requestId={requestData.id} />
          ) : null}

          <OrderProgress
            steps={ORDER_PROGRESS_STEPS.map(step => ({ ...step, label: appI18n.t(step.label) }))}
            current={currentOrderStep}
            cancelled={requestData.status === 'CANCELLED'}
            rtl={language === 'ar'}
          />
          <View style={styles.orderIntro}>
            <Text style={styles.orderEyebrow}>{appI18n.t('Request Status')}</Text>
            <Text accessibilityRole="header" style={styles.orderHeading}>{liveStatusLabel}</Text>
          </View>

          {requestData.service?.key === 'VEHICLE_TRANSPORT' ? <RequestDocuments requestId={requestData.id} customer /> : null}
          {successMessage ? <OrderNotice tone="success" icon="check" text={successMessage} /> : null}
          {errorMessage ? <OrderNotice tone="danger" icon="warning" text={errorMessage} /> : null}
          {nearDeliveryMessage ? (
            <OrderNotice icon="route" text={nearDeliveryMessage} />
          ) : null}
          {requestData.status === 'CANCELLED' ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>{appI18n.t("Order cancelled")}</Text>
              <Text style={styles.supportingText}>
                {cancellationReason || appI18n.t("This request has been cancelled.")}
              </Text>
              {cancelTripDebugMessage ? <Text style={styles.mutedCaption}>{cancelTripDebugMessage}</Text> : null}
            </View>
          ) : null}

          {requestData.driverSummary.assigned && !requestData.driverDetailsAvailable && requestData.status !== 'CANCELLED' ? (
            <OrderNotice icon="clock" text={appI18n.t("Driver details and chat become available after the first 10 minutes following payment.")} />
          ) : null}

          {shouldShowTrackingMap ? (
            <View style={styles.mapCard}>
              <View style={styles.mapHeading}><OrderSectionHeading title={appI18n.t('Live Map')} icon="route" /></View>
              {renderTrackingMap(false)}
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.primaryActionButton, pressed && styles.disabledButton]}
                onPress={() => setIsMapExpanded(true)}
              >
                <IconSymbol
                  name={{ ios: 'location', android: 'my_location', web: 'my_location' }}
                  color={colors.onPrimary}
                  size={20}
                />
                <Text style={styles.primaryActionButtonText}>{appI18n.t("Track Driver Live")}</Text>
              </Pressable>
            </View>
          ) : null}

          <OrderRouteCard
            pickup={formatLocation(requestData.pickupLocation)}
            dropoff={formatLocation(requestData.dropoffLocation)}
            pickupLabel={appI18n.t('Pickup')}
            dropoffLabel={appI18n.t('Dropoff')}
          />

          {requestData.driverDetailsAvailable && (driverName || requestData.driverSummary.assigned || acceptedOffer || canOpenChat) ? (
            <View style={styles.driverCard}>
              <View style={styles.driverRow}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>{getDriverInitials(driverName)}</Text>
                </View>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driverName || appI18n.t("Driver pending")}</Text>
                  <Text style={styles.driverMeta}>{appI18n.t(requestData.driverSummary.driverType === 'COMPANY' ? 'Company' : 'Personal')}</Text>
                  <Text style={styles.driverMeta}>
                    {driverRating !== null ? `★ ${driverRating.toFixed(1)} • ` : ''}
                    {requestData.driverSummary.assigned ? appI18n.t('Assigned driver') : appI18n.t('Waiting assignment')}
                  </Text>
                  <Text style={styles.driverVehicleText}>
                    {driverVehicleInfo || appI18n.t("Vehicle details will appear here")}
                  </Text>
                </View>
                <View
                  style={[
                    styles.socketBadgeCompact,
                    socketState === 'connected'
                      ? styles.socketBadgeConnected
                      : socketState === 'error' || socketState === 'disconnected'
                        ? styles.socketBadgeWarning
                        : styles.socketBadgeNeutral,
                  ]}
                >
                  <Text style={styles.socketBadgeText}>{getSocketStateLabel(socketState)}</Text>
                </View>
              </View>



              {canOpenChat ? (
                isChatRoomLoading && !chatRoom ? (
                  <View style={styles.secondaryActionButton}>
                    <ActivityIndicator size="small" color="#111827" />
                    <Text style={styles.secondaryActionButtonText}>{appI18n.t("Checking chat…")}</Text>
                  </View>
                ) : chatRoom ? (
                  <Pressable accessibilityRole="button" style={({ pressed }) => [styles.secondaryActionButton, pressed && styles.disabledButton]} onPress={openChat}>
                    <IconSymbol
                      name={{ ios: 'message', android: 'chat_bubble_outline', web: 'chat' }}
                      color={colors.onPrimary}
                      size={20}
                    />
                    <Text style={styles.secondaryActionButtonText}>{appI18n.t("Chat with Driver")}</Text>
                    {(chatRoom.unreadCount ?? 0) > 0 ? (
                      <View style={styles.inlineBadge}>
                        <Text style={styles.inlineBadgeText}>{chatRoom.unreadCount}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                ) : null
              ) : null}
            </View>
          ) : null}

          {requestData.canEdit && offers.length === 0 && !requestData.quotesSummary.hasOffers ? (
            <Pressable accessibilityRole="button" style={styles.primaryActionButton}
              onPress={() => router.push({ pathname: '/edit-request', params: { requestId } } as unknown as Href)}>
              <Text style={styles.primaryActionButtonText}>{t('editRequest.title')}</Text>
            </Pressable>
          ) : null}
          <View style={styles.detailsCard}>
            <OrderSectionHeading title={appI18n.t('Request Summary')} icon="summary" />
            <OrderNotice icon={currentOrderStep >= 4 ? 'route' : 'clock'} text={liveStatusLabel} />
            <OrderDetailRow icon="clock" label={appI18n.t('Submitted:', { nsSeparator: false })} value={formatDate(requestData.submittedAt)} />
            <OrderDetailRow icon="calendar" label={appI18n.t('Schedule')} value={requestData.schedule.isImmediate ? appI18n.t('Immediate pickup') : formatDate(requestData.schedule.scheduledPickupAt)} />
            {requestData.schedule.scheduledDeliveryAt ? <OrderDetailRow icon="calendar" label={appI18n.t('Delivery Date')} value={formatDate(requestData.schedule.scheduledDeliveryAt)} /> : null}
            <OrderDetailRow icon="package" label={appI18n.t('Item')} value={requestData.itemDetails.title || requestData.itemDetails.type || appI18n.t('N/A')} />
            {requestData.itemDetails.description ? <OrderNotice icon="package" text={requestData.itemDetails.description} /> : null}
            {socketState === 'error' || socketState === 'disconnected' ? <OrderNotice icon="refresh" tone="warning" text={getSocketStateLabel(socketState)} /> : null}
            {refundPreview ? <OrderNotice icon="info" tone="warning" text={appI18n.t('Cancellation is free for the first 10 minutes after payment. A 15% fee applies after 10 minutes through 24 hours, and 50% after 24 hours.')} /> : null}
            {refundPreview && requestData.status !== 'CANCELLED' ? (
              <Text style={styles.mutedCaption}>
                {appI18n.t('Cancel now: refund {{refund}} and keep fee {{fee}}.', {
                  refund: formatMoney(refundPreview.refundedAmount, refundPreview.currency),
                  fee: formatMoney(refundPreview.retainedAmount, refundPreview.currency),
                })}
              </Text>
            ) : null}
          </View>

          {requestData.reservation && requestData.status === 'RESERVED' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{appI18n.t('Driver reserved — awaiting payment')}</Text>
              <Text style={styles.rowValue}>{appI18n.t('Payment opens')}: {formatDate(requestData.reservation.confirmationOpensAt)}</Text>
              <Text style={styles.rowValue}>{appI18n.t('Payment deadline')}: {formatDate(requestData.reservation.paymentDeadlineAt)}</Text>
              <Text style={styles.rowValue}>{appI18n.t('Confirm pickup and pay before the deadline to keep your reservation.')}</Text>
              {requestData.reservation.canConfirmAndPay && acceptedOffer ? <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => router.push({ pathname: '/request-payment', params: { requestId: requestData.id, offerId: acceptedOffer.offerId || acceptedOffer.id, request: JSON.stringify(requestData), offer: JSON.stringify(acceptedOffer) } })}>
                <Text style={styles.primaryButtonText}>{appI18n.t('Confirm pickup and pay')}</Text>
              </Pressable> : null}
            </View>
          ) : null}
          <View style={styles.card}>
            <OrderSectionHeading title={appI18n.t("Driver Offers")} icon="offers" count={offers.length} />
            {offers.length === 0 ? (
              <OrderEmptyState icon="offers" text={appI18n.t("Waiting for offers…")} />
            ) : (
              <Text style={styles.rowValue}>{helperText}</Text>
            )}

            {selectedOffer ? (
              <View style={styles.selectedOfferBanner}>
                <Text style={styles.selectedOfferLabel}>{appI18n.t("Selected offer")}</Text>
                <Text style={styles.selectedOfferValue}>
                  {appI18n.t(selectedOffer.driverType === 'COMPANY' ? 'Company' : 'Personal')} • {selectedOffer.driverName || 'Driver'} •{' '}
                  {formatMoney(selectedOffer.proposedPrice ?? selectedOffer.price, selectedOffer.currency)}
                </Text>
              </View>
            ) : null}

            {acceptedOffer ? (
              <View style={styles.offerCardAccepted}>
                <Text style={[styles.offerCardTitle, styles.offerTextOnDark]}>{appI18n.t("Accepted Offer")}</Text>
                <Text style={[styles.offerPrimaryValue, styles.offerTextOnDark]}>
                  {appI18n.t(acceptedOffer.driverType === 'COMPANY' ? 'Company' : 'Personal')} • {acceptedOffer.driverName || 'Driver'} •{' '}
                  {formatMoney(acceptedOffer.proposedPrice ?? acceptedOffer.price, acceptedOffer.currency)}
                </Text>
                {(acceptedOffer.customerPlatformFeeAmount ?? 0) > 0 ? (
                  <Text style={[styles.rowValue, styles.offerSubtextOnDark]}>
                    {appI18n.t('Includes 5% platform commission')}
                  </Text>
                ) : null}
                <Text style={[styles.rowValue, styles.offerSubtextOnDark]}>
                  {appI18n.t("Accepted at:")} {formatDate(acceptedOffer.acceptedAt)}
                </Text>
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
                  disabled={!isPending || !canChooseOffer}
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
                        <Text style={styles.offerVehiclePhotoPlaceholderText}>{appI18n.t("No Photo")}</Text>
                      </View>
                    )}
                    <View style={styles.offerTopText}>
                      <Text style={[styles.offerCardTitle, isSelected ? styles.offerTextOnDark : undefined]}>
                        {appI18n.t(offer.driverType === 'COMPANY' ? 'Company' : 'Personal')} • {offer.driverName || 'Driver'}
                      </Text>
                      <Text
                        style={[styles.offerRatingText, isSelected ? styles.offerSubtextOnDark : undefined]}
                      >
                        {getRatingText(offer.driverRating)}
                      </Text>
                      <Text
                        style={[styles.offerStatusText, isSelected ? styles.offerSubtextOnDark : undefined]}
                      >
                        {appI18n.t("Status:")} {offer.offerStatus || offer.status}
                      </Text>
                    </View>
                    <View style={styles.offerPriceBlock}>
                      <Text
                        style={[styles.offerPriceValue, isSelected ? styles.offerTextOnDark : undefined]}
                      >
                        {formatMoney(offer.proposedPrice ?? offer.price, offer.currency)}
                      </Text>
                      <Text
                        style={[styles.offerArrivalText, isSelected ? styles.offerSubtextOnDark : undefined]}
                      >
                        {appI18n.t("ETA")} {offer.estimatedArrivalTime ? formatDate(offer.estimatedArrivalTime) : 'N/A'}
                      </Text>
                    </View>
                  </View>

                  {(offer.customerPlatformFeeAmount ?? 0) > 0 ? (
                    <Text style={[styles.rowValue, isSelected ? styles.offerSubtextOnDark : undefined]}>
                      {appI18n.t('Includes 5% platform commission')}
                    </Text>
                  ) : null}

                  <Text style={[styles.rowValue, isSelected ? styles.offerSubtextOnDark : undefined]}>
                    {appI18n.t("Estimated delivery:")}{' '}
                    {offer.estimatedDeliveryAt ? formatDate(offer.estimatedDeliveryAt) : 'N/A'}
                  </Text>
                  {offer.message ? (
                    <Text style={[styles.rowValue, isSelected ? styles.offerSubtextOnDark : undefined]}>
                      {appI18n.t("Message:")} {offer.message}
                    </Text>
                  ) : null}

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
                        {isOpening ? appI18n.t('Opening next step…') : isSelected ? appI18n.t((requestData.deferredReservationEligible ?? requestData.deferredFurnitureEligible) ? 'Reserve Driver' : 'Continue') : appI18n.t('Select Driver')}
                      </Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}

            {offers.length > 0 && pendingOffers.length === 0 && !acceptedOffer ? (
              <Text style={styles.rowValue}>{appI18n.t("All offers are no longer pending.")}</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <OrderSectionHeading title={appI18n.t("Pickup Proof Photos")} icon="photos" count={trackingData?.pickupProofPhotos?.length ?? 0} />
            {trackingData?.pickupProofPhotos?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                {trackingData.pickupProofPhotos.map((photo) => (
                  <Pressable key={photo.id} onPress={() => setExpandedPhotoUrl(resolveAssetUrl(photo.url))}>
                    <Image
                      source={{ uri: resolveAssetUrl(photo.url) }}
                      style={styles.photoLarge}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <OrderEmptyState icon="photos" text={appI18n.t("Pickup proof photos will appear after pickup is completed.")} />
            )}
          </View>

          <View style={styles.card}>
            <OrderSectionHeading title={appI18n.t("Delivery Proof Photos")} icon="photos" count={trackingData?.deliveryProofPhotos?.length ?? 0} />
            {trackingData?.deliveryProofPhotos?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                {trackingData.deliveryProofPhotos.map((photo) => (
                  <Pressable key={photo.id} onPress={() => setExpandedPhotoUrl(resolveAssetUrl(photo.url))}>
                    <Image
                      source={{ uri: resolveAssetUrl(photo.url) }}
                      style={styles.photoLarge}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <OrderEmptyState icon="photos" text={appI18n.t("Delivery proof photos will appear after final delivery.")} />
            )}
          </View>

          <View style={styles.card}>
            <OrderSectionHeading title={appI18n.t("Additional Charges")} icon="payment" count={additionalCharges.length} />
            <OrderDetailRow icon="payment" label={t('extra_expense.saved_card_notice')} value={formatSavedPaymentMethod(defaultPaymentMethod)} />
            {additionalCharges.length === 0 ? (
              <OrderEmptyState icon="payment" text={appI18n.t("No additional charges yet.")} />
            ) : (
              additionalCharges.map((charge) => (
                <View key={charge.id} style={styles.additionalChargeCard}>
                  <PaymentInfo context="expense" policy={transactionPolicy} details={[formatMoney(charge.amount, charge.currency), formatMoney(charge.appFeeAmount, charge.currency), formatMoney(charge.totalChargeAmount, charge.currency), charge.status]} />
                  <Text style={styles.offerPrimaryValue}>
                    {formatMoney(charge.totalChargeAmount, charge.currency)}
                  </Text>
                  <OrderDetailRow icon="payment" label={t('extra_expense.expense_amount_label')} value={formatMoney(charge.amount, charge.currency)} />
                  <OrderDetailRow icon="payment" label={t('extra_expense.app_fee_label')} value={formatMoney(charge.appFeeAmount, charge.currency)} />
                  <OrderDetailRow icon="summary" label={t("orderChargeLabels.reason")} value={charge.reason} />
                  {charge.equipmentType ? (
                    <OrderDetailRow icon="package" label={t("orderChargeLabels.equipment")} value={charge.equipmentType} />
                  ) : null}
                  <OrderDetailRow icon="info" label={t("orderChargeLabels.status")} value={charge.status} />
                  <OrderDetailRow icon="clock" label={t("orderChargeLabels.date")} value={formatDate(charge.createdAt)} />
                  <OrderDetailRow icon="payment" label={t('extra_expense.payment_option_label')} value={getAdditionalChargePaymentMethodLabel(charge, t)} />
                  {charge.payment.savedPaymentMethod ? (
                    <OrderDetailRow icon="payment" label={t('extra_expense.saved_card_label')} value={formatSavedPaymentMethod(charge.payment.savedPaymentMethod)} />
                  ) : null}
                  {charge.payment.failureReason ? (
                    <Text style={styles.errorText}>{charge.payment.failureReason}</Text>
                  ) : null}
                  {(charge.status === 'PENDING' || charge.status === 'FAILED') ? (
                    <Pressable
                      style={[styles.rateActionButton, isApprovingAdditionalCharge && styles.disabledButton]}
                      disabled={isApprovingAdditionalCharge}
                      onPress={() => openAdditionalChargeFlow(charge)}
                    >
                      <Text style={styles.rateActionButtonText}>
                        {charge.status === 'FAILED'
                          ? t('extra_expense.retry_button')
                          : t('extra_expense.approve_button')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <OrderSectionHeading title={appI18n.t("Photos")} icon="photos" count={requestData.photos.length} />
            {requestData.photos.length === 0 ? (
              <OrderEmptyState icon="photos" text={appI18n.t("No photos added.")} />
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
                {requestData.photos.map((photo) => (
                  <Pressable key={photo.id} onPress={() => setExpandedPhotoUrl(resolveAssetUrl(photo.url))}>
                    <Image
                      source={{ uri: resolveAssetUrl(photo.url) }}
                      style={styles.photo}
                      resizeMode="cover"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>

          {ratingAvailable ? (
            <View style={styles.card}>
              <OrderSectionHeading title={appI18n.t("Rate Service")} icon="star" />
              <Text style={styles.rowValue}>
                {appI18n.t("Final delivery is confirmed. You can rate the driver from here if you skipped the prompt.")}</Text>
              <Pressable style={styles.primaryButton} onPress={onRateDriver}>
                <Text style={styles.primaryButtonText}>{appI18n.t("Rate driver")}</Text>
              </Pressable>
            </View>
          ) : null}


          <View style={styles.actionStack}>
            <Pressable accessibilityRole="button" style={({ pressed }) => [styles.statusActionButton, pressed && styles.disabledButton]} onPress={() => void loadStatus(false)}>
              <Text style={styles.statusActionButtonText}>
                {isRefreshing ? appI18n.t('Refreshing…') : appI18n.t('Request Status')}
              </Text>
            </Pressable>
            {ratingAvailable ? (
              <Pressable style={styles.rateActionButton} onPress={onRateDriver}>
                <Text style={styles.rateActionButtonText}>{appI18n.t("Rate Driver")}</Text>
              </Pressable>
            ) : null}
            {canCancelCurrentTrip ? (
              <Pressable onPress={onCancelTrip}>
                <Text style={styles.cancelActionText}>{isCancellingTrip ? appI18n.t('Cancelling…') : appI18n.t('Cancel Order')}</Text>
              </Pressable>
            ) : canDeleteCurrentRequest ? (
              <Pressable
                accessibilityRole="button"
                style={({ pressed }) => [styles.deleteRequestButton, pressed && styles.disabledButton]}
                onPress={() => {
                  Alert.alert(appI18n.t("Delete request?"), appI18n.t("This will permanently delete the request."), [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => {
                        void (async () => {
                          try {
                            await deleteCustomerRequest(requestData.id);
                            router.replace('/(tabs)/home' as Href);
                          } catch (error) {
                            setErrorMessage(
                              error instanceof Error ? error.message : appI18n.t("Failed to delete request."),
                            );
                          }
                        })();
                      },
                    },
                  ]);
                }}
              >
                <Text style={styles.deleteRequestButtonText}>{appI18n.t("Delete Request")}</Text>
              </Pressable>
            ) : null}
          </View>
          <Modal visible={isMapExpanded} animationType="slide" onRequestClose={() => setIsMapExpanded(false)}>
            <SafeAreaView style={styles.mapExpandedScreen}>
              <View style={styles.expandedMapHeader}>
                <Pressable accessibilityRole="button" accessibilityLabel={appI18n.t("Back")} style={({ pressed }) => [styles.topBarButton, pressed && styles.disabledButton]} onPress={() => setIsMapExpanded(false)}>
                  <IconSymbol
                    name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                    color="#111827"
                    size={24}
                  />
                </Pressable>
                <Text style={styles.expandedMapTitle}>{appI18n.t("Live Map")}</Text>
                <View style={styles.topBarButton} />
              </View>
              {renderTrackingMap(true)}
            </SafeAreaView>
          </Modal>
          <Modal
            visible={isCancelTripModalVisible}
            transparent
            animationType="fade"
            onRequestClose={closeCancelTripModal}
          >
            <View style={styles.dialogBackdrop}>
              <View
                style={[
                  styles.dialogCard,
                  keyboardInset > 0 ? { marginBottom: keyboardInset } : undefined,
                ]}
              >
                <Text style={styles.cardTitle}>{appI18n.t("Cancel trip?")}</Text>
                <PaymentInfo context="cancellation" policy={requestData.paymentPolicy} details={[appI18n.t('payment_info.fee', { amount: formatMoney(requestData.cancellation.refundPreview?.retainedAmount ?? 0, requestData.payment?.currency) }), appI18n.t('payment_info.released', { amount: formatMoney(requestData.cancellation.refundPreview?.releasedAmount ?? 0, requestData.payment?.currency) }), appI18n.t('payment_info.refund', { amount: formatMoney(requestData.cancellation.refundPreview?.refundedAmount ?? 0, requestData.payment?.currency) })]} />
                <Text style={styles.rowValue}>
                  {requestData.confirmation ? appI18n.t('payment_info.cancel_preview', { fee: formatMoney(requestData.cancellation.refundPreview?.retainedAmount ?? 0, requestData.payment?.currency), released: formatMoney(requestData.cancellation.refundPreview?.releasedAmount ?? 0, requestData.payment?.currency) }) : requestData.status === 'RESERVED' ? appI18n.t('Cancel this unpaid reservation for free? Your driver reservation will be released.') : requestData.cancellation.refundPreview
                    ? `If you cancel now, ${formatMoney(
                      requestData.cancellation.refundPreview.refundedAmount,
                      requestData.cancellation.refundPreview.currency,
                    )} will be refunded automatically and ${formatMoney(
                      requestData.cancellation.refundPreview.retainedAmount,
                      requestData.cancellation.refundPreview.currency,
                    )} will be kept as the cancellation fee.`
                    : appI18n.t('Cancellation is free for the first 10 minutes after payment. A 15% fee applies after 10 minutes through 24 hours, and 50% after 24 hours.')}
                </Text>
                <View style={styles.dialogActions}>
                  <Pressable
                    style={[styles.secondaryOutlineButton, isCancellingTrip && styles.disabledButton]}
                    disabled={isCancellingTrip}
                    onPress={closeCancelTripModal}
                  >
                    <Text style={styles.secondaryOutlineButtonText}>{appI18n.t("Keep trip")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.deleteButton, isCancellingTrip && styles.disabledButton]}
                    disabled={isCancellingTrip}
                    onPress={() => void confirmCancelTrip()}
                  >
                    <Text style={styles.deleteButtonText}>
                      {isCancellingTrip ? appI18n.t('Cancelling…') : appI18n.t('Cancel trip')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
          <Modal
            visible={Boolean(activeAdditionalCharge)}
            transparent
            animationType="fade"
            onRequestClose={closeAdditionalChargeModal}
          >
            <View style={styles.dialogBackdrop}>
              <View
                style={[
                  styles.chargeDialogCard,
                  keyboardInset > 0 ? { marginBottom: keyboardInset } : undefined,
                ]}
              >
                <View style={styles.chargeDialogHeader}>
                  <Text style={styles.cardTitle}>{t('extra_expense.confirm_title')}</Text>
                  <Text style={styles.chargeDialogAmount}>
                    {activeAdditionalCharge
                      ? formatMoney(activeAdditionalCharge.totalChargeAmount, activeAdditionalCharge.currency)
                      : ''}
                  </Text>
                </View>

                {activeAdditionalCharge ? (
                  <View style={styles.chargeSummaryCard}>
                    <Text style={styles.chargeSummaryReason}>{activeAdditionalCharge.reason}</Text>
                    <View style={styles.chargeSummaryRow}>
                      <Text style={styles.detailLabel}>{t('extra_expense.expense_amount_label')}</Text>
                      <Text style={styles.chargeSummaryValue}>
                        {formatMoney(activeAdditionalCharge.amount, activeAdditionalCharge.currency)}
                      </Text>
                    </View>
                    <View style={styles.chargeSummaryRow}>
                      <Text style={styles.detailLabel}>{t('extra_expense.app_fee_label')}</Text>
                      <Text style={styles.chargeSummaryValue}>
                        {formatMoney(activeAdditionalCharge.appFeeAmount, activeAdditionalCharge.currency)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <Text style={styles.supportingText}>
                  {additionalChargePaymentOption === 'SAVED_CARD'
                    ? t('extra_expense.saved_card_notice')
                    : t('extra_expense.cash_on_delivery_notice')}
                </Text>
                <Text style={styles.supportingText}>
                  {t('extra_expense.confirm_prompt', {
                    keyword: confirmationKeyword,
                  })}
                </Text>
                <PaymentInfo context="expense" policy={transactionPolicy} details={activeAdditionalCharge ? [formatMoney(activeAdditionalCharge.totalChargeAmount, activeAdditionalCharge.currency), t(additionalChargePaymentOption === 'SAVED_CARD' ? 'extra_expense.saved_card_option' : 'extra_expense.cash_on_delivery_option')] : []} />
                <View style={styles.paymentOptionList}>
                  <Pressable
                    style={[
                      styles.paymentOptionCard,
                      additionalChargePaymentOption === 'SAVED_CARD' && styles.paymentOptionCardSelected,
                      !defaultPaymentMethod && styles.paymentOptionCardDisabled,
                    ]}
                    disabled={!defaultPaymentMethod || isApprovingAdditionalCharge}
                    onPress={() => setAdditionalChargePaymentOption('SAVED_CARD')}
                  >
                    <Text style={styles.paymentOptionTitle}>{t('extra_expense.saved_card_option')}</Text>
                    <Text style={styles.paymentOptionDescription}>
                      {defaultPaymentMethod
                        ? formatSavedPaymentMethod(defaultPaymentMethod)
                        : t('extra_expense.no_saved_card_message')}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.paymentOptionCard,
                      additionalChargePaymentOption === 'CASH_ON_DELIVERY' && styles.paymentOptionCardSelected,
                      isApprovingAdditionalCharge && styles.paymentOptionCardDisabled,
                    ]}
                    disabled={isApprovingAdditionalCharge}
                    onPress={() => setAdditionalChargePaymentOption('CASH_ON_DELIVERY')}
                  >
                    <Text style={styles.paymentOptionTitle}>
                      {t('extra_expense.cash_on_delivery_option')}
                    </Text>
                    <Text style={styles.paymentOptionDescription}>
                      {t('extra_expense.cash_on_delivery_notice')}
                    </Text>
                  </Pressable>
                </View>
                <Text style={styles.rowLabel}>
                  {t('extra_expense.confirm_input_label')}
                </Text>
                <Text style={styles.supportingText}>
                  {t('extra_expense.confirm_input_helper', {
                    keyword: confirmationKeyword,
                  })}
                </Text>
                <TextInput
                  value={additionalChargeConfirmationText}
                  onChangeText={setAdditionalChargeConfirmationText}
                  placeholder={confirmationKeyword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.confirmationInput}
                />

                <View style={styles.selectedPaymentCard}>
                  <Text style={styles.detailLabel}>{t('extra_expense.payment_option_label')}</Text>
                  <Text style={styles.detailValue}>
                    {additionalChargePaymentOption === 'SAVED_CARD'
                      ? t('extra_expense.saved_card_option')
                      : t('extra_expense.cash_on_delivery_option')}
                  </Text>
                  {additionalChargePaymentOption === 'SAVED_CARD' ? (
                    <Text style={styles.mutedCaption}>
                      {t('extra_expense.saved_card_label')}: {formatSavedPaymentMethod(defaultPaymentMethod)}
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  style={[styles.supportActionButton, isApprovingAdditionalCharge && styles.disabledButton]}
                  disabled={isApprovingAdditionalCharge}
                  onPress={() =>
                    router.push((`/payment-method?requestId=${encodeURIComponent(requestId)}`) as Href)
                  }
                >
                  <Text style={styles.supportActionButtonText}>
                    {defaultPaymentMethod
                      ? t('extra_expense.change_card_button')
                      : t('extra_expense.add_payment_method_button')}
                  </Text>
                </Pressable>
                <View style={styles.dialogActions}>
                  <Pressable
                    style={[styles.supportActionButton, isApprovingAdditionalCharge && styles.disabledButton]}
                    disabled={isApprovingAdditionalCharge}
                    onPress={closeAdditionalChargeModal}
                  >
                    <Text style={styles.supportActionButtonText}>{t('extra_expense.cancel_button')}</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.rateActionButton,
                      (!isAdditionalChargeConfirmationValid || isApprovingAdditionalCharge) &&
                      styles.disabledButton,
                    ]}
                    disabled={!isAdditionalChargeConfirmationValid || isApprovingAdditionalCharge}
                    onPress={() => void onApproveAdditionalCharge()}
                  >
                    <Text style={styles.rateActionButtonText}>
                      {isApprovingAdditionalCharge
                        ? t('extra_expense.processing_button')
                        : t('extra_expense.confirm_button')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
          <Modal visible={Boolean(expandedPhotoUrl)} transparent animationType="fade" onRequestClose={() => setExpandedPhotoUrl('')}>
            <Pressable style={styles.modalBackdrop} onPress={() => setExpandedPhotoUrl('')}>
              {expandedPhotoUrl ? <Image source={{ uri: expandedPhotoUrl }} style={styles.expandedPhoto} resizeMode="contain" /> : null}
            </Pressable>
          </Modal>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  orderIntro: { gap: 8, paddingBottom: 4 },
  orderEyebrow: { fontSize: 12, lineHeight: 18, color: colors.secondary, fontWeight: '600', textAlign: 'auto' },
  orderHeading: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.text, letterSpacing: -0.6, textAlign: 'auto' },
  mapHeading: { paddingHorizontal: 4 },

  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: colors.canvas,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingTop: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
    shadowColor: colors.text,
    shadowOpacity: 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  supportingText: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'auto',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarButton: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  topBarTitleWrap: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 2,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  topBarSubtitle: {
    textAlign: 'auto',
    fontSize: 13,
    color: '#76869B',
  },
  noticeCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#F5D0CD',
    gap: 8,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  mutedCaption: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.secondary,
  },
  mapCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  mapFrame: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#DDF0DD',
  },
  mapFrameInline: {
    height: 280,
  },
  mapFrameExpanded: {
    flex: 1,
    minHeight: 0,
  },
  mapFill: {
    ...StyleSheet.absoluteFill,
  },
  mapExpandButton: {
    position: 'absolute',
    top: 'auto',
    right: 12,
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    bottom: 12,
  },
  mapOverlayStatus: {
    position: 'absolute',
    left: 14,
    top: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(17,24,39,0.82)',
  },
  mapOverlayStatusText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '600',
  },
  mapFallbackCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  mapFallbackCardExpanded: {
    flex: 1,
    margin: 20,
    justifyContent: 'center',
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
  },
  outlineButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  driverCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
    shadowColor: colors.text,
    shadowOpacity: 0,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 0,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
  },
  driverAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.success,
  },
  driverInfo: {
    flex: 1,
    gap: 4,
    minWidth: 140,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  driverMeta: {
    fontSize: 15,
    color: '#6B7280',
  },
  driverVehicleText: {
    fontSize: 13,
    color: colors.secondary,
  },
  socketBadgeCompact: {
    maxWidth: '100%',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  socketBadgeConnected: {
    backgroundColor: '#E9F9EE',
  },
  socketBadgeWarning: {
    backgroundColor: '#FFF3D6',
  },
  socketBadgeNeutral: {
    backgroundColor: '#EEF2F7',
  },
  socketBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  primaryActionButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexWrap: 'wrap',
  },
  primaryActionButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
  },
  secondaryActionButton: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.contact,
    backgroundColor: colors.contact,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexWrap: 'wrap',
  },
  secondaryActionButtonText: {
    color: colors.onPrimary,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
  },
  inlineBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  inlineBadgeText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary,
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  rowLabel: {
    marginTop: 8,
    fontSize: 12,
    color: colors.secondary,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    color: colors.text,
    marginTop: 2,
    lineHeight: 20,
  },
  selectedOfferBanner: {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#FFC548',
  },
  selectedOfferLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D89A1A',
    textTransform: 'uppercase',
  },
  selectedOfferValue: {
    marginTop: 4,
    color: colors.text,
    fontWeight: '600',
  },
  offerCardAccepted: {
    marginTop: 10,
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FFC548',
    borderColor: '#FFC548',
    borderWidth: 1,
  },
  offerCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 12,
    gap: 8,
    backgroundColor: colors.surface,
  },
  offerCardSelected: {
    borderColor: '#FFC548',
    backgroundColor: '#FFF8E6',
  },
  offerTopRow: {
    flexDirection: 'row',
    gap: 10,
  },
  offerVehiclePhoto: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
  },
  offerVehiclePhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  offerVehiclePhotoPlaceholderText: {
    fontSize: 11,
    color: colors.secondary,
    textAlign: 'center',
  },
  offerTopText: {
    flex: 1,
    gap: 3,
  },
  offerCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  offerRatingText: {
    color: colors.secondary,
    fontSize: 13,
  },
  offerStatusText: {
    color: colors.secondary,
    fontSize: 12,
  },
  offerTextOnDark: {
    color: colors.text,
  },
  offerSubtextOnDark: {
    color: '#374151',
  },
  offerPriceBlock: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
  offerPriceValue: {
    fontWeight: '700',
    color: colors.text,
    fontSize: 14,
    textAlign: 'right',
  },
  offerArrivalText: {
    marginTop: 4,
    color: colors.secondary,
    fontSize: 12,
    textAlign: 'right',
  },
  offerPrimaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  photoRow: {
    gap: 10,
  },
  photo: {
    width: 90,
    height: 90,
    borderRadius: 10,
    backgroundColor: '#D1D5DB',
  },
  photoLarge: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: '#D1D5DB',
  },
  additionalChargeCard: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 4,
  },
  actionStack: {
    gap: 14,
    paddingTop: 6,
  },
  statusActionButton: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  deleteRequestButton: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: '#F4C7C3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  deleteRequestButtonText: {
    color: '#C0392B',
    fontSize: 16,
    fontWeight: '700',
  },
  statusActionButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  rateActionButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  rateActionButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  supportActionButton: {
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  supportActionButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '500',
  },
  cancelActionText: {
    textAlign: 'center',
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '500',
  },
  mapExpandedScreen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  expandedMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  expandedMapTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  chargeDialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  chargeDialogHeader: {
    gap: 6,
  },
  chargeDialogAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  chargeSummaryCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#F8E1A1',
    gap: 10,
  },
  chargeSummaryReason: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    fontWeight: '600',
  },
  chargeSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  chargeSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  confirmationInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    color: colors.text,
  },
  paymentOptionList: {
    gap: 10,
  },
  paymentOptionCard: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 4,
  },
  paymentOptionCardSelected: {
    borderColor: '#3F7AE8',
    backgroundColor: '#EFF6FF',
  },
  paymentOptionCardDisabled: {
    opacity: 0.55,
  },
  paymentOptionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  paymentOptionDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.secondary,
  },
  selectedPaymentCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  dialogActions: {
    gap: 10,
  },
  expandedPhoto: {
    width: '100%',
    height: '100%',
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryOutlineButton: {
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    backgroundColor: colors.surface,
  },
  deleteButton: {
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#FF3B30',
  },
  primaryButtonText: {
    color: colors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  deleteButtonText: {
    color: colors.surface,
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryOutlineButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  loadingText: {
    color: colors.secondary,
    marginTop: 8,
    fontSize: 14,
  },
  errorText: {
    color: '#C0392B',
    fontSize: 14,
    textAlign: 'center',
  },
});
