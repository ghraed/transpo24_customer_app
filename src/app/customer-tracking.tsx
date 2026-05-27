import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAccessToken } from '@/lib/auth-token';
import {
  connectSocket,
  joinTripRoom,
  leaveTripRoom,
  onDriverArrivedPickupConfirmed,
  onDriverLocationUpdated,
  onSocketDisconnect,
  onSocketError,
  onTripStatusUpdated,
} from '@/services/socketService';
import type { AddressedLocation, DriverLocationUpdatedPayload, GeoLocation, TripStatus } from '@/types/trip.types';
import {
  isValidGeoLocation,
  validateDriverArrivedPickupConfirmedPayload,
  validateDriverLocationUpdatedPayload,
  validateTripId,
} from '@/utils/locationValidation';

function parseNumber(value: string | string[] | undefined): number | null {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function CustomerTrackingScreen() {
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
  const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
  const [driverLocation, setDriverLocation] = useState<GeoLocation | null>(null);
  const [statusText, setStatusText] = useState<string>('Driver is going to pickup location');
  const [errorMessage, setErrorMessage] = useState<string>('');

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
      setErrorMessage('Invalid trip id.');
      return;
    }

    if (!pickupLocation || !dropoffLocation) {
      setErrorMessage('Invalid trip locations.');
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setErrorMessage('Missing auth token. Please login again.');
      return;
    }

    try {
      connectSocket(token);
      joinTripRoom(validTripId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to connect realtime socket.');
      return;
    }

    const unsubLocation = onDriverLocationUpdated((payload: DriverLocationUpdatedPayload) => {
      const validated = validateDriverLocationUpdatedPayload(payload);
      if (!validated || validated.tripId !== validTripId) return;
      const next = { latitude: validated.latitude, longitude: validated.longitude };
      if (!isValidGeoLocation(next)) return;
      setDriverLocation(next);
    });

    const unsubArrived = onDriverArrivedPickupConfirmed((payload) => {
      const validated = validateDriverArrivedPickupConfirmedPayload(payload);
      if (!validated || validated.tripId !== validTripId) return;
      setStatusText('Driver arrived at pickup location');
    });

    const unsubStatus = onTripStatusUpdated((payload) => {
      if (!payload || payload.tripId !== validTripId) return;
      const status = payload.status as TripStatus;
      if (status === 'DRIVER_ARRIVED_PICKUP') {
        setStatusText('Driver arrived at pickup location');
      } else if (status === 'DRIVER_GOING_TO_PICKUP') {
        setStatusText('Driver is going to pickup location');
      }
    });

    const unsubDisconnect = onSocketDisconnect(() => {
      setErrorMessage('Socket disconnected. Waiting to reconnect...');
    });

    const unsubSocketError = onSocketError((message) => {
      setErrorMessage(message || 'Socket error.');
    });

    return () => {
      unsubLocation();
      unsubArrived();
      unsubStatus();
      unsubDisconnect();
      unsubSocketError();
      leaveTripRoom(validTripId);
    };
  }, [dropoffLocation, pickupLocation, tripId]);

  if (!mapsApiKey) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>
          EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Add it to run customer map tracking.
        </Text>
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
      <SafeAreaView style={styles.centeredContainer}>
        <Text style={styles.errorText}>Invalid tracking parameters.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={{
          latitude: pickupLocation.latitude,
          longitude: pickupLocation.longitude,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
      >
        <Marker coordinate={pickupLocation} title="Pickup" pinColor="#16A34A" />
        <Marker coordinate={dropoffLocation} title="Dropoff" pinColor="#7C3AED" />
        {driverLocation ? <Marker coordinate={driverLocation} title="Driver" pinColor="#2563EB" /> : null}
      </MapView>

      <View style={styles.bottomCard}>
        <Text style={styles.title}>Trip Tracking</Text>
        <Text style={styles.statusText}>{statusText}</Text>
        {!driverLocation ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.helperText}>Waiting for driver location updates...</Text>
          </View>
        ) : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  map: {
    flex: 1,
  },
  bottomCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  statusText: {
    color: '#1E293B',
    fontWeight: '600',
  },
  helperText: {
    color: '#475569',
  },
  errorText: {
    color: '#B91C1C',
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
});
