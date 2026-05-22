import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, type MapPressEvent, type Region } from 'react-native-maps';

import { createCustomerRequest, updatePickupLocation } from '@/lib/api';
import type { Coordinates } from '@/types/customer-request';

type PickupLocationRouteParams = {
  serviceId?: string;
  serviceKey?: string;
  requestId?: string;
  vehicleDetails?: string;
};

type SelectedPickupLocation = {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
};

const DEFAULT_REGION: Region = {
  latitude: 33.8938,
  longitude: 35.5018,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export default function PickupLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<PickupLocationRouteParams>();

  const serviceId = typeof params.serviceId === 'string' ? params.serviceId : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey : '';
  const vehicleDetails = typeof params.vehicleDetails === 'string' ? params.vehicleDetails : '';
  const initialRequestId = typeof params.requestId === 'string' ? params.requestId : undefined;

  const [requestId, setRequestId] = useState<string | undefined>(initialRequestId);
  const [selectedLocation, setSelectedLocation] = useState<SelectedPickupLocation | null>(null);
  const [addressQuery, setAddressQuery] = useState<string>('');
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(true);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const hasValidServiceId = serviceId.trim().length > 0;

  const onMapPress = useCallback((event: MapPressEvent) => {
    const coordinates: Coordinates = event.nativeEvent.coordinate;

    setSelectedLocation({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
    setErrorMessage('');
  }, []);

  const canContinue = useMemo(() => {
    return selectedLocation !== null && hasValidServiceId && !isSaving;
  }, [selectedLocation, hasValidServiceId, isSaving]);

  const loadCurrentLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    setLocationMessage('');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationMessage('Location permission denied. You can still select a location on the map.');
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const nextRegion: Region = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      };

      setRegion(nextRegion);
    } catch {
      setLocationMessage('Unable to access current location. You can still select a location manually.');
    } finally {
      setIsLoadingLocation(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentLocation();
  }, [loadCurrentLocation]);

  const onContinue = useCallback(async () => {
    if (!selectedLocation) {
      setErrorMessage('Please select a pickup location first.');
      return;
    }

    if (!hasValidServiceId) {
      setErrorMessage('Missing selected service. Please go back and choose a service first.');
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    try {
      let targetRequestId = requestId;

      if (!targetRequestId) {
        const created = await createCustomerRequest({ serviceId });
        targetRequestId = created.id;
        setRequestId(targetRequestId);
      }

      const updated = await updatePickupLocation(targetRequestId, {
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        address: selectedLocation.address,
        placeId: selectedLocation.placeId,
      });

      const nextRoute = {
        pathname: '/dropoff-location',
        params: {
          requestId: updated.id,
          serviceId: updated.serviceId,
          serviceKey,
          vehicleDetails,
          pickupLatitude: String(selectedLocation.latitude),
          pickupLongitude: String(selectedLocation.longitude),
          pickupAddress: selectedLocation.address ?? '',
          pickupPlaceId: selectedLocation.placeId ?? '',
        },
      } as unknown as Href;

      router.push(nextRoute);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save pickup location.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }, [hasValidServiceId, requestId, router, selectedLocation, serviceId, serviceKey, vehicleDetails]);

  const selectionLabel = selectedLocation?.address?.trim()
    ? selectedLocation.address
    : selectedLocation
      ? 'Selected location'
      : 'Tap on the map or search for an address.';

  const locationDetails = selectedLocation
    ? `Lat: ${selectedLocation.latitude.toFixed(6)}  |  Lng: ${selectedLocation.longitude.toFixed(6)}`
    : '';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Pickup Location</Text>
        <Text style={styles.subtitle}>Where should the driver pick up your item?</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          value={addressQuery}
          onChangeText={setAddressQuery}
          placeholder="Search pickup address"
          placeholderTextColor="#98a2b3"
          style={styles.searchInput}
        />
        <Text style={styles.searchHint}>
          Google Places autocomplete is not configured yet.
        </Text>
        <Text style={styles.searchHint}>
          TODO: Integrate Places API and set selected latitude/longitude/address/placeId.
        </Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView style={styles.map} initialRegion={region} region={region} onRegionChangeComplete={setRegion} onPress={onMapPress}>
          {selectedLocation ? (
            <Marker
              coordinate={{ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }}
              title="Pickup location"
              description={selectedLocation.address ?? 'Selected location'}
            />
          ) : null}
        </MapView>

        {isLoadingLocation ? (
          <View style={styles.mapOverlay}>
            <ActivityIndicator size="small" color="#1a73e8" />
            <Text style={styles.mapOverlayText}>Getting your location...</Text>
          </View>
        ) : null}
      </View>

      {locationMessage ? <Text style={styles.infoMessage}>{locationMessage}</Text> : null}

      <View style={styles.bottomCard}>
        <Text style={styles.bottomTitle}>{selectionLabel}</Text>
        {locationDetails ? <Text style={styles.bottomDetails}>{locationDetails}</Text> : null}
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]} onPress={() => void onContinue()} disabled={!canContinue}>
        {isSaving ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.continueText}>Continue</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fc',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  header: {
    marginBottom: 10,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  backButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    color: '#475467',
  },
  searchContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  searchInput: {
    height: 44,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: '#101828',
    backgroundColor: '#ffffff',
  },
  searchHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#667085',
  },
  mapContainer: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e4e7ec',
    backgroundColor: '#ffffff',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapOverlayText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '500',
  },
  infoMessage: {
    marginTop: 8,
    color: '#b54708',
    fontSize: 13,
  },
  bottomCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    padding: 12,
  },
  bottomTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  bottomDetails: {
    marginTop: 4,
    fontSize: 13,
    color: '#475467',
  },
  errorText: {
    marginTop: 10,
    color: '#b42318',
    fontSize: 13,
  },
  continueButton: {
    marginTop: 12,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
