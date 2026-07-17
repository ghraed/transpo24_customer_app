import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { getApiBaseUrl } from '@/config/backend';
import { ChatEntryButton } from '@/components/chat-entry-button';
import { M3LoginColors } from '@/constants/theme';
import { isDeliveryCompletedStatus, isHistoryRequestStatus } from '@/lib/request-status';
import {
  approveAdditionalCharge,
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

interface TimelineStep {
  key: string;
  label: string;
}

type SocketState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error' | 'unavailable';

const TIMELINE_STEPS: TimelineStep[] = [
  { key: 'DRIVER_ASSIGNED', label: 'Driver before starting the order' },
  { key: 'DRIVER_GOING_TO_PICKUP', label: 'Driver is on the way to the pickup location' },
  { key: 'DRIVER_ARRIVED_PICKUP', label: 'Driver has arrived at the pickup location' },
  { key: 'ITEM_PICKED_UP', label: 'Pickup completed' },
  { key: 'DRIVER_GOING_TO_DROPOFF', label: 'Driver is on the way to the delivery location' },
  { key: 'DELIVERED', label: 'Delivered' },
];

const STATUS_PROGRESS: Partial<Record<CustomerRequestStatus | RequestTrackingStatus, number>> = {
  ACCEPTED: 0,
  DRIVER_ASSIGNED: 0,
  DRIVER_GOING_TO_PICKUP: 1,
  DRIVER_ARRIVED_PICKUP: 2,
  PICKUP_IN_PROGRESS: 2,
  ITEM_PICKED_UP: 3,
  IN_TRANSIT: 4,
  DRIVER_GOING_TO_DROPOFF: 4,
  DELIVERED: 5,
  COMPLETED: 5,
  CANCELLED: -1,
};

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
  if (
    status === 'ACCEPTED' ||
    status === 'DRIVER_ASSIGNED' ||
    status === 'DRIVER_GOING_TO_PICKUP' ||
    status === 'DRIVER_ARRIVED_PICKUP' ||
    status === 'PICKUP_IN_PROGRESS' ||
    status === 'ITEM_PICKED_UP' ||
    status === 'IN_TRANSIT' ||
    status === 'DRIVER_GOING_TO_DROPOFF' ||
    status === 'DELIVERED' ||
    status === 'COMPLETED'
  ) {
    return 'Order Tracking';
  }
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
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const { language } = useAppLanguage();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const refreshTs = typeof params.refreshTs === 'string' ? params.refreshTs : '';
  const initialRequest = useMemo(
    () => parseInitialRequest(typeof params.initialRequest === 'string' ? params.initialRequest : undefined),
    [params.initialRequest],
  );
  const accessToken = useMemo(() => getAccessToken(), []);

  const [requestData, setRequestData] = useState<RequestStatusResponse | null>(initialRequest);
  const [offers, setOffers] = useState<CustomerRequestOfferSummary[]>([]);
  const [trackingData, setTrackingData] = useState<RequestTracking | null>(null);
  const [latestDriverLocation, setLatestDriverLocation] = useState<DriverLocation | null>(null);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<SavedPaymentMethodSummary | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const [isOpeningPaymentOfferId, setIsOpeningPaymentOfferId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(!initialRequest);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeAdditionalCharge, setActiveAdditionalCharge] = useState<AdditionalCharge | null>(null);
  const [additionalChargeConfirmationText, setAdditionalChargeConfirmationText] = useState<string>('');
  const [isApprovingAdditionalCharge, setIsApprovingAdditionalCharge] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [nearDeliveryMessage, setNearDeliveryMessage] = useState<string>('');
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string>('');
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
        const [data, offersResponse, chargesResponse, paymentMethodResponse] = await Promise.all([
          getCustomerRequestStatus(requestId),
          getCustomerRequestOffers(requestId),
          getRequestAdditionalCharges(requestId),
          getDefaultPaymentMethod(),
        ]);
        let nextTracking: RequestTracking | null = null;

        try {
          nextTracking = await getRequestTracking(requestId);
        } catch (trackingError) {
          const trackingMessage =
            trackingError instanceof Error ? trackingError.message.toLowerCase() : '';

          if (!trackingMessage.includes('not found')) {
            throw trackingError;
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
    if (!requestId || !accessToken) return;

    setTimeout(() => setSocketState('connecting'), 0);

    try {
      connectSocket(accessToken);
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
  }, [accessToken, loadStatus, requestId, router]);

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
  const isDeliveryCompleted = isDeliveryCompletedStatus(effectiveTrackingStatus);
  const canOpenChat = Boolean(
    !isHistoryRequest &&
      (acceptedOffer || requestData?.driverSummary.assigned) &&
      (requestData?.driverSummary.driverId || acceptedOffer?.driverId),
  );
  const confirmationKeyword = t('extra_expense.confirm_keyword', { defaultValue: 'Agree' });
  const resolvedConfirmationLocale = language || DEFAULT_LANGUAGE;
  const trimmedAdditionalChargeConfirmationText = additionalChargeConfirmationText.trim();
  const isAdditionalChargeConfirmationValid =
    trimmedAdditionalChargeConfirmationText === confirmationKeyword;

  const openTracking = useCallback((): void => {
    if (!requestData || !canOpenTrackingMap) return;
    router.push(buildTrackingHref(requestData, effectiveTrackingStatus));
  }, [canOpenTrackingMap, effectiveTrackingStatus, requestData, router]);

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

    if (!defaultPaymentMethod) {
      router.push(
        (`/payment-method?requestId=${encodeURIComponent(requestId)}`) as Href,
      );
      return;
    }

    setActiveAdditionalCharge(charge);
    setAdditionalChargeConfirmationText('');
  }, [defaultPaymentMethod, requestId, router]);

  const closeAdditionalChargeModal = useCallback((): void => {
    if (isApprovingAdditionalCharge) {
      return;
    }

    setActiveAdditionalCharge(null);
    setAdditionalChargeConfirmationText('');
  }, [isApprovingAdditionalCharge]);

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
    isAdditionalChargeConfirmationValid,
    loadStatus,
    requestId,
    resolvedConfirmationLocale,
    t,
    trimmedAdditionalChargeConfirmationText,
  ]);

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

  const progressIndex = STATUS_PROGRESS[effectiveTrackingStatus] ?? -1;
  const headline = getHeadline(requestData.status, offers.length);
  const helperText = buildOffersHelperText(requestData, offers.length);
  const canChooseOffer = requestData.status === 'PENDING_QUOTES' || requestData.status === 'QUOTED';
  const canDeleteCurrentRequest = canDeleteRequest(requestData.status);

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
            {getTrackingStatusLabel(effectiveTrackingStatus, nearDeliveryNotifiedAt, ratingAvailable)}
          </Text>
          <Text style={styles.metaText}>Request #{shortRequestId(requestData.id)}</Text>
          <Text style={styles.metaText}>Submitted: {formatDate(requestData.submittedAt)}</Text>
          <Text style={styles.helperText}>{helperText}</Text>
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
          <Text style={styles.helperText}>
            Current update:{' '}
            {getTrackingStatusLabel(effectiveTrackingStatus, nearDeliveryNotifiedAt, ratingAvailable)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tracking Summary</Text>
          {nearDeliveryMessage ? (
            <View style={styles.bannerCard}>
              <Text style={styles.bannerTitle}>Delivery update</Text>
              <Text style={styles.bannerText}>{nearDeliveryMessage}</Text>
            </View>
          ) : null}
          <Text style={styles.rowLabel}>Assigned driver</Text>
          <Text style={styles.rowValue}>
            {trackingData?.driverName || requestData.driverSummary.driverName || 'Not assigned yet'}
          </Text>
          {trackingData?.driverVehiclePhoto ? (
            <Image
              source={{ uri: resolveAssetUrl(trackingData.driverVehiclePhoto) }}
              style={styles.driverVehiclePhoto}
              resizeMode="cover"
            />
          ) : null}
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
          <Text style={styles.rowLabel}>Latest driver location</Text>
          {latestDriverLocation ? (
            <Text style={styles.rowValue}>
              {latestDriverLocation.latitude.toFixed(5)}, {latestDriverLocation.longitude.toFixed(5)} •{' '}
              {formatDate(latestDriverLocation.recordedAt)}
            </Text>
          ) : (
            <Text style={styles.rowValue}>No driver location yet.</Text>
          )}
          {trackingData?.deliveredAt ? (
            <>
              <Text style={styles.rowLabel}>Delivered at</Text>
              <Text style={styles.rowValue}>{formatDate(trackingData.deliveredAt)}</Text>
            </>
          ) : null}
          {ratingAvailable ? (
            <>
              <Text style={styles.rowLabel}>Rating</Text>
              <Text style={styles.rowValue}>Rating pending</Text>
            </>
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
            <Text style={styles.primaryButtonText}>
              {isDeliveryCompleted ? 'Open Delivery Summary' : 'Open Tracking Map'}
            </Text>
          </Pressable>
          <ChatEntryButton
            transportRequestId={requestData.id}
            enabled={canOpenChat}
            requestStatus={requestData.status}
          />
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
                    style={[styles.primaryButton, isApprovingAdditionalCharge && styles.disabledButton]}
                    disabled={isApprovingAdditionalCharge}
                    onPress={() => openAdditionalChargeFlow(charge)}
                  >
                    <Text style={styles.primaryButtonText}>
                      {defaultPaymentMethod
                        ? charge.status === 'FAILED'
                          ? t('extra_expense.retry_button')
                          : t('extra_expense.approve_button')
                        : t('extra_expense.add_payment_method_button')}
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

        <View style={styles.actionsRow}>
          <Pressable style={styles.primaryButton} onPress={() => void loadStatus(false)}>
            <Text style={styles.primaryButtonText}>{isRefreshing ? 'Refreshing…' : 'Refresh'}</Text>
          </Pressable>
          {canDeleteCurrentRequest ? (
            <Pressable
              style={styles.deleteButton}
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
              <Text style={styles.deleteButtonText}>Delete Request</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)/home' as Href)}>
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </Pressable>
        </View>
        <Modal
          visible={Boolean(activeAdditionalCharge)}
          transparent
          animationType="fade"
          onRequestClose={closeAdditionalChargeModal}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.cardTitle}>{t('extra_expense.confirm_title')}</Text>
              <Text style={styles.rowValue}>
                {activeAdditionalCharge
                  ? formatMoney(activeAdditionalCharge.totalChargeAmount, activeAdditionalCharge.currency)
                  : ''}
              </Text>
              {activeAdditionalCharge ? (
                <Text style={styles.rowValue}>
                  {t('extra_expense.expense_amount_label')}: {formatMoney(activeAdditionalCharge.amount, activeAdditionalCharge.currency)}
                </Text>
              ) : null}
              {activeAdditionalCharge ? (
                <Text style={styles.rowValue}>
                  {t('extra_expense.app_fee_label')}: {formatMoney(activeAdditionalCharge.appFeeAmount, activeAdditionalCharge.currency)}
                </Text>
              ) : null}
              {activeAdditionalCharge ? (
                <Text style={styles.rowValue}>{activeAdditionalCharge.reason}</Text>
              ) : null}
              <Text style={styles.helperText}>{t('extra_expense.saved_card_notice')}</Text>
              <Text style={styles.helperText}>
                {t('extra_expense.confirm_prompt', {
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
              <Text style={styles.rowValue}>
                {t('extra_expense.saved_card_label')}: {formatSavedPaymentMethod(defaultPaymentMethod)}
              </Text>
              <View style={styles.dialogActions}>
                <Pressable
                  style={[styles.secondaryOutlineButton, isApprovingAdditionalCharge && styles.disabledButton]}
                  disabled={isApprovingAdditionalCharge}
                  onPress={closeAdditionalChargeModal}
                >
                  <Text style={styles.secondaryOutlineButtonText}>{t('extra_expense.cancel_button')}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.primaryButton,
                    (!isAdditionalChargeConfirmationValid || isApprovingAdditionalCharge) &&
                      styles.disabledButton,
                  ]}
                  disabled={!isAdditionalChargeConfirmationValid || isApprovingAdditionalCharge}
                  onPress={() => void onApproveAdditionalCharge()}
                >
                  <Text style={styles.primaryButtonText}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3LoginColors.background,
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: M3LoginColors.background,
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
    backgroundColor: M3LoginColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  card: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    marginTop: 6,
    color: M3LoginColors.textSecondary,
    fontSize: 14,
  },
  statusPill: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: M3LoginColors.primaryContainer,
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: '600',
  },
  metaText: {
    marginTop: 8,
    color: M3LoginColors.textSecondary,
    fontSize: 13,
  },
  helperText: {
    marginTop: 8,
    color: M3LoginColors.textSecondary,
    fontSize: 13,
  },
  bannerCard: {
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: M3LoginColors.secondary,
    borderWidth: 1,
    borderColor: M3LoginColors.secondary,
  },
  bannerTitle: {
    color: M3LoginColors.textPrimary,
    fontWeight: '700',
  },
  bannerText: {
    color: M3LoginColors.textPrimary,
    marginTop: 4,
  },
  socketBadge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  socketBadgeConnected: {
    backgroundColor: M3LoginColors.primaryContainer,
  },
  socketBadgeWarning: {
    backgroundColor: M3LoginColors.secondary,
  },
  socketBadgeNeutral: {
    backgroundColor: M3LoginColors.outlineVariant,
  },
  socketBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: M3LoginColors.textPrimary,
  },
  socketMessage: {
    marginTop: 8,
    color: M3LoginColors.textSecondary,
    fontSize: 13,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
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
    backgroundColor: M3LoginColors.outline,
  },
  timelineDotDone: {
    backgroundColor: M3LoginColors.primary,
  },
  timelineDotCurrent: {
    backgroundColor: M3LoginColors.primary,
  },
  timelineText: {
    color: M3LoginColors.textSecondary,
    fontSize: 14,
  },
  timelineTextDone: {
    color: M3LoginColors.textPrimary,
    fontWeight: '500',
  },
  timelineTextCurrent: {
    color: M3LoginColors.primary,
    fontWeight: '700',
  },
  rowLabel: {
    marginTop: 8,
    fontSize: 12,
    color: M3LoginColors.textTertiary,
    fontWeight: '600',
  },
  rowValue: {
    fontSize: 14,
    color: M3LoginColors.textPrimary,
    marginTop: 2,
  },
  driverVehiclePhoto: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: M3LoginColors.outlineVariant,
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
    backgroundColor: M3LoginColors.primary,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
  },
  selectedOfferLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  selectedOfferValue: {
    marginTop: 4,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  offerCardAccepted: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
    backgroundColor: M3LoginColors.primary,
    borderColor: M3LoginColors.outline,
    borderWidth: 1,
  },
  offerCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: M3LoginColors.surface,
  },
  offerCardSelected: {
    borderColor: M3LoginColors.primary,
    backgroundColor: M3LoginColors.primary,
  },
  offerTopRow: {
    flexDirection: 'row',
    gap: 10,
  },
  offerVehiclePhoto: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: M3LoginColors.outlineVariant,
  },
  offerVehiclePhotoPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: M3LoginColors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  offerVehiclePhotoPlaceholderText: {
    fontSize: 11,
    color: M3LoginColors.textSecondary,
    textAlign: 'center',
  },
  offerTopText: {
    flex: 1,
    gap: 3,
  },
  offerCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  offerRatingText: {
    color: M3LoginColors.textSecondary,
    fontSize: 13,
  },
  offerStatusText: {
    color: M3LoginColors.textSecondary,
    fontSize: 12,
  },
  offerPriceBlock: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
  offerPriceValue: {
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
    fontSize: 14,
    textAlign: 'right',
  },
  offerArrivalText: {
    marginTop: 4,
    color: M3LoginColors.textSecondary,
    fontSize: 12,
    textAlign: 'right',
  },
  offerPrimaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  offerTextOnDark: {
    color: '#FFFFFF',
  },
  offerSubtextOnDark: {
    color: '#FFFFFF',
  },
  additionalChargeCard: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: M3LoginColors.surfaceContainer,
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
    backgroundColor: M3LoginColors.outlineVariant,
  },
  photoLarge: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: M3LoginColors.outlineVariant,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 27, 31, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 27, 31, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: M3LoginColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    gap: 10,
  },
  confirmationInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    color: M3LoginColors.textPrimary,
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
    backgroundColor: M3LoginColors.primary,
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
    borderColor: M3LoginColors.primary,
    backgroundColor: M3LoginColors.primary,
    marginTop: 8,
  },
  secondaryOutlineButton: {
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: M3LoginColors.surface,
  },
  deleteButton: {
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: M3LoginColors.error,
    marginTop: 8,
  },
  primaryButtonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButtonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  secondaryOutlineButtonText: {
    color: M3LoginColors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
  loadingText: {
    color: M3LoginColors.textSecondary,
    marginTop: 8,
    fontSize: 14,
  },
  successText: {
    color: M3LoginColors.primary,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    color: M3LoginColors.error,
    fontSize: 14,
    textAlign: 'center',
  },
});
