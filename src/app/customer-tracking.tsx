import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isNativeMapRuntimeAvailable,
  NativeMapView,
  NativeMapViewDirections,
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
  onDriverArrivedPickupConfirmed,
  onDriverLocationUpdated,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
} from '@/services/socketService';
import type { AdditionalCharge } from '@/types/customer-request';
import type {
  AddressedLocation,
  DriverLocationUpdatedPayload,
  GeoLocation,
  TripStatus,
} from '@/types/trip.types';
import {
  calculateDistanceMeters,
  isValidGeoLocation,
  validateDriverArrivedPickupConfirmedPayload,
  validateDriverLocationUpdatedPayload,
  validateTripId,
  validateTripStatusUpdatedPayload,
} from '@/utils/locationValidation';

function parseNumber(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDeliveredRoute(tripId: string, deliveredAt: string): Href {
  return {
    pathname: '/customer-trip-delivered',
    params: {
      tripId,
      deliveredAt,
    },
  };
}

export default function CustomerTrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tripId?: string;
    pickupLatitude?: string;
    pickupLongitude?: string;
    pickupAddress?: string;
    dropoffLatitude?: string;
    dropoffLongitude?: string;
    dropoffAddress?: string;
  }>();

  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const mapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    (Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?.trim()
      : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim()) ||
    '';
  const [driverLocation, setDriverLocation] = useState<GeoLocation | null>(null);
  const [statusText, setStatusText] = useState('Driver is going to pickup location');
  const [errorMessage, setErrorMessage] = useState('');
  const [routeError, setRouteError] = useState('');
  const [routeStage, setRouteStage] = useState<'pickup' | 'dropoff'>('pickup');
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

  useEffect(() => {
    const validTripId = validateTripId(tripId);
    if (!validTripId) {
      setTimeout(() => setErrorMessage('Invalid trip id.'), 0);
      return;
    }

    if (!pickupLocation || !dropoffLocation) {
      setTimeout(() => setErrorMessage('Invalid trip locations.'), 0);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setTimeout(() => setErrorMessage('Missing auth token. Please login again.'), 0);
      return;
    }

    try {
      connectSocket(token);
      joinTripRoom(validTripId);
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

    const unsubLocation = onDriverLocationUpdated((payload: DriverLocationUpdatedPayload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated || validated.tripId !== validTripId) return;
      const next = { latitude: validated.latitude, longitude: validated.longitude };
      if (!isValidGeoLocation(next)) return;
      setRouteError('');
      setDriverLocation(next);
    });

    const goToWaitingForPickup = () => {
      router.replace(
        (
          '/waiting-for-pickup?tripId=' +
          encodeURIComponent(validTripId) +
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

    const unsubArrived = onDriverArrivedPickupConfirmed((payload) => {
      const validated = validateDriverArrivedPickupConfirmedPayload(payload);
      if (!validated || validated.tripId !== validTripId) return;
      setStatusText('Driver arrived at pickup location');
      goToWaitingForPickup();
    });

    const unsubStatus = onTripStatusUpdated((payload) => {
      const validatedStatusPayload = validateTripStatusUpdatedPayload(payload);
      if (!validatedStatusPayload || validatedStatusPayload.tripId !== validTripId) return;
      const status = validatedStatusPayload.status as TripStatus;
      if (status === 'DRIVER_ARRIVED_PICKUP') {
        setStatusText('Driver arrived at pickup location');
        goToWaitingForPickup();
      } else if (status === 'DRIVER_GOING_TO_PICKUP') {
        setStatusText('Driver is going to pickup location');
        setRouteStage('pickup');
      } else if (status === 'ITEM_PICKED_UP' || status === 'DRIVER_GOING_TO_DROPOFF') {
        setRouteStage('dropoff');
      } else if (status === 'DELIVERED' || status === 'COMPLETED') {
        router.replace(buildDeliveredRoute(validTripId, validatedStatusPayload.updatedAt));
      }
    });

    const unsubDisconnect = onSocketDisconnect(() => {
      setErrorMessage('Socket disconnected. Waiting to reconnect...');
    });

    const unsubSocketError = onSocketError((message) => {
      setErrorMessage(message || 'Socket error.');
    });

    const unsubAdditionalCharge = onAdditionalChargeAdded((payload) => {
      if (payload.requestId !== validTripId) return;
      setLatestAdditionalCharge(payload);
    });

    return () => {
      unsubLocation();
      unsubArrived();
      unsubStatus();
      unsubDisconnect();
      unsubSocketError();
      unsubAdditionalCharge();
      leaveTripRoom(validTripId);
    };
  }, [dropoffLocation, pickupLocation, router, tripId]);

  if (!mapsApiKey) {
    return (
      <SafeAreaView style={styles.fallbackScreen}>
        <TrackingScreenCard>
          <Text style={styles.fallbackTitle}>Map configuration missing</Text>
          <Text style={styles.fallbackText}>
            Set the Google Maps API key to display live tracking.
          </Text>
        </TrackingScreenCard>
      </SafeAreaView>
    );
  }

  if (
    !pickupLocation ||
    !dropoffLocation ||
    !isValidGeoLocation(pickupLocation) ||
    !isValidGeoLocation(dropoffLocation)
  ) {
    return (
      <SafeAreaView style={styles.fallbackScreen}>
        <TrackingScreenCard>
          <Text style={styles.fallbackTitle}>Tracking unavailable</Text>
          <Text style={styles.fallbackText}>Invalid tracking parameters.</Text>
        </TrackingScreenCard>
      </SafeAreaView>
    );
  }

  if (
    !isNativeMapRuntimeAvailable ||
    !NativeMapView ||
    !NativeMarker ||
    !NativeMapViewDirections
  ) {
    return (
      <SafeAreaView style={styles.fallbackScreen}>
        <TrackingScreenCard>
          <Text style={styles.fallbackTitle}>Tracking unavailable</Text>
          <Text style={styles.fallbackText}>
            Trip tracking map is available on iOS and Android only.
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
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }}
    >
      <NativeMarker coordinate={pickupLocation} title="Pickup" />
      <NativeMarker coordinate={dropoffLocation} title="Destination" anchor={{ x: 0.5, y: 0.5 }}>
        <View style={styles.destinationXMarker}>
          <Text style={styles.destinationXText}>X</Text>
        </View>
      </NativeMarker>
      {driverLocation ? (
        <>
          <NativeMarker coordinate={driverLocation} title="Driver" anchor={{ x: 0.5, y: 0.5 }}>
            <Text style={styles.driverMarkerIcon}>🚗</Text>
          </NativeMarker>
          <NativeMapViewDirections
            origin={driverLocation}
            destination={routeStage === 'pickup' ? pickupLocation : dropoffLocation}
            apikey={mapsApiKey}
            mode="DRIVING"
            strokeWidth={4}
            strokeColor="#FFC548"
            onError={(message: string) => {
              setRouteError(`Route error: ${message}`);
            }}
          />
        </>
      ) : null}
    </NativeMapView>
  );

  const activeTarget = routeStage === 'pickup' ? pickupLocation : dropoffLocation;
  const distanceText = driverLocation
    ? `${(calculateDistanceMeters(driverLocation, activeTarget) / 1000).toFixed(2)} km`
    : 'Waiting for driver location';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TrackingScrollable>
        <TrackingHero
          eyebrow={`Order #${tripId || 'N/A'}`}
          title="Driver on the way"
          description="Live location updates appear here as the driver heads to the pickup point."
        />

        <TrackingProgress currentStage={2} />

        <TrackingMapShell
          title="Live map"
          subtitle="Tracking the driver route to your pickup address."
          onExpand={() => setIsMapExpanded(true)}
        >
          {renderMap()}
        </TrackingMapShell>

        <TrackingScreenCard>
          <TrackingInfoPill
            label={driverLocation ? 'Live tracking active' : 'Waiting for updates'}
            tone={driverLocation ? 'success' : 'accent'}
          />
          <Text style={styles.cardTitle}>{statusText}</Text>
          <Text style={styles.cardBody}>
            The app will move automatically to the next step once the driver arrives at pickup.
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
          <TrackingMetaRow label="Current distance" value={distanceText} />
          {!driverLocation ? (
            <View style={styles.inlineRow}>
              <ActivityIndicator size="small" color={clientTheme.accentStrong} />
              <Text style={styles.helperText}>Waiting for driver location updates...</Text>
            </View>
          ) : null}
          {latestAdditionalCharge ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Additional charge added</Text>
              <Text style={styles.noticeText}>
                {latestAdditionalCharge.amount.toFixed(2)} {latestAdditionalCharge.currency} for{' '}
                {latestAdditionalCharge.reason}
              </Text>
            </View>
          ) : null}
          {routeError ? <Text style={styles.errorText}>{routeError}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </TrackingScreenCard>
      </TrackingScrollable>

      <TrackingMapModal
        visible={isMapExpanded}
        title="Driver tracking map"
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
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    lineHeight: 20,
  },
  driverMarkerIcon: {
    fontSize: 28,
  },
  destinationXMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destinationXText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
});
