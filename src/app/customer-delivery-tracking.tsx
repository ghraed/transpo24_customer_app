import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAccessToken } from '@/lib/auth-token';
import {
  connectSocket,
  joinTripRoom,
  leaveTripRoom,
  onDriverLocationUpdated,
  onDriverStartedDelivery,
  onItemDelivered,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
} from '@/services/socketService';
import type { AddressedLocation, GeoLocation } from '@/types/trip.types';
import {
  isValidGeoLocation,
  isValidTripId,
  validateDriverLocationUpdatedPayload,
  validateDriverStartedDeliveryPayload,
  validateItemDeliveredPayload,
  validateTripStatusUpdatedPayload,
} from '@/utils/deliveryValidation';
import { calculateDistanceMeters } from '@/utils/pickupValidation';

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
  const [statusText, setStatusText] = useState<string>('Driver is going to dropoff location');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const isRouteValid =
    isValidTripId(tripId) &&
    Boolean(pickupLocation && isValidGeoLocation(pickupLocation)) &&
    Boolean(dropoffLocation && isValidGeoLocation(dropoffLocation));

  useEffect(() => {
    if (!isRouteValid || !pickupLocation || !dropoffLocation) {
      setErrorMessage('Invalid delivery tracking parameters.');
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setErrorMessage('Missing auth token. Please login again.');
      return;
    }

    try {
      connectSocket(token);
      joinTripRoom(tripId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to connect realtime socket.');
      return;
    }

    const unsubStarted = onDriverStartedDelivery((payload) => {
      const validated = validateDriverStartedDeliveryPayload(payload);
      if (!validated) {
        console.warn('Ignoring invalid driverStartedDelivery payload', payload);
        return;
      }
      if (validated.tripId !== tripId) return;
      setStatusText('Driver is going to dropoff location');
    });

    const unsubLocation = onDriverLocationUpdated((payload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated) {
        console.warn('Ignoring invalid driverLocationUpdated payload', payload);
        return;
      }
      if (validated.tripId !== tripId) return;
      setDriverLocation({ latitude: validated.latitude, longitude: validated.longitude });
      setStatusText('Your item is on the way');
    });

    const unsubDelivered = onItemDelivered((payload) => {
      const validated = validateItemDeliveredPayload(payload);
      if (!validated) {
        console.warn('Ignoring invalid itemDelivered payload', payload);
        return;
      }
      if (validated.tripId !== tripId) return;
      setStatusText('Item delivered');
      router.replace(
        buildDeliveredRoute(
          tripId,
          validated.deliveredAt,
          validated.deliveryNotes,
          validated.deliveryProofImageUrl,
        ),
      );
    });

    const unsubStatus = onTripStatusUpdated((payload) => {
      const validated = validateTripStatusUpdatedPayload(payload);
      if (!validated) {
        console.warn('Ignoring invalid tripStatusUpdated payload', payload);
        return;
      }
      if (validated.tripId !== tripId) return;

      if (validated.status === 'DRIVER_GOING_TO_DROPOFF') {
        setStatusText('Driver is going to dropoff location');
      } else if (validated.status === 'DELIVERED' || validated.status === 'COMPLETED') {
        setStatusText('Item delivered');
        router.replace(buildDeliveredRoute(tripId, validated.updatedAt));
      }
    });

    const unsubDisconnect = onSocketDisconnect(() => {
      setErrorMessage('Socket disconnected. Waiting to reconnect...');
    });

    const unsubSocketError = onSocketError((message) => {
      setErrorMessage(message || 'Socket connection error.');
    });

    return () => {
      unsubStarted();
      unsubLocation();
      unsubDelivered();
      unsubStatus();
      unsubDisconnect();
      unsubSocketError();
      leaveTripRoom(tripId);
    };
  }, [dropoffLocation, isRouteValid, pickupLocation, router, tripId]);

  if (!mapsApiKey) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>
          Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY or platform key
          (EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY / EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY).
        </Text>
      </SafeAreaView>
    );
  }

  if (!isRouteValid || !pickupLocation || !dropoffLocation) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Invalid delivery tracking route params.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: dropoffLocation.latitude,
          longitude: dropoffLocation.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
      >
        <Marker coordinate={pickupLocation} title="Pickup" />
        <Marker coordinate={dropoffLocation} title="Dropoff" pinColor="#DC2626" />
        {driverLocation ? (
          <>
            <Marker coordinate={driverLocation} title="Driver" pinColor="#2563EB" />
            <MapViewDirections
              origin={driverLocation}
              destination={dropoffLocation}
              apikey={mapsApiKey}
              mode="DRIVING"
              strokeWidth={4}
              strokeColor="#0EA5E9"
            />
          </>
        ) : null}
      </MapView>

      <View style={styles.bottomCard}>
        <Text style={styles.title}>Delivery Tracking</Text>
        <Text style={styles.statusText}>{statusText}</Text>
        {!driverLocation ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.helperText}>Waiting for driver location...</Text>
          </View>
        ) : (
          <Text style={styles.helperText}>
            Driver distance to dropoff:{' '}
            {(calculateDistanceMeters(driverLocation, dropoffLocation) / 1000).toFixed(2)} km
          </Text>
        )}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  map: { flex: 1 },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  statusText: { color: '#1E293B', fontWeight: '600' },
  helperText: { color: '#475569' },
  errorText: { color: '#B91C1C' },
  centeredContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
