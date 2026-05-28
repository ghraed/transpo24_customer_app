import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAccessToken } from '@/lib/auth-token';
import {
  connectSocket,
  joinTripRoom,
  leaveTripRoom,
  onDriverLocationUpdated,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
} from '@/services/socketService';
import type { AddressedLocation, GeoLocation } from '@/types/trip.types';
import {
  calculateDistanceMeters,
  isValidGeoLocation,
  isValidTripId,
  validateDriverLocationUpdatedPayload,
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

export default function CustomerDeliveryTrackingScreen() {
  const params = useLocalSearchParams<RouteParams>();

  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';
  const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';

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
  const [statusText, setStatusText] = useState<string>('Driver is heading to dropoff location');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const isRouteValid =
    isValidTripId(tripId) &&
    Boolean(pickupLocation && isValidGeoLocation(pickupLocation)) &&
    Boolean(dropoffLocation && isValidGeoLocation(dropoffLocation));

  useEffect(() => {
    if (!isRouteValid) {
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

    const unsubLocation = onDriverLocationUpdated((payload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated || validated.tripId !== tripId) return;
      setDriverLocation({ latitude: validated.latitude, longitude: validated.longitude });
    });

    const unsubStatus = onTripStatusUpdated((payload) => {
      const validated = validateTripStatusUpdatedPayload(payload);
      if (!validated || validated.tripId !== tripId) return;

      if (validated.status === 'DELIVERED') {
        setStatusText('Item delivered');
      } else if (validated.status === 'COMPLETED') {
        setStatusText('Trip completed');
      } else if (validated.status === 'DRIVER_GOING_TO_DROPOFF') {
        setStatusText('Driver is heading to dropoff location');
      }
    });

    const unsubDisconnect = onSocketDisconnect(() => {
      setErrorMessage('Socket disconnected. Waiting to reconnect...');
    });

    const unsubSocketError = onSocketError((message) => {
      setErrorMessage(message || 'Socket connection error.');
    });

    return () => {
      unsubLocation();
      unsubStatus();
      unsubDisconnect();
      unsubSocketError();
      leaveTripRoom(tripId);
    };
  }, [isRouteValid, tripId]);

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
            {mapsApiKey ? (
              <MapViewDirections
                origin={driverLocation}
                destination={dropoffLocation}
                apikey={mapsApiKey}
                mode="DRIVING"
                strokeWidth={4}
                strokeColor="#0EA5E9"
              />
            ) : null}
          </>
        ) : null}
      </MapView>

      <View style={styles.bottomCard}>
        <Text style={styles.title}>Delivery Tracking</Text>
        <Text style={styles.statusText}>{statusText}</Text>
        {!driverLocation ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.helperText}>Waiting for live driver location...</Text>
          </View>
        ) : (
          <Text style={styles.helperText}>
            Distance to dropoff:{' '}
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
