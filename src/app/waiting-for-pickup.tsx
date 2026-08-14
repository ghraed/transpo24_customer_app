import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChatEntryButton } from '@/components/chat-entry-button';
import {
  isNativeMapRuntimeAvailable,
  NativeMapView,
  NativeMarker,
} from '@/components/native-maps';
import {
  clientTheme,
  TrackingHero,
  TrackingInfoPill,
  TrackingMapModal,
  TrackingMapShell,
  TrackingMetaRow,
  TrackingProgress,
  TrackingScreenCard,
  TrackingScrollable,
} from '@/components/tracking-ui';
import { getAccessToken } from '@/lib/auth-token';
import {
  connectSocket,
  joinTripRoom,
  leaveTripRoom,
  onAdditionalChargeAdded,
  onDriverLocationUpdated,
  onItemPickedUp,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
} from '@/services/socketService';
import type { AdditionalCharge } from '@/types/customer-request';
import type {
  AddressedLocation,
  GeoLocation,
  ItemPickedUpPayload,
} from '@/types/trip.types';
import {
  isValidGeoLocation,
  isValidTripId,
  validateDriverLocationUpdatedPayload,
  validateItemPickedUpPayload,
  validateTripStatusUpdatedPayload,
} from '@/utils/pickupValidation';

type RouteParams = {
  tripId?: string;
  pickupLatitude?: string;
  pickupLongitude?: string;
  pickupAddress?: string;
  dropoffLatitude?: string;
  dropoffLongitude?: string;
  dropoffAddress?: string;
};

