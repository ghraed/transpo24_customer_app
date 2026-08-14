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
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getApiBaseUrl } from '@/config/backend';
import {
  isNativeMapRuntimeAvailable,
  NativeMapView,
  NativeMapViewDirections,
  NativeMarker,
  PROVIDER_GOOGLE,
  type Region,
} from '@/components/native-maps';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { useTransportRequestChatRoom } from '@/hooks/use-transport-request-chat-room';
import { isHistoryRequestStatus } from '@/lib/request-status';
import {
  approveAdditionalCharge,
  cancelCollectedTrip,
  deleteCustomerRequest,
  getDefaultPaymentMethod,
  getRequestAdditionalCharges,
  getCustomerRequestOffers,
  getCustomerRequestStatus,
  getRequestTracking,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth-token';
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
  RequestTracking,
  RequestTrackingStatus,
  RequestStatusResponse,
  SavedPaymentMethodSummary,
} from '@/types/customer-request';
import {
  validateDriverLocationUpdatedPayload,
  validateDriverNearDeliveryPayload,
  validateItemPickedUpPayload,
  validateTripStatusUpdatedPayload,
} from '@/utils/pickupValidation';
import { validateItemDeliveredPayload } from '@/utils/deliveryValidation';

interface OrderProgressStep {
  id: number;
  label: string;
}

type SocketState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'unavailable';

