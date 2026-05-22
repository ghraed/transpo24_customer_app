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

import { updateDropoffLocation } from '@/lib/api';
import type { Coordinates, DropoffLocationRouteParams } from '@/types/customer-request';

type SelectedDropoffLocation = {
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

export default function DropoffLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<DropoffLocationRouteParams>();

  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey.trim() : '';
  const pickupLatitude = typeof params.pickupLatitude === 'string' ? Number(params.pickupLatitude) : null;
  const pickupLongitude =
    typeof params.pickupLongitude === 'string' ? Number(params.pickupLongitude) : null;
  const pickupAddress = typeof params.pickupAddress === 'string' ? params.pickupAddress.trim() : '';
  const pickupPlaceId = typeof params.pickupPlaceId === 'string' ? params.pickupPlaceId.trim() : '';

  const hasPickupCoordinates =
    pickupLatitude !== null &&
    pickupLongitude !== null &&
    Number.isFinite(pickupLatitude) &&
    Number.isFinite(pickupLongitude);

  const [selectedLocation, setSelectedLocation] = useState<SelectedDropoffLocation | null>(null);
  const [addressQuery, setAddressQuery] = useState<string>('');
  const [region, setRegion] = useState<Region>(
    hasPickupCoordinates
      ? {
          latitude: pickupLatitude,
          longitude: pickupLongitude,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }
      : DEFAULT_REGION,
  );
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(!hasPickupCoordinates);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const onMapPress = useCallback((event: MapPressEvent) => {
    const coordinates: Coordinates = event.nativeEvent.coordinate;

    setSelectedLocation({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
    setErrorMessage('');
  }, []);

  const canContinue = useMemo(() => {
    return selectedLocation !== null && requestId.length > 0 && serviceId.length > 0 && !isSaving;
  }, [requestId, selectedLocation, serviceId, isSaving]);

  const loadCurrentLocation = useCallback(async () => {
    if (hasPickupCoordinates) {
      return;
    }

    setIsLoadingLocation(true);
    setLocationMessage('');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setLocationMessage(
          'Location permission denied. You can still select a dropoff location manually on the map.',
        );
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
      setLocationMessage('Unable to access current location. You can still pick location manually.');
    } finally {
      setIsLoadingLocation(false);
    }
  }, [hasPickupCoordinates]);

  useEffect(() => {
    void loadCurrentLocation();
  }, [loadCurrentLocation]);

  const onContinue = useCallback(async () => {
    if (!selectedLocation) {
      setErrorMessage('Please select a dropoff location first.');
      return;
    }

    if (requestId.length === 0) {
      setErrorMessage('Missing request. Please go back and select pickup location again.');
      return;
    }

    if (serviceId.length === 0) {
      setErrorMessage('Missing selected service. Please go back and choose a service first.');
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    try {
      const updated = await updateDropoffLocation(requestId, {
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        address: selectedLocation.address,
        placeId: selectedLocation.placeId,
      });

      const nextRoute = {
        pathname: '/date-time',
        params: {
          requestId: updated.id,
          serviceId: updated.serviceId,
          serviceKey,
          pickupLatitude: hasPickupCoordinates ? String(pickupLatitude) : '',
          pickupLongitude: hasPickupCoordinates ? String(pickupLongitude) : '',
          pickupAddress,
          pickupPlaceId,
          dropoffLatitude: String(selectedLocation.latitude),
          dropoffLongitude: String(selectedLocation.longitude),
          dropoffAddress: selectedLocation.address ?? '',
          dropoffPlaceId: selectedLocation.placeId ?? '',
        },
      } as unknown as Href;

      router.push(nextRoute);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save dropoff location.';

      if (message.toLowerCase().includes('pickup location must be selected')) {
        setErrorMessage('Please choose pickup location first. Redirecting...');
        setTimeout(() => {
          const pickupRoute = {
            pathname: '/pickup-location',
            params: { serviceId },
          } as unknown as Href;
          router.replace(pickupRoute);
        }, 700);
        return;
      }

      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }, [
    hasPickupCoordinates,
    pickupAddress,
    pickupLatitude,
    pickupLongitude,
    pickupPlaceId,
    requestId,
    router,
    selectedLocation,
    serviceId,
    serviceKey,
  ]);

  const selectedDropoffLabel = selectedLocation?.address?.trim()
    ? selectedLocation.address
    : selectedLocation
      ? 'Selected dropoff location.'
      : 'Tap on the map or search for an address.';

  const selectedDropoffDetails = selectedLocation
    ? `Lat: ${selectedLocation.latitude.toFixed(6)}  |  Lng: ${selectedLocation.longitude.toFixed(6)}`
    : '';

  const pickupSummary = hasPickupCoordinates
    ? pickupAddress || `Lat: ${pickupLatitude.toFixed(6)}  |  Lng: ${pickupLongitude.toFixed(6)}`
    : 'Pickup location is missing.';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Dropoff Location</Text>
        <Text style={styles.subtitle}>Where should the driver deliver your item?</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          value={addressQuery}
          onChangeText={setAddressQuery}
          placeholder="Search dropoff address"
          placeholderTextColor="#98a2b3"
          style={styles.searchInput}
        />
        <Text style={styles.searchHint}>
          Google Places autocomplete is not configured yet.
        </Text>
        <Text style={styles.searchHint}>
          TODO: Integrate Google Places API and set selected latitude/longitude/address/placeId.
        </Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          initialRegion={region}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={onMapPress}
        >
          {hasPickupCoordinates ? (
            <Marker
              coordinate={{ latitude: pickupLatitude, longitude: pickupLongitude }}
              title="Pickup location"
              description={pickupAddress || 'Pickup location'}
              pinColor="#2563eb"
            />
          ) : null}

          {selectedLocation ? (
            <Marker
              coordinate={{
                latitude: selectedLocation.latitude,
                longitude: selectedLocation.longitude,
              }}
              title="Dropoff location"
              description={selectedLocation.address ?? 'Selected dropoff location'}
              pinColor="#dc2626"
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
        <Text style={styles.bottomTitle}>{selectedDropoffLabel}</Text>
        {selectedDropoffDetails ? <Text style={styles.bottomDetails}>{selectedDropoffDetails}</Text> : null}
        <View style={styles.pickupSummaryContainer}>
          <Text style={styles.pickupLabel}>Pickup:</Text>
          <Text style={styles.pickupDetails}>{pickupSummary}</Text>
        </View>
      </View>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
        onPress={() => void onContinue()}
        disabled={!canContinue}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text style={styles.continueText}>Continue</Text>
        )}
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
  pickupSummaryContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e4e7ec',
    paddingTop: 8,
  },
  pickupLabel: {
    fontSize: 12,
    color: '#344054',
    fontWeight: '600',
  },
  pickupDetails: {
    marginTop: 2,
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
