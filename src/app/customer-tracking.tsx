import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

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
  calculateDistanceMeters,
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
  const mapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    (Platform.OS === 'ios'
      ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY?.trim()
      : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY?.trim()) ||
    '';
  const [driverLocation, setDriverLocation] = useState<GeoLocation | null>(null);
  const [statusText, setStatusText] = useState<string>('Driver is going to pickup location');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [routeError, setRouteError] = useState<string>('');
  const [routeStage, setRouteStage] = useState<'pickup' | 'dropoff'>('pickup');

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
      setRouteError('');
      setDriverLocation(next);
    });

    const unsubArrived = onDriverArrivedPickupConfirmed((payload) => {
      const validated = validateDriverArrivedPickupConfirmedPayload(payload);
      if (!validated || validated.tripId !== validTripId) return;
      setStatusText('Driver arrived at pickup location');
      setRouteStage('dropoff');
    });

    const unsubStatus = onTripStatusUpdated((payload) => {
      if (!payload || payload.tripId !== validTripId) return;
      const status = payload.status as TripStatus;
      if (status === 'DRIVER_ARRIVED_PICKUP') {
        setStatusText('Driver arrived at pickup location');
        setRouteStage('dropoff');
      } else if (status === 'DRIVER_GOING_TO_PICKUP') {
        setStatusText('Driver is going to pickup location');
        setRouteStage('pickup');
      } else if (
        status === 'ITEM_PICKED_UP' ||
        status === 'DRIVER_GOING_TO_DROPOFF' ||
        status === 'DELIVERED' ||
        status === 'COMPLETED'
      ) {
        setRouteStage('dropoff');
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
          Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY or platform key
          (EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY / EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY).
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
        <Marker coordinate={pickupLocation} title="Pickup" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.pickupMarker}>
            <Text style={styles.pickupMarkerText}>P</Text>
          </View>
        </Marker>
        <Marker coordinate={dropoffLocation} title="Destination" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.destinationXMarker}>
            <Text style={styles.destinationXText}>X</Text>
          </View>
        </Marker>
        {driverLocation ? (
          <>
            <Marker coordinate={driverLocation} title="Driver" anchor={{ x: 0.5, y: 0.5 }}>
              <Text style={styles.driverMarkerIcon}>🚗</Text>
            </Marker>
            <MapViewDirections
              origin={driverLocation}
              destination={routeStage === 'pickup' ? pickupLocation : dropoffLocation}
              apikey={mapsApiKey}
              mode="DRIVING"
              strokeWidth={4}
              strokeColor="#0EA5E9"
              onError={(message) => {
                setRouteError(`Route error: ${message}`);
              }}
            />
          </>
        ) : null}
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
        {driverLocation ? (
          <Text style={styles.helperText}>
            Driver: {driverLocation.latitude.toFixed(6)}, {driverLocation.longitude.toFixed(6)} | Target:{' '}
            {(routeStage === 'pickup' ? pickupLocation.latitude : dropoffLocation.latitude).toFixed(6)},{' '}
            {(routeStage === 'pickup' ? pickupLocation.longitude : dropoffLocation.longitude).toFixed(6)} |
            Distance:{' '}
            {(
              calculateDistanceMeters(
                driverLocation,
                routeStage === 'pickup' ? pickupLocation : dropoffLocation,
              ) / 1000
            ).toFixed(2)}{' '}
            km
          </Text>
        ) : null}
        {routeError ? <Text style={styles.errorText}>{routeError}</Text> : null}
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
  pickupMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#16A34A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pickupMarkerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
  },
  driverMarkerIcon: {
    fontSize: 20,
    lineHeight: 22,
  },
  destinationXMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DC2626',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  destinationXText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 16,
  },
});