const STATUS_LABELS: Partial<Record<CustomerRequestStatus, string>> = {
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
  return `TRP-${compact || id}`;
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

function formatSavedPaymentMethod(paymentMethod: SavedPaymentMethodSummary | null): string {
  if (!paymentMethod) {
    return 'No saved card';
  }

  const brand = paymentMethod.brand?.toUpperCase() || 'CARD';
  const last4 = paymentMethod.last4 ?? '----';
  return `${brand} •••• ${last4}`;
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
    return 'Driver is near the delivery location';
  }

  if (ratingAvailable && (status === 'DELIVERED' || status === 'COMPLETED')) {
    return 'Rating pending';
  }

  return STATUS_LABELS[status as CustomerRequestStatus] ?? status;
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
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const refreshTs = typeof params.refreshTs === 'string' ? params.refreshTs : '';
  const accessToken = useMemo(() => getAccessToken(), []);
  const mapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    (Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?.trim()
      : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim()) ||
    '';

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
  const [socketMessage, setSocketMessage] = useState<string>(
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
        let data: RequestStatusResponse;
        try {
          data = await getCustomerRequestStatus(requestId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Unknown status error.';
          throw new Error(`Request status failed: ${message}`);
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
                `Request offers failed: ${error instanceof Error ? error.message : 'Unknown offers error.'
                }`,
              );
            }),
            getRequestAdditionalCharges(requestId).catch((error: unknown) => {
              throw new Error(
                `Additional charges failed: ${error instanceof Error
                  ? error.message
                  : 'Unknown additional charges error.'
                }`,
              );
            }),
            getDefaultPaymentMethod().catch((error: unknown) => {
              throw new Error(
                `Default payment method failed: ${error instanceof Error
                  ? error.message
                  : 'Unknown payment method error.'
                }`,
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
              `Request tracking failed: ${trackingError instanceof Error
                ? trackingError.message
                : 'Unknown tracking error.'
              }`,
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
  }, [loadStatus, refreshTs]);

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
      const message = error instanceof Error ? error.message : 'Failed to connect realtime socket.';
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
        joinTripRoom(requestId);
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
  }, [accessToken, canUseRealtime, loadStatus, requestId, router]);

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
  const driverName =
    trackingData?.driverName ||
    requestData?.driverSummary.driverName ||
    acceptedOffer?.driverName ||
    selectedOffer?.driverName ||
    null;
  const driverVehicleInfo =
    requestData?.driverSummary.vehicleInfo ||
    requestData?.itemDetails.title ||
    null;
  const driverRating = acceptedOffer?.driverRating ?? selectedOffer?.driverRating ?? null;
  const shouldShowTrackingMap =
    requestData?.status !== 'CANCELLED' &&
    currentOrderStep >= 2 &&
    canOpenTrackingMap;
  const canRenderInlineMap = Boolean(
    shouldShowTrackingMap &&
    mapsApiKey &&
    isNativeMapRuntimeAvailable &&
    NativeMapView &&
    NativeMarker,
  );
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

  const openPaymentScreen = (): void => {
    if (!requestData || !selectedOffer) return;

    const offerId = selectedOffer.offerId || selectedOffer.id;
    setErrorMessage('');
    setSuccessMessage('');
    setIsOpeningPaymentOfferId(offerId);

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

  const onContactSupport = useCallback((): void => {
    Alert.alert(
      'Support',
      'Support contact is not configured in this app yet. Use the driver chat when available or try again later.',
    );
  }, []);

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

    try {
      setIsCancelTripModalVisible(false);
      setIsCancellingTrip(true);
      setCancelTripDebugMessage('Starting cancellation request…');
      setErrorMessage('');
      setSuccessMessage('');

      const result = await cancelCollectedTrip(requestData.id);

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
        `Trip cancelled. Refunded ${formatMoney(
          result.refundedAmount,
          result.currency,
        )}. Cancellation fee kept: ${formatMoney(
          result.retainedAmount,
          result.currency,
        )}.`,
      );
      setCancelTripDebugMessage('Cancellation completed successfully.');
    } catch (error) {
      const primaryErrorMessage =
        error instanceof Error ? error.message : 'Failed to cancel this trip.';
      setCancelTripDebugMessage(
        `Primary cancellation call failed: ${primaryErrorMessage}`,
      );

      try {
        setCancelTripDebugMessage('Primary cancellation call failed. Retrying once…');
        await sleep(800);
        await cancelCollectedTrip(requestData.id).catch(() => null);
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
          `Fallback status refresh failed: ${statusError instanceof Error ? statusError.message : 'Unknown error.'
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
    if (!activeAdditionalCharge || !isAdditionalChargeConfirmationValid) {
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
    resolvedConfirmationLocale,
    t,
    trimmedAdditionalChargeConfirmationText,
  ]);

  const renderTrackingMap = useCallback(
    (expanded: boolean): React.ReactNode => {
      if (!requestData || !shouldShowTrackingMap) {
        return (
          <View style={[styles.mapFallbackCard, expanded ? styles.mapFallbackCardExpanded : null]}>
            <Text style={styles.cardTitle}>Live Map</Text>
            <Text style={styles.supportingText}>
              Live driver tracking becomes available after a driver is assigned and location updates start.
            </Text>
          </View>
        );
      }

      if (!mapsApiKey || !isNativeMapRuntimeAvailable || !NativeMapView || !NativeMarker) {
        return (
          <View style={[styles.mapFallbackCard, expanded ? styles.mapFallbackCardExpanded : null]}>
            <Text style={styles.cardTitle}>Live Map</Text>
            <Text style={styles.supportingText}>
              Map preview is available on iOS and Android with Google Maps configured.
            </Text>
            <Pressable style={styles.outlineButton} onPress={openTracking}>
              <Text style={styles.outlineButtonText}>Open tracking screen</Text>
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
              <NativeMarker coordinate={pickupCoordinate} title="Pickup" anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.pickupMarker}>
                  <IconSymbol
                    name={{ ios: 'mappin.circle.fill', android: 'location_on', web: 'location_on' }}
                    color="#FFFFFF"
                    size={18}
                  />
                </View>
              </NativeMarker>
            ) : null}
            {dropoffCoordinate ? (
              <NativeMarker coordinate={dropoffCoordinate} title="Dropoff" anchor={{ x: 0.5, y: 0.5 }}>
                <View style={styles.dropoffMarker}>
                  <IconSymbol
                    name={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
                    color="#FFFFFF"
                    size={16}
                  />
                </View>
              </NativeMarker>
            ) : null}
            {latestDriverLocation ? (
              <NativeMarker
                coordinate={{
                  latitude: latestDriverLocation.latitude,
                  longitude: latestDriverLocation.longitude,
                }}
                title="Driver"
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.driverMarker}>
                  <IconSymbol
                    name={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }}
                    color="#111827"
                    size={18}
                  />
                </View>
              </NativeMarker>
            ) : null}
            {latestDriverLocation && destinationCoordinate && NativeMapViewDirections ? (
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
                strokeColor="#F5C11A"
                onError={(message: string) => {
                  console.warn('Live tracking directions failed.', message);
                }}
              />
            ) : null}
          </NativeMapView>

          <Pressable
            style={styles.mapExpandButton}
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
              {latestDriverLocation ? 'Live route' : 'Waiting for location'}
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
      shouldShowTrackingMap,
      trackingDestination,
    ],
  );

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

  const helperText = buildOffersHelperText(requestData, offers.length);
  const canChooseOffer = requestData.status === 'PENDING_QUOTES' || requestData.status === 'QUOTED';
  const canDeleteCurrentRequest = canDeleteRequest(requestData.status);
  const canCancelCurrentTrip = requestData.cancellation.canCancelCollectedTrip;
  const cancellationReason = requestData.cancellation.reason;
  const refundPreview = requestData.cancellation.refundPreview;
  const liveStatusLabel = getTrackingStatusLabel(
    effectiveTrackingStatus,
    nearDeliveryNotifiedAt,
    ratingAvailable,
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(10, insets.top + 4) },
            keyboardInset > 0 ? { paddingBottom: 24 + keyboardInset } : undefined,
          ]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadStatus(true)} />}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable style={styles.topBarButton} onPress={goToHome}>
              <IconSymbol
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                color="#111827"
                size={24}
              />
            </Pressable>
            <View style={styles.topBarTitleWrap}>
              <Text style={styles.topBarTitle}>Order #{requestReference}</Text>
              <Text style={styles.topBarSubtitle}>
                {requestData.service?.nameEn || requestData.service?.key || requestData.serviceId}
              </Text>
            </View>
            <Pressable style={styles.topBarButton} onPress={() => void loadStatus(true)}>
              <IconSymbol
                name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
                color="#111827"
                size={22}
              />
            </Pressable>
          </View>

          <View style={styles.progressSection}>
            <View style={styles.progressRail} />
            <View style={styles.progressRow}>
              {ORDER_PROGRESS_STEPS.map((step) => {
                const isDone = currentOrderStep > step.id;
                const isCurrent = currentOrderStep === step.id;

                return (
                  <View key={step.id} style={styles.progressStep}>
                    <View
                      style={[
                        styles.progressCircle,
                        isDone ? styles.progressCircleDone : null,
                        isCurrent ? styles.progressCircleCurrent : null,
                        requestData.status === 'CANCELLED' ? styles.progressCircleDisabled : null,
                      ]}
                    >
                      {isDone ? (
                        <IconSymbol
                          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                          color="#111827"
                          size={18}
                        />
                      ) : (
                        <Text
                          style={[
                            styles.progressCircleText,
                            isCurrent ? styles.progressCircleTextActive : null,
                            requestData.status === 'CANCELLED' ? styles.progressCircleTextDisabled : null,
                          ]}
                        >
                          {step.id}
                        </Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.progressLabel,
                        isDone || isCurrent ? styles.progressLabelActive : null,
                        requestData.status === 'CANCELLED' ? styles.progressLabelDisabled : null,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {successMessage ? <View style={styles.successBanner}><Text style={styles.successBannerText}>{successMessage}</Text></View> : null}
          {errorMessage ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{errorMessage}</Text></View> : null}
          {nearDeliveryMessage ? (
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>{nearDeliveryMessage}</Text>
            </View>
          ) : null}
          {requestData.status === 'CANCELLED' ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Order cancelled</Text>
              <Text style={styles.supportingText}>
                {cancellationReason || 'This request has been cancelled.'}
              </Text>
              {cancelTripDebugMessage ? <Text style={styles.mutedCaption}>{cancelTripDebugMessage}</Text> : null}
            </View>
          ) : null}

          {shouldShowTrackingMap ? (
            <View style={styles.mapCard}>
              {renderTrackingMap(false)}
            </View>
          ) : null}

          {(driverName || requestData.driverSummary.assigned || acceptedOffer || canOpenChat) ? (
            <View style={styles.driverCard}>
              <View style={styles.driverRow}>
                <View style={styles.driverAvatar}>
                  <Text style={styles.driverAvatarText}>{getDriverInitials(driverName)}</Text>
                </View>
                <View style={styles.driverInfo}>
                  <Text style={styles.driverName}>{driverName || 'Driver pending'}</Text>
                  <Text style={styles.driverMeta}>
                    {driverRating !== null ? `★ ${driverRating.toFixed(1)} • ` : ''}
                    {requestData.driverSummary.assigned ? 'Assigned driver' : 'Waiting assignment'}
                  </Text>
                  <Text style={styles.driverVehicleText}>
                    {driverVehicleInfo || 'Vehicle details will appear here'}
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

              <Pressable
                style={[styles.primaryActionButton, !canRenderInlineMap && styles.disabledButton]}
                disabled={!canRenderInlineMap}
                onPress={() => setIsMapExpanded(true)}
              >
                <IconSymbol
                  name={{ ios: 'location', android: 'my_location', web: 'my_location' }}
                  color="#111827"
                  size={20}
                />
                <Text style={styles.primaryActionButtonText}>Track Driver Live</Text>
              </Pressable>

              {canOpenChat ? (
                isChatRoomLoading && !chatRoom ? (
                  <View style={styles.secondaryActionButton}>
                    <ActivityIndicator size="small" color="#111827" />
                    <Text style={styles.secondaryActionButtonText}>Checking chat…</Text>
                  </View>
                ) : chatRoom ? (
                  <Pressable style={styles.secondaryActionButton} onPress={openChat}>
                    <IconSymbol
                      name={{ ios: 'message', android: 'chat_bubble_outline', web: 'chat' }}
                      color="#111827"
                      size={20}
                    />
                    <Text style={styles.secondaryActionButtonText}>Chat with Driver</Text>
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

          <View style={styles.detailsCard}>
            <View style={styles.detailsHeader}>
              <Text style={styles.cardTitle}>Request Summary</Text>
              <Text style={styles.inlineStatusPill}>{liveStatusLabel}</Text>
            </View>
            <Text style={styles.detailsMetaText}>Submitted: {formatDate(requestData.submittedAt)}</Text>
            <Text style={styles.detailsMetaText}>{helperText}</Text>
            {socketMessage ? <Text style={styles.mutedCaption}>{socketMessage}</Text> : null}
            <View style={styles.detailsGrid}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Pickup</Text>
                <Text style={styles.detailValue}>{formatLocation(requestData.pickupLocation)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Dropoff</Text>
                <Text style={styles.detailValue}>{formatLocation(requestData.dropoffLocation)}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Schedule</Text>
                <Text style={styles.detailValue}>
                  {requestData.schedule.isImmediate
                    ? 'Immediate pickup'
                    : formatDate(requestData.schedule.scheduledPickupAt)}
                </Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Item</Text>
                <Text style={styles.detailValue}>
                  {requestData.itemDetails.title || 'N/A'} ({requestData.itemDetails.type || 'N/A'})
                </Text>
              </View>
            </View>
            {requestData.itemDetails.description ? (
              <Text style={styles.supportingText}>{requestData.itemDetails.description}</Text>
            ) : null}
            {latestDriverLocation ? (
              <Text style={styles.mutedCaption}>
                Latest driver update: {latestDriverLocation.latitude.toFixed(5)},{' '}
                {latestDriverLocation.longitude.toFixed(5)} • {formatDate(latestDriverLocation.recordedAt)}
              </Text>
            ) : null}
            {refundPreview && requestData.status !== 'CANCELLED' ? (
              <Text style={styles.mutedCaption}>
                Cancel now: refund {formatMoney(refundPreview.refundedAmount, refundPreview.currency)} and keep fee{' '}
                {formatMoney(refundPreview.retainedAmount, refundPreview.currency)}.
              </Text>
            ) : null}
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
              <Text style={[styles.offerCardTitle, styles.offerTextOnDark]}>Accepted Offer</Text>
              <Text style={[styles.offerPrimaryValue, styles.offerTextOnDark]}>
                {acceptedOffer.driverName || 'Driver'} •{' '}
                {formatMoney(acceptedOffer.proposedPrice ?? acceptedOffer.price, acceptedOffer.currency)}
              </Text>
              <Text style={[styles.rowValue, styles.offerSubtextOnDark]}>
                Accepted at: {formatDate(acceptedOffer.acceptedAt)}
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
                    <Text style={[styles.offerCardTitle, isSelected ? styles.offerTextOnDark : undefined]}>
                      {offer.driverName || 'Driver'}
                    </Text>
                    <Text
                      style={[styles.offerRatingText, isSelected ? styles.offerSubtextOnDark : undefined]}
                    >
                      {getRatingText(offer.driverRating)}
                    </Text>
                    <Text
                      style={[styles.offerStatusText, isSelected ? styles.offerSubtextOnDark : undefined]}
                    >
                      Status: {offer.offerStatus || offer.status}
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
                      ETA {offer.estimatedArrivalTime ? formatDate(offer.estimatedArrivalTime) : 'N/A'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.rowValue, isSelected ? styles.offerSubtextOnDark : undefined]}>
                  Estimated delivery:{' '}
                  {offer.estimatedDeliveryAt ? formatDate(offer.estimatedDeliveryAt) : 'N/A'}
                </Text>
                {offer.message ? (
                  <Text style={[styles.rowValue, isSelected ? styles.offerSubtextOnDark : undefined]}>
                    Message: {offer.message}
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
                      {isOpening ? 'Opening next step…' : isSelected ? 'Continue' : 'Select Driver'}
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
          <Text style={styles.cardTitle}>Pickup Proof Photos</Text>
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
            <Text style={styles.rowValue}>Pickup proof photos will appear after pickup is completed.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Proof Photos</Text>
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
            <Text style={styles.rowValue}>Delivery proof photos will appear after final delivery.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Additional Charges</Text>
          <Text style={styles.rowValue}>
            {t('extra_expense.saved_card_notice')}: {formatSavedPaymentMethod(defaultPaymentMethod)}
          </Text>
          {additionalCharges.length === 0 ? (
            <Text style={styles.rowValue}>No additional charges yet.</Text>
          ) : (
            additionalCharges.map((charge) => (
              <View key={charge.id} style={styles.additionalChargeCard}>
                <Text style={styles.offerPrimaryValue}>
                  {formatMoney(charge.totalChargeAmount, charge.currency)}
                </Text>
                <Text style={styles.rowValue}>
                  {t('extra_expense.expense_amount_label')}: {formatMoney(charge.amount, charge.currency)}
                </Text>
                <Text style={styles.rowValue}>
                  {t('extra_expense.app_fee_label')}: {formatMoney(charge.appFeeAmount, charge.currency)}
                </Text>
                <Text style={styles.rowValue}>Reason: {charge.reason}</Text>
                {charge.equipmentType ? (
                  <Text style={styles.rowValue}>Equipment: {charge.equipmentType}</Text>
                ) : null}
                <Text style={styles.rowValue}>Status: {charge.status}</Text>
                <Text style={styles.rowValue}>Added: {formatDate(charge.createdAt)}</Text>
                <Text style={styles.rowValue}>
                  {t('extra_expense.payment_option_label')}: {getAdditionalChargePaymentMethodLabel(charge, t)}
                </Text>
                {charge.payment.savedPaymentMethod ? (
                  <Text style={styles.rowValue}>
                    {t('extra_expense.saved_card_label')}: {formatSavedPaymentMethod(charge.payment.savedPaymentMethod)}
                  </Text>
                ) : null}
                {charge.payment.failureReason ? (
                  <Text style={styles.errorText}>{charge.payment.failureReason}</Text>
                ) : null}
                {charge.invoiceUrl ? (
                  <Text style={styles.rowValue}>Invoice: {resolveAssetUrl(charge.invoiceUrl)}</Text>
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
          <Text style={styles.cardTitle}>Photos</Text>
          {requestData.photos.length === 0 ? (
            <Text style={styles.rowValue}>No photos added.</Text>
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
            <Text style={styles.cardTitle}>Rate Service</Text>
            <Text style={styles.rowValue}>
              Final delivery is confirmed. You can rate the driver from here if you skipped the prompt.
            </Text>
            <Pressable style={styles.primaryButton} onPress={onRateDriver}>
              <Text style={styles.primaryButtonText}>Rate driver</Text>
            </Pressable>
          </View>
        ) : null}

        {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.actionStack}>
          <Pressable style={styles.statusActionButton} onPress={() => void loadStatus(false)}>
            <Text style={styles.statusActionButtonText}>
              {isRefreshing ? 'Refreshing…' : 'Request Status'}
            </Text>
          </Pressable>
          {ratingAvailable ? (
            <Pressable style={styles.rateActionButton} onPress={onRateDriver}>
              <Text style={styles.rateActionButtonText}>Rate Driver</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.supportActionButton} onPress={onContactSupport}>
            <Text style={styles.supportActionButtonText}>Contact Support</Text>
          </Pressable>
          {canCancelCurrentTrip ? (
            <Pressable onPress={onCancelTrip}>
              <Text style={styles.cancelActionText}>{isCancellingTrip ? 'Cancelling…' : 'Cancel Order'}</Text>
            </Pressable>
          ) : canDeleteCurrentRequest ? (
            <Pressable
              onPress={() => {
                Alert.alert('Delete request?', 'This will permanently delete the request.', [
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
                            error instanceof Error ? error.message : 'Failed to delete request.',
                          );
                        }
                      })();
                    },
                  },
                ]);
              }}
            >
              <Text style={styles.cancelActionText}>Delete Request</Text>
            </Pressable>
          ) : null}
        </View>
        <Modal visible={isMapExpanded} animationType="slide" onRequestClose={() => setIsMapExpanded(false)}>
          <SafeAreaView style={styles.mapExpandedScreen}>
            <View style={styles.expandedMapHeader}>
              <Pressable style={styles.topBarButton} onPress={() => setIsMapExpanded(false)}>
                <IconSymbol
                  name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                  color="#111827"
                  size={24}
                />
              </Pressable>
              <Text style={styles.expandedMapTitle}>Live Map</Text>
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
              <Text style={styles.cardTitle}>Cancel trip?</Text>
              <Text style={styles.rowValue}>
                {requestData.cancellation.refundPreview
                  ? `If you cancel now, ${formatMoney(
                    requestData.cancellation.refundPreview.refundedAmount,
                    requestData.cancellation.refundPreview.currency,
                  )} will be refunded automatically and ${formatMoney(
                    requestData.cancellation.refundPreview.retainedAmount,
                    requestData.cancellation.refundPreview.currency,
                  )} will be kept as the cancellation fee.`
                  : 'If you cancel before pickup, 85% will be refunded automatically and 15% will be kept as the cancellation fee.'}
              </Text>
              <View style={styles.dialogActions}>
                <Pressable
                  style={[styles.secondaryOutlineButton, isCancellingTrip && styles.disabledButton]}
                  disabled={isCancellingTrip}
                  onPress={closeCancelTripModal}
                >
                  <Text style={styles.secondaryOutlineButtonText}>Keep trip</Text>
                </Pressable>
                <Pressable
                  style={[styles.deleteButton, isCancellingTrip && styles.disabledButton]}
                  disabled={isCancellingTrip}
                  onPress={() => void confirmCancelTrip()}
                >
                  <Text style={styles.deleteButtonText}>
                    {isCancellingTrip ? 'Cancelling…' : 'Cancel trip'}
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
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 8,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  helperText: {
    color: '#627287',
    fontSize: 13,
    lineHeight: 18,
  },
  supportingText: {
    color: '#627287',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  topBarSubtitle: {
    fontSize: 13,
    color: '#76869B',
  },
  progressSection: {
    paddingTop: 2,
    paddingBottom: 4,
    position: 'relative',
  },
  progressRail: {
    position: 'absolute',
    top: 27,
    left: 36,
    right: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  progressStep: {
    flex: 1,
    alignItems: 'center',
    gap: 10,
  },
  progressCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  progressCircleDone: {
    backgroundColor: '#F9C30B',
  },
  progressCircleCurrent: {
    backgroundColor: '#F9C30B',
  },
  progressCircleDisabled: {
    backgroundColor: '#E5E7EB',
  },
  progressCircleText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  progressCircleTextActive: {
    color: '#111827',
  },
  progressCircleTextDisabled: {
    color: '#9CA3AF',
  },
  progressLabel: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: '#98A2B3',
    maxWidth: 72,
  },
  progressLabelActive: {
    color: '#374151',
    fontWeight: '600',
  },
  progressLabelDisabled: {
    color: '#B8C0CC',
  },
  successBanner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#E9F9EE',
  },
  successBannerText: {
    color: '#1E9E4A',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBanner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FDE8E7',
  },
  errorBannerText: {
    color: '#C0392B',
    fontSize: 14,
    fontWeight: '600',
  },
  infoBanner: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#EEF5FF',
  },
  infoBannerText: {
    color: '#2563EB',
    fontSize: 13,
    fontWeight: '600',
  },
  noticeCard: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F5D0CD',
    gap: 8,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  mutedCaption: {
    fontSize: 12,
    lineHeight: 18,
    color: '#94A3B8',
  },
  mapCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  mapFrame: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#DDF0DD',
  },
  mapFrameInline: {
    height: 420,
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
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  mapFallbackCard: {
    borderRadius: 20,
    padding: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EF',
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
    backgroundColor: '#FFFFFF',
  },
  outlineButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  pickupMarker: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1DB954',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropoffMarker: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FF4B3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverMarker: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F9C30B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 14,
    shadowColor: '#111827',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  driverAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#E4B200',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAvatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  driverInfo: {
    flex: 1,
    gap: 4,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  driverMeta: {
    fontSize: 15,
    color: '#6B7280',
  },
  driverVehicleText: {
    fontSize: 13,
    color: '#98A2B3',
  },
  socketBadgeCompact: {
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
    color: '#111827',
  },
  primaryActionButton: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: '#F9C30B',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
  },
  primaryActionButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryActionButton: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
  },
  secondaryActionButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  inlineBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  inlineBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  detailsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 10,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  inlineStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F3F4F6',
    color: '#111827',
    fontSize: 12,
    fontWeight: '600',
  },
  detailsMetaText: {
    fontSize: 13,
    color: '#627287',
  },
  detailsGrid: {
    gap: 12,
  },
  detailItem: {
    gap: 4,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#98A2B3',
  },
  detailValue: {
    fontSize: 14,
    lineHeight: 20,
    color: '#111827',
  },
  rowLabel: {
    marginTop: 8,
    fontSize: 12,
    color: '#98A2B3',
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    color: '#111827',
    marginTop: 2,
    lineHeight: 20,
  },
  emptyState: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
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
    color: '#111827',
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
    borderColor: '#E5E8EF',
    borderRadius: 16,
    padding: 12,
    gap: 8,
    backgroundColor: '#FFFFFF',
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
    color: '#627287',
    textAlign: 'center',
  },
  offerTopText: {
    flex: 1,
    gap: 3,
  },
  offerCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  offerRatingText: {
    color: '#627287',
    fontSize: 13,
  },
  offerStatusText: {
    color: '#627287',
    fontSize: 12,
  },
  offerTextOnDark: {
    color: '#111827',
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
    color: '#111827',
    fontSize: 14,
    textAlign: 'right',
  },
  offerArrivalText: {
    marginTop: 4,
    color: '#627287',
    fontSize: 12,
    textAlign: 'right',
  },
  offerPrimaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
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
    borderColor: '#E5E8EF',
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
    backgroundColor: '#3F7AE8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  statusActionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  rateActionButton: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: '#F9C30B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  rateActionButtonText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '700',
  },
  supportActionButton: {
    minHeight: 56,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  supportActionButtonText: {
    color: '#111827',
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
    backgroundColor: '#FAFAFA',
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
    color: '#111827',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 10,
  },
  chargeDialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 14,
  },
  chargeDialogHeader: {
    gap: 6,
  },
  chargeDialogAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
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
    color: '#111827',
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
    color: '#111827',
  },
  confirmationInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: '#111827',
  },
  paymentOptionList: {
    gap: 10,
  },
  paymentOptionCard: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#FFFFFF',
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
    color: '#111827',
  },
  paymentOptionDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#627287',
  },
  selectedPaymentCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 4,
  },
  dialogActions: {
    gap: 10,
  },
  expandedPhoto: {
    width: '100%',
    height: '100%',
  },
  actionsRow: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#111827',
    borderRadius: 14,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryButton: {
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    backgroundColor: '#FFFFFF',
  },
  secondaryOutlineButton: {
    borderRadius: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    backgroundColor: '#FFFFFF',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryOutlineButtonText: {
    color: '#111827',
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  loadingText: {
    color: '#627287',
    marginTop: 8,
    fontSize: 14,
  },
  successText: {
    color: '#1E9E4A',
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: '#C0392B',
    fontSize: 14,
    textAlign: 'center',
  },
});
