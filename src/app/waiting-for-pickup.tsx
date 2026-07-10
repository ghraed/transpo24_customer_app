import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  isNativeMapRuntimeAvailable,
  NativeMapView,
  NativeMarker,
} from '@/components/native-maps';
import { ChatEntryButton } from '@/components/chat-entry-button';
import { M3LoginColors } from '@/constants/theme';
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
import type { AddressedLocation, GeoLocation, ItemPickedUpPayload } from '@/types/trip.types';
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
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isWaiting, setIsWaiting] = useState<boolean>(true);
  const [latestAdditionalCharge, setLatestAdditionalCharge] = useState<AdditionalCharge | null>(null);

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

    const unsubDriverLocation = onDriverLocationUpdated((payload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated || validated.tripId !== tripId) return;
      setDriverLocation({ latitude: validated.latitude, longitude: validated.longitude });
    });

    const unsubItemPickedUp = onItemPickedUp((payload) => {
      const validated = validateItemPickedUpPayload(payload);
      if (!validated) {
        console.warn('Ignoring invalid itemPickedUp payload', payload);
        return;
      }

      if (validated.tripId !== tripId) {
        return;
      }

      setPickupInfo(validated);
      setIsWaiting(false);

      router.replace((
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
      ) as Href);
    });

    const unsubTripStatus = onTripStatusUpdated((payload) => {
      const validated = validateTripStatusUpdatedPayload(payload);
      if (!validated) {
        console.warn('Ignoring invalid tripStatusUpdated payload', payload);
        return;
      }

      if (validated.tripId !== tripId) {
        return;
      }

      if (validated.status === 'ITEM_PICKED_UP') {
        router.replace((
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
        ) as Href);
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
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Invalid waiting-for-pickup route params.</Text>
      </SafeAreaView>
    );
  }

  if (!isNativeMapRuntimeAvailable || !NativeMapView || !NativeMarker) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Pickup tracking map is available on iOS and Android only.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <NativeMapView
        style={styles.map}
        initialRegion={{
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
      >
        <NativeMarker coordinate={pickupLocation} title="Pickup" />
        <NativeMarker coordinate={dropoffLocation} title="Dropoff" pinColor="#DC2626" />
        {driverLocation ? <NativeMarker coordinate={driverLocation} title="Driver" pinColor="#2563EB" /> : null}
      </NativeMapView>

      <View style={styles.bottomCard}>
        <Text style={styles.title}>Pickup Stage</Text>
        <Text style={styles.statusText}>Driver arrived at pickup location</Text>
        {latestAdditionalCharge ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Additional Charge Added</Text>
            <Text style={styles.helperText}>
              {latestAdditionalCharge.amount.toFixed(2)} {latestAdditionalCharge.currency} • {latestAdditionalCharge.reason}
            </Text>
          </View>
        ) : null}
        <Text style={styles.helperText}>Waiting for driver to confirm item pickup</Text>
        {isWaiting ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.helperText}>Listening for pickup confirmation...</Text>
          </View>
        ) : null}

        {pickupInfo ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Pickup Confirmed</Text>
            <Text style={styles.helperText}>Picked up at: {new Date(pickupInfo.pickedUpAt).toLocaleString()}</Text>
            {pickupInfo.pickupNotes ? <Text style={styles.helperText}>Notes: {pickupInfo.pickupNotes}</Text> : null}
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
            router.replace((
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
            ) as Href)
          }
        >
          <Text style={styles.secondaryButtonText}>Open Delivery Tracking</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: M3LoginColors.background },
  map: { flex: 1 },
  bottomCard: {
    backgroundColor: M3LoginColors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: M3LoginColors.textPrimary },
  statusText: { color: M3LoginColors.textPrimary, fontWeight: '600' },
  helperText: { color: M3LoginColors.textSecondary },
  infoText: { color: M3LoginColors.primary, fontWeight: '600' },
  errorText: { color: M3LoginColors.error },
  centeredContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoCard: {
    backgroundColor: M3LoginColors.primaryContainer,
    borderColor: M3LoginColors.outline,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  infoTitle: { color: M3LoginColors.primary, fontWeight: '700' },
  secondaryButton: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  secondaryButtonText: { color: M3LoginColors.textPrimary, fontWeight: '600' },
});
