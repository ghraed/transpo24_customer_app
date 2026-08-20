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
  onDriverNearDelivery,
  onDriverLocationUpdated,
  onDriverStartedDelivery,
  onItemDelivered,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
} from '@/services/socketService';
import type { AdditionalCharge } from '@/types/customer-request';
import type { AddressedLocation, GeoLocation } from '@/types/trip.types';
import {
  isValidGeoLocation,
  isValidTripId,
  validateDriverNearDeliveryPayload,
  validateDriverLocationUpdatedPayload,
  validateDriverStartedDeliveryPayload,
  validateItemDeliveredPayload,
  validateTripStatusUpdatedPayload,
} from '@/utils/deliveryValidation';
import { calculateDistanceMeters } from '@/utils/pickupValidation';
import appI18n from '@/localization/i18n';

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

function buildDeliveredRoute(
  tripId: string,
  deliveredAt: string,
  deliveryNotes?: string | null,
  deliveryProofImageUrl?: string | null,
): Href {
  return {
    pathname: '/customer-trip-delivered',
    params: {
      tripId,
      deliveredAt,
      deliveryNotes: deliveryNotes ?? '',
      deliveryProofImageUrl: deliveryProofImageUrl ?? '',
    },
  };
}

export default function CustomerDeliveryTrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';
  const mapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    (Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?.trim()
      : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim()) ||
    '';

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

  const [driverLocation, setDriverLocation] = useState<GeoLocation | null>(null);
  const [statusText, setStatusText] = useState('Driver is going to dropoff location');
  const [errorMessage, setErrorMessage] = useState('');
  const [nearDeliveryBanner, setNearDeliveryBanner] = useState('');
  const [latestAdditionalCharge, setLatestAdditionalCharge] = useState<AdditionalCharge | null>(
    null,
  );
  const [routeError, setRouteError] = useState('');
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  const isRouteValid =
    isValidTripId(tripId) &&
    Boolean(pickupLocation && isValidGeoLocation(pickupLocation)) &&
    Boolean(dropoffLocation && isValidGeoLocation(dropoffLocation));

  useEffect(() => {
    if (!isRouteValid || !pickupLocation || !dropoffLocation) {
      setTimeout(() => setErrorMessage(appI18n.t("Invalid delivery tracking parameters.")), 0);
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setTimeout(() => setErrorMessage(appI18n.t("Missing auth token. Please login again.")), 0);
      return;
    }

    try {
      connectSocket(token);
      joinTripRoom(tripId);
    } catch (error) {
      setTimeout(
        () =>
          setErrorMessage(
            error instanceof Error ? error.message : appI18n.t("Failed to connect realtime socket."),
          ),
        0,
      );
      return;
    }

    const unsubStarted = onDriverStartedDelivery((payload) => {
      const validated = validateDriverStartedDeliveryPayload(payload);
      if (!validated || validated.tripId !== tripId) return;
      setStatusText('Driver is going to dropoff location');
    });

    const unsubLocation = onDriverLocationUpdated((payload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated || validated.tripId !== tripId) return;
      setDriverLocation({ latitude: validated.latitude, longitude: validated.longitude });
      setStatusText('Your item is on the way');
      setRouteError('');
    });

    const unsubDelivered = onItemDelivered((payload) => {
      const validated = validateItemDeliveredPayload(payload);
      if (!validated || validated.tripId !== tripId) return;
      setStatusText('Item delivered');
      if (validated.ratingAvailable) {
        router.replace((`/customer-rate-driver?tripId=${encodeURIComponent(tripId)}`) as Href);
        return;
      }
      router.replace(
        buildDeliveredRoute(
          tripId,
          validated.deliveredAt,
          validated.deliveryNotes,
          validated.deliveryProofPhotos[0]?.url ?? validated.deliveryProofImageUrl,
        ),
      );
    });

    const unsubNearDelivery = onDriverNearDelivery((payload) => {
      const validated = validateDriverNearDeliveryPayload(payload);
      if (!validated || validated.tripId !== tripId) return;
      setNearDeliveryBanner('Your driver is close to the delivery location. Delivery is approaching.');
      setStatusText('Driver is near the delivery location');
    });

    const unsubStatus = onTripStatusUpdated((payload) => {
      const validated = validateTripStatusUpdatedPayload(payload);
      if (!validated || validated.tripId !== tripId) return;

      if (validated.status === 'DRIVER_GOING_TO_DROPOFF') {
        setStatusText('Driver is going to dropoff location');
      } else if (validated.status === 'DELIVERED' || validated.status === 'COMPLETED') {
        setStatusText('Item delivered');
        router.replace(buildDeliveredRoute(tripId, validated.updatedAt));
      }
    });

    const unsubDisconnect = onSocketDisconnect(() => {
      setErrorMessage(appI18n.t("Socket disconnected. Waiting to reconnect..."));
    });

    const unsubSocketError = onSocketError((message) => {
      setErrorMessage(message || appI18n.t("Socket connection error."));
    });

    const unsubAdditionalCharge = onAdditionalChargeAdded((payload) => {
      if (payload.requestId !== tripId) return;
      setLatestAdditionalCharge(payload);
    });

    return () => {
      unsubStarted();
      unsubLocation();
      unsubDelivered();
      unsubNearDelivery();
      unsubStatus();
      unsubDisconnect();
      unsubSocketError();
      unsubAdditionalCharge();
      leaveTripRoom(tripId);
    };
  }, [dropoffLocation, isRouteValid, pickupLocation, router, tripId]);

  if (!mapsApiKey) {
    return (
      <SafeAreaView style={styles.fallbackScreen}>
        <TrackingScreenCard>
          <Text style={styles.fallbackTitle}>{appI18n.t("Map configuration missing")}</Text>
          <Text style={styles.fallbackText}>
            {appI18n.t("Set the Google Maps API key to display delivery tracking.")}</Text>
        </TrackingScreenCard>
      </SafeAreaView>
    );
  }

  if (!isRouteValid || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.fallbackScreen}>
        <TrackingScreenCard>
          <Text style={styles.fallbackTitle}>{appI18n.t("Tracking unavailable")}</Text>
          <Text style={styles.fallbackText}>{appI18n.t("Invalid delivery tracking route parameters.")}</Text>
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
          <Text style={styles.fallbackTitle}>{appI18n.t("Tracking unavailable")}</Text>
          <Text style={styles.fallbackText}>
            {appI18n.t("Delivery tracking map is available on iOS and Android only.")}</Text>
        </TrackingScreenCard>
      </SafeAreaView>
    );
  }

  const renderMap = (heightStyle?: object) => (
    <NativeMapView
      style={[styles.map, heightStyle]}
      initialRegion={{
        latitude: dropoffLocation.latitude,
        longitude: dropoffLocation.longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      }}
    >
      <NativeMarker coordinate={pickupLocation} title={appI18n.t("Pickup")} />
      <NativeMarker coordinate={dropoffLocation} title={appI18n.t("Dropoff")} anchor={{ x: 0.5, y: 0.5 }}>
        <View style={styles.destinationXMarker}>
          <Text style={styles.destinationXText}>X</Text>
        </View>
      </NativeMarker>
      {driverLocation ? (
        <>
          <NativeMarker coordinate={driverLocation} title={appI18n.t("Driver")} anchor={{ x: 0.5, y: 0.5 }}>
            <Text style={styles.driverMarkerIcon}>🚗</Text>
          </NativeMarker>
          <NativeMapViewDirections
            origin={driverLocation}
            destination={dropoffLocation}
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

  const distanceText = driverLocation
    ? `${(calculateDistanceMeters(driverLocation, dropoffLocation) / 1000).toFixed(2)} km`
    : 'Waiting for driver location';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TrackingScrollable>
        <TrackingHero
          eyebrow={`Order #${tripId || 'N/A'}`}
          title={appI18n.t("Delivery in progress")}
          description="The delivery map updates live while the driver heads to the dropoff address."
        />

        <TrackingProgress currentStage={4} />

        <TrackingMapShell
          title={appI18n.t("Delivery map")}
          subtitle="Live route from driver location to your destination."
          onExpand={() => setIsMapExpanded(true)}
        >
          {renderMap()}
        </TrackingMapShell>

        <TrackingScreenCard>
          <TrackingInfoPill
            label={driverLocation ? appI18n.t('Live delivery active') : appI18n.t('Waiting for route updates')}
            tone={driverLocation ? 'success' : 'accent'}
          />
          <Text style={styles.cardTitle}>{statusText}</Text>
          <Text style={styles.cardBody}>
            {appI18n.t("You will be notified as the driver approaches the delivery location.")}</Text>
          {nearDeliveryBanner ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>{appI18n.t("Delivery approaching")}</Text>
              <Text style={styles.successText}>{nearDeliveryBanner}</Text>
            </View>
          ) : null}
          <TrackingMetaRow
            label={appI18n.t("Dropoff address")}
            value={
              dropoffLocation.address || `${dropoffLocation.latitude}, ${dropoffLocation.longitude}`
            }
          />
          <TrackingMetaRow label={appI18n.t("Distance to dropoff")} value={distanceText} />
          {!driverLocation ? (
            <View style={styles.inlineRow}>
              <ActivityIndicator size="small" color={clientTheme.accentStrong} />
              <Text style={styles.helperText}>{appI18n.t("Waiting for driver location...")}</Text>
            </View>
          ) : null}
          {latestAdditionalCharge ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>{appI18n.t("Additional charge added")}</Text>
              <Text style={styles.noticeText}>
                {appI18n.t('{{amount}} {{currency}} for {{reason}}', {
                  amount: latestAdditionalCharge.amount.toFixed(2),
                  currency: latestAdditionalCharge.currency,
                  reason: latestAdditionalCharge.reason,
                })}
              </Text>
            </View>
          ) : null}
          {routeError ? <Text style={styles.errorText}>{routeError}</Text> : null}
          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </TrackingScreenCard>
      </TrackingScrollable>

      <TrackingMapModal
        visible={isMapExpanded}
        title={appI18n.t("Delivery map")}
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
  successCard: {
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    padding: 14,
    gap: 6,
  },
  successTitle: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '800',
  },
  successText: {
    color: '#166534',
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