function parseNumber(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function WaitingForPickupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();

  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';
  const [driverLocation, setDriverLocation] = useState<GeoLocation | null>(null);
  const [pickupInfo, setPickupInfo] = useState<ItemPickedUpPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isWaiting, setIsWaiting] = useState(true);
  const [latestAdditionalCharge, setLatestAdditionalCharge] = useState<AdditionalCharge | null>(
    null,
  );
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const pickupLocation = useMemo<AddressedLocation | null>(() => {
    const latitude = parseNumber(params.pickupLatitude);
    const longitude = parseNumber(params.pickupLongitude);
    if (latitude === null || longitude === null) return null;
    return {
      latitude,
      longitude,
      address: typeof params.pickupAddress === 'string' ? params.pickupAddress : null,
    };
  }, [params.pickupAddress, params.pickupLatitude, params.pickupLongitude]);

  const dropoffLocation = useMemo<AddressedLocation | null>(() => {
    const latitude = parseNumber(params.dropoffLatitude);
    const longitude = parseNumber(params.dropoffLongitude);
    if (latitude === null || longitude === null) return null;
    return {
      latitude,
      longitude,
      address: typeof params.dropoffAddress === 'string' ? params.dropoffAddress : null,
    };
  }, [params.dropoffAddress, params.dropoffLatitude, params.dropoffLongitude]);

  const isRouteValid =
    isValidTripId(tripId) &&
    Boolean(pickupLocation && isValidGeoLocation(pickupLocation)) &&
    Boolean(dropoffLocation && isValidGeoLocation(dropoffLocation));

  useEffect(() => {
    if (!isRouteValid || !pickupLocation || !dropoffLocation) {
      setTimeout(
        () =>
          setErrorMessage('Invalid tracking parameters. Please reopen tracking from request status.'),
        0,
      );
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setTimeout(() => setErrorMessage('Missing auth token. Please login again.'), 0);
      return;
    }

    try {
      connectSocket(token);
      joinTripRoom(tripId);
    } catch (error) {
      setTimeout(
        () =>
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to connect realtime socket.',
          ),
        0,
      );
      return;
    }

    const openDeliveryTracking = () => {
      router.replace(
        (
          '/customer-delivery-tracking?tripId=' +
          encodeURIComponent(tripId) +
          '&pickupLatitude=' +
          encodeURIComponent(String(pickupLocation.latitude)) +
          '&pickupLongitude=' +
          encodeURIComponent(String(pickupLocation.longitude)) +
          '&pickupAddress=' +
          encodeURIComponent(pickupLocation.address ?? '') +
          '&dropoffLatitude=' +
          encodeURIComponent(String(dropoffLocation.latitude)) +
          '&dropoffLongitude=' +
          encodeURIComponent(String(dropoffLocation.longitude)) +
          '&dropoffAddress=' +
          encodeURIComponent(dropoffLocation.address ?? '')
        ) as Href,
      );
    };

    const unsubDriverLocation = onDriverLocationUpdated((payload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated || validated.tripId !== tripId) return;
      setDriverLocation({ latitude: validated.latitude, longitude: validated.longitude });
    });

    const unsubItemPickedUp = onItemPickedUp((payload) => {
      const validated = validateItemPickedUpPayload(payload);
      if (!validated || validated.tripId !== tripId) return;

      setPickupInfo(validated);
      setIsWaiting(false);
      openDeliveryTracking();
    });

    const unsubTripStatus = onTripStatusUpdated((payload) => {
      const validated = validateTripStatusUpdatedPayload(payload);
      if (!validated || validated.tripId !== tripId) return;

      if (validated.status === 'ITEM_PICKED_UP') {
        openDeliveryTracking();
      }
    });

    const unsubDisconnect = onSocketDisconnect(() => {
      setErrorMessage('Socket disconnected. Waiting to reconnect...');
    });

    const unsubSocketError = onSocketError((message) => {
      setErrorMessage(message || 'Socket connection error.');
    });

    const unsubAdditionalCharge = onAdditionalChargeAdded((payload) => {
      if (payload.requestId !== tripId) return;
      setLatestAdditionalCharge(payload);
    });

    return () => {
      unsubDriverLocation();
      unsubItemPickedUp();
      unsubTripStatus();
      unsubDisconnect();
      unsubSocketError();
      unsubAdditionalCharge();
      leaveTripRoom(tripId);
    };
  }, [dropoffLocation, isRouteValid, pickupLocation, router, tripId]);

  if (!isRouteValid || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.fallbackScreen}>
        <TrackingScreenCard>
          <Text style={styles.fallbackTitle}>Tracking unavailable</Text>
          <Text style={styles.fallbackText}>Invalid waiting-for-pickup route parameters.</Text>
        </TrackingScreenCard>
      </SafeAreaView>
    );
  }

  if (!isNativeMapRuntimeAvailable || !NativeMapView || !NativeMarker) {
    return (
      <SafeAreaView style={styles.fallbackScreen}>
        <TrackingScreenCard>
          <Text style={styles.fallbackTitle}>Tracking unavailable</Text>
          <Text style={styles.fallbackText}>
            Pickup tracking map is available on iOS and Android only.
          </Text>
        </TrackingScreenCard>
      </SafeAreaView>
    );
  }

  const renderMap = (heightStyle?: object) => (
    <NativeMapView
      style={[styles.map, heightStyle]}
      initialRegion={{
        latitude: pickupLocation.latitude,
        longitude: pickupLocation.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }}
    >
      <NativeMarker coordinate={pickupLocation} title="Pickup" />
      <NativeMarker coordinate={dropoffLocation} title="Dropoff" pinColor="#FF5E57" />
      {driverLocation ? (
        <NativeMarker coordinate={driverLocation} title="Driver" anchor={{ x: 0.5, y: 0.5 }}>
          <Text style={styles.driverMarkerIcon}>🚗</Text>
        </NativeMarker>
      ) : null}
    </NativeMapView>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TrackingScrollable>
        <TrackingHero
          eyebrow={`Order #${tripId || 'N/A'}`}
          title="Waiting at pickup"
          description="The driver has arrived. This screen stays active until the pickup is confirmed."
        />

        <TrackingProgress currentStage={2} />

        <TrackingMapShell
          title="Pickup map"
          subtitle="Current driver, pickup, and destination markers."
          onExpand={() => setIsMapExpanded(true)}
        >
          {renderMap()}
        </TrackingMapShell>

        <TrackingScreenCard>
          <TrackingInfoPill label={isWaiting ? 'Waiting for confirmation' : 'Pickup confirmed'} tone="accent" />
          <Text style={styles.cardTitle}>Pickup stage</Text>
          <Text style={styles.cardBody}>
            The driver confirms item pickup from their app. Once that happens, this flow moves to
            the delivery tracking screen.
          </Text>
          <TrackingMetaRow
            label="Pickup address"
            value={pickupLocation.address || `${pickupLocation.latitude}, ${pickupLocation.longitude}`}
          />
          <TrackingMetaRow
            label="Dropoff address"
            value={
              dropoffLocation.address || `${dropoffLocation.latitude}, ${dropoffLocation.longitude}`
            }
          />
          {latestAdditionalCharge ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Additional charge added</Text>
              <Text style={styles.noticeText}>
                {latestAdditionalCharge.amount.toFixed(2)} {latestAdditionalCharge.currency} for{' '}
                {latestAdditionalCharge.reason}
              </Text>
            </View>
          ) : null}
          {isWaiting ? (
            <View style={styles.inlineRow}>
              <ActivityIndicator size="small" color={clientTheme.accentStrong} />
              <Text style={styles.helperText}>Listening for pickup confirmation...</Text>
            </View>
          ) : null}
          {pickupInfo ? (
            <View style={styles.confirmedCard}>
              <Text style={styles.confirmedTitle}>Pickup confirmed</Text>
              <Text style={styles.helperText}>
                Picked up at {new Date(pickupInfo.pickedUpAt).toLocaleString(undefined, { hour12: false })}
              </Text>
              {pickupInfo.pickupNotes ? (
                <Text style={styles.helperText}>Notes: {pickupInfo.pickupNotes}</Text>
              ) : null}
              <Text style={styles.helperText}>
                Proof photos received: {pickupInfo.pickupProofPhotos.length}
              </Text>
            </View>
          ) : null}
          <ChatEntryButton transportRequestId={tripId} />
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              router.replace(
                (
                  '/customer-delivery-tracking?tripId=' +
                  encodeURIComponent(tripId) +
                  '&pickupLatitude=' +
                  encodeURIComponent(String(pickupLocation.latitude)) +
                  '&pickupLongitude=' +
                  encodeURIComponent(String(pickupLocation.longitude)) +
                  '&pickupAddress=' +
                  encodeURIComponent(pickupLocation.address ?? '') +
                  '&dropoffLatitude=' +
                  encodeURIComponent(String(dropoffLocation.latitude)) +
                  '&dropoffLongitude=' +
                  encodeURIComponent(String(dropoffLocation.longitude)) +
                  '&dropoffAddress=' +
                  encodeURIComponent(dropoffLocation.address ?? '')
                ) as Href,
              )
            }
          >
            <Text style={styles.secondaryButtonText}>Open delivery tracking</Text>
          </Pressable>
        </TrackingScreenCard>
      </TrackingScrollable>

      <TrackingMapModal
        visible={isMapExpanded}
        title="Pickup map"
        onClose={() => setIsMapExpanded(false)}
      >
        {renderMap(styles.expandedMap)}
      </TrackingMapModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clientTheme.background,
  },
  fallbackScreen: {
    flex: 1,
    backgroundColor: clientTheme.background,
    justifyContent: 'center',
    padding: 20,
  },
  fallbackTitle: {
    color: clientTheme.text,
    fontSize: 20,
    fontWeight: '800',
  },
  fallbackText: {
    color: clientTheme.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  map: {
    flex: 1,
  },
  driverMarkerIcon: {
    fontSize: 28,
  },
  expandedMap: {
    width: '100%',
    height: '100%',
  },
  cardTitle: {
    color: clientTheme.text,
    fontSize: 22,
    fontWeight: '800',
  },
  cardBody: {
    color: clientTheme.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  helperText: {
    color: clientTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  noticeCard: {
    borderRadius: 18,
    backgroundColor: clientTheme.accentSoft,
    padding: 14,
    gap: 6,
  },
  noticeTitle: {
    color: clientTheme.text,
    fontSize: 14,
    fontWeight: '800',
  },
  noticeText: {
    color: clientTheme.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  confirmedCard: {
    borderRadius: 18,
    backgroundColor: '#F6F7FB',
    padding: 14,
    gap: 6,
  },
  confirmedTitle: {
    color: clientTheme.text,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    lineHeight: 20,
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: clientTheme.surfaceMuted,
    borderWidth: 1,
    borderColor: clientTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: clientTheme.text,
    fontSize: 15,
    fontWeight: '800',
  },
});
