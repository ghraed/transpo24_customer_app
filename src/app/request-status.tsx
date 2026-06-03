import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { acceptCustomerRequestOffer, getCustomerRequestOffers, getCustomerRequestStatus } from '@/lib/api';
import type {
  CustomerRequestOfferSummary,
  CustomerRequestStatus,
  RequestStatusResponse,
} from '@/types/customer-request';

interface TimelineStep {
  key: string;
  label: string;
}

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

function formatDate(value: string | null | undefined): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatLocation(
  location: RequestStatusResponse['pickupLocation'] | RequestStatusResponse['dropoffLocation'],
): string {
  if (location.address) return location.address;
  if (location.latitude === null || location.longitude === null) return 'N/A';
  return `Lat ${location.latitude.toFixed(6)}, Lng ${location.longitude.toFixed(6)}`;
}

function shortRequestId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function resolvePhotoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|file:|content:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function parseInitialRequest(raw: string | undefined): RequestStatusResponse | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RequestStatusResponse;
    return parsed;
  } catch {
    return null;
  }
}

export default function RequestStatusScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const initialRequest = useMemo(
    () => parseInitialRequest(typeof params.initialRequest === 'string' ? params.initialRequest : undefined),
    [params.initialRequest],
  );

  const [requestData, setRequestData] = useState<RequestStatusResponse | null>(initialRequest);
  const [isLoading, setIsLoading] = useState<boolean>(!initialRequest);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [offers, setOffers] = useState<CustomerRequestOfferSummary[]>([]);
  const [isAcceptingOfferId, setIsAcceptingOfferId] = useState<string>('');

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
        setRequestData(data);
        const offersResponse = await getCustomerRequestOffers(requestId);
        setOffers(offersResponse.offers ?? []);
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

  const progressIndex = requestData ? STATUS_PROGRESS[requestData.status] : 0;
  const pendingOffers = offers.filter((offer) => offer.status === 'PENDING');
  const acceptedOffer = offers.find((offer) => offer.status === 'ACCEPTED') ?? null;

  const onAcceptOffer = (offer: CustomerRequestOfferSummary): void => {
    if (!requestData) return;
    if (isAcceptingOfferId) return;
    if (!(requestData.status === 'QUOTED' || requestData.status === 'PENDING_QUOTES')) {
      return;
    }

    Alert.alert(
      'Accept this offer?',
      `Accept ${offer.price} ${offer.currency} from this driver?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => {
            void (async () => {
              setIsAcceptingOfferId(offer.id);
              setErrorMessage('');
              try {
                await acceptCustomerRequestOffer(requestData.id, offer.id);
                router.push({
                  pathname: '/customer-tracking',
                  params: {
                    tripId: requestData.id,
                    pickupLatitude: String(requestData.pickupLocation.latitude ?? ''),
                    pickupLongitude: String(requestData.pickupLocation.longitude ?? ''),
                    pickupAddress: requestData.pickupLocation.address ?? '',
                    dropoffLatitude: String(requestData.dropoffLocation.latitude ?? ''),
                    dropoffLongitude: String(requestData.dropoffLocation.longitude ?? ''),
                    dropoffAddress: requestData.dropoffLocation.address ?? '',
                  },
                });
                await loadStatus(false);
              } catch (error) {
                const message = error instanceof Error ? error.message : 'Failed to accept offer.';
                setErrorMessage(message);
              } finally {
                setIsAcceptingOfferId('');
              }
            })();
          },
        },
      ],
    );
  };

  const goHome = (): void => {
    router.replace('/(tabs)/home' as Href);
  };

  if (!requestId) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.title}>Request Status</Text>
        <Text style={styles.errorText}>Missing request id.</Text>
        <Pressable style={styles.secondaryButton} onPress={goHome}>
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (isLoading && !requestData) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading request status...</Text>
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

  const canOpenTrackingMap =
    requestData.pickupLocation.latitude !== null &&
    requestData.pickupLocation.longitude !== null &&
    requestData.dropoffLocation.latitude !== null &&
    requestData.dropoffLocation.longitude !== null;

  const openTrackingMap = (): void => {
    if (!canOpenTrackingMap) return;

    router.push({
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
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadStatus(true)} />}
      >
        <View style={styles.headerCard}>
          <Text style={styles.title}>Request Status</Text>
          <Text style={styles.subtitle}>Track the progress of your transport request.</Text>
          <Text style={styles.statusPill}>{requestData.statusLabel || requestData.status}</Text>
          <Text style={styles.metaText}>Request #{shortRequestId(requestData.id)}</Text>
          <Text style={styles.metaText}>Submitted: {formatDate(requestData.submittedAt)}</Text>
          <Text style={styles.helperText}>Drivers will review your request and send offers soon.</Text>
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
          <Text style={styles.rowLabel}>Loading Help</Text>
          <Text style={styles.rowValue}>
            {requestData.itemDetails.requiresLoadingHelp
              ? `Yes (${requestData.itemDetails.loadingWorkersCount ?? 0} workers)`
              : 'No'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quotes & Offers</Text>
          {offers.length > 0 ? (
            <Text style={styles.rowValue}>
              {offers.length} offers • Lowest: {requestData.quotesSummary.lowestPrice ?? 'N/A'}{' '}
              {requestData.quotesSummary.currency || ''}
            </Text>
          ) : (
            <Text style={styles.rowValue}>No offers yet</Text>
          )}
          {acceptedOffer ? (
            <View style={styles.offerCardAccepted}>
              <Text style={styles.offerCardTitle}>Accepted Offer</Text>
              <Text style={styles.rowValue}>
                {acceptedOffer.price} {acceptedOffer.currency}
              </Text>
              <Text style={styles.rowValue}>Accepted at: {formatDate(acceptedOffer.acceptedAt)}</Text>
            </View>
          ) : null}
          {offers.map((offer) => (
            <View key={offer.id} style={styles.offerCard}>
              <Text style={styles.offerCardTitle}>
                Offer: {offer.price} {offer.currency}
              </Text>
              <Text style={styles.rowValue}>Status: {offer.status}</Text>
              <Text style={styles.rowValue}>
                Estimated pickup: {offer.estimatedPickupAt ? formatDate(offer.estimatedPickupAt) : 'N/A'}
              </Text>
              <Text style={styles.rowValue}>
                Estimated delivery: {offer.estimatedDeliveryAt ? formatDate(offer.estimatedDeliveryAt) : 'N/A'}
              </Text>
              {offer.message ? <Text style={styles.rowValue}>Message: {offer.message}</Text> : null}
              <Pressable
                style={[
                  styles.primaryButton,
                  (offer.status !== 'PENDING' ||
                    isAcceptingOfferId === offer.id ||
                    requestData.status === 'ACCEPTED' ||
                    requestData.status === 'DRIVER_ASSIGNED') &&
                    styles.disabledButton,
                ]}
                onPress={() => onAcceptOffer(offer)}
                disabled={
                  offer.status !== 'PENDING' ||
                  Boolean(isAcceptingOfferId) ||
                  requestData.status === 'ACCEPTED' ||
                  requestData.status === 'DRIVER_ASSIGNED'
                }
              >
                <Text style={styles.primaryButtonText}>
                  {isAcceptingOfferId === offer.id ? 'Accepting...' : 'Accept Offer'}
                </Text>
              </Pressable>
            </View>
          ))}
          {offers.length === 0 ? null : pendingOffers.length === 0 && !acceptedOffer ? (
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
            <Text style={styles.rowValue}>No driver assigned yet</Text>
          )}
          {requestData.trackingSummary.available ? (
            <Text style={styles.rowValue}>
              Tracking updated {formatDate(requestData.trackingSummary.lastUpdatedAt)}
            </Text>
          ) : (
            <Text style={styles.rowValue}>Tracking is not available yet</Text>
          )}
          <Pressable
            style={[styles.primaryButton, !canOpenTrackingMap && styles.disabledButton]}
            onPress={openTrackingMap}
            disabled={!canOpenTrackingMap}
          >
            <Text style={styles.primaryButtonText}>Open Live Map</Text>
          </Pressable>
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
                  source={{ uri: resolvePhotoUrl(photo.url) }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          )}
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.primaryButton} onPress={() => void loadStatus(false)}>
            <Text style={styles.primaryButtonText}>{isRefreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={goHome}>
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
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
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
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingText: {
    color: '#475569',
    marginTop: 8,
    fontSize: 14,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
  offerCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  offerCardAccepted: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 10,
    padding: 10,
    gap: 4,
    backgroundColor: '#F0FDF4',
  },
  offerCardTitle: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
});
