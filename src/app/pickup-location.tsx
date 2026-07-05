import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  isNativeMapRuntimeAvailable,
  MapPressEvent,
  NativeMapView,
  NativeMarker,
  PROVIDER_GOOGLE,
  Region,
} from '@/components/native-maps';
import { HAS_GOOGLE_MAPS_API_KEY } from '@/config/maps';
import {
  createCustomerRequest,
  updatePickupLocation,
} from '@/lib/api';
import {
  resolvePlaceFromQuery,
  resolvePlaceSuggestion,
  searchPlacesAutocomplete,
  type PlaceAutocompleteSuggestion,
} from '@/lib/places';
import type {
  Coordinates,
  PendingFurnitureDetailsPayload,
  PendingGoodsDetailsPayload,
  PendingMotorcycleDetailsPayload,
  UpdateScheduleAndItemDetailsPayload,
} from '@/types/customer-request';
import type { VehicleCondition } from '@/types/vehicle-condition';
import type { VehicleDetailsPayload } from '@/types/vehicle';

type PickupLocationRouteParams = {
  serviceId?: string;
  serviceKey?: string;
  requestId?: string;
  vehicleDetails?: string;
  vehicleConditionDetails?: string;
  pendingRequestDetails?: string;
  pendingPhotoAssets?: string;
  pendingMotorcycleDetails?: string;
  pendingMotorcyclePhotoAssets?: string;
  pendingGoodsDetails?: string;
  pendingGoodsPhotoAssets?: string;
  pendingFurnitureDetails?: string;
  pendingFurniturePhotoAssets?: string;
};

type SelectedPickupLocation = {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
  source?: 'device' | 'manual' | 'search';
};

type ProviderState = {
  gpsAvailable?: boolean;
  networkAvailable?: boolean;
  locationServicesEnabled: boolean;
};

const DEFAULT_REGION: Region = {
  latitude: 33.8938,
  longitude: 35.5018,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function formatAddressFromReverseGeocode(
  reverseGeocodeResult: Location.LocationGeocodedAddress | undefined,
): string {
  return [
    reverseGeocodeResult?.name,
    reverseGeocodeResult?.street,
    reverseGeocodeResult?.city,
    reverseGeocodeResult?.region,
  ]
    .filter(Boolean)
    .join(', ');
}

function parseVehicleDetails(raw: string): VehicleDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as VehicleDetailsPayload;
  } catch {
    return undefined;
  }
}

function parseVehicleConditionDetails(
  raw: string,
): { vehicleCondition?: VehicleCondition; vehicleConditionNotes?: string } | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as { vehicleCondition?: VehicleCondition; vehicleConditionNotes?: string };
  } catch {
    return undefined;
  }
}

function parsePendingRequestDetails(
  raw: string | undefined,
): UpdateScheduleAndItemDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as UpdateScheduleAndItemDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingMotorcycleDetails(
  raw: string | undefined,
): PendingMotorcycleDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingMotorcycleDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingGoodsDetails(
  raw: string | undefined,
): PendingGoodsDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingGoodsDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingFurnitureDetails(
  raw: string | undefined,
): PendingFurnitureDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingFurnitureDetailsPayload;
  } catch {
    return undefined;
  }
}

export default function PickupLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<PickupLocationRouteParams>();

  const serviceId = typeof params.serviceId === 'string' ? params.serviceId : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey : '';
  const vehicleDetails = typeof params.vehicleDetails === 'string' ? params.vehicleDetails : '';
  const vehicleConditionDetails =
    typeof params.vehicleConditionDetails === 'string' ? params.vehicleConditionDetails : '';
  const initialRequestId = typeof params.requestId === 'string' ? params.requestId : undefined;
  const pendingRequestDetailsRaw =
    typeof params.pendingRequestDetails === 'string' ? params.pendingRequestDetails : '';
  const pendingPhotoAssetsRaw =
    typeof params.pendingPhotoAssets === 'string' ? params.pendingPhotoAssets : '';
  const pendingMotorcycleDetailsRaw =
    typeof params.pendingMotorcycleDetails === 'string' ? params.pendingMotorcycleDetails : '';
  const pendingMotorcyclePhotoAssetsRaw =
    typeof params.pendingMotorcyclePhotoAssets === 'string'
      ? params.pendingMotorcyclePhotoAssets
      : '';
  const pendingGoodsDetailsRaw =
    typeof params.pendingGoodsDetails === 'string' ? params.pendingGoodsDetails : '';
  const pendingGoodsPhotoAssetsRaw =
    typeof params.pendingGoodsPhotoAssets === 'string' ? params.pendingGoodsPhotoAssets : '';
  const pendingFurnitureDetailsRaw =
    typeof params.pendingFurnitureDetails === 'string' ? params.pendingFurnitureDetails : '';
  const pendingFurniturePhotoAssetsRaw =
    typeof params.pendingFurniturePhotoAssets === 'string'
      ? params.pendingFurniturePhotoAssets
      : '';

  const [requestId, setRequestId] = useState<string | undefined>(initialRequestId);
  const [selectedLocation, setSelectedLocation] = useState<SelectedPickupLocation | null>(null);
  const [addressQuery, setAddressQuery] = useState<string>('');
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(false);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [isLocationServicesDisabled, setIsLocationServicesDisabled] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [searchMessage, setSearchMessage] = useState<string>('');
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null);
  const [providerState, setProviderState] = useState<ProviderState | null>(null);
  const [lastLocationTimestamp, setLastLocationTimestamp] = useState<number | null>(null);
  const [isMockedLocation, setIsMockedLocation] = useState<boolean | null>(null);
  const [shouldRetryLocationOnAppFocus, setShouldRetryLocationOnAppFocus] = useState<boolean>(false);
  const suppressAutocompleteRef = useRef<boolean>(false);
  const mapRef = useRef<any>(null);

  const hasValidServiceId = serviceId.trim().length > 0;

  const onMapPress = useCallback((event: MapPressEvent) => {
    const coordinates: Coordinates = event.nativeEvent.coordinate;

    setSelectedLocation({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: 'manual',
    });
    setErrorMessage('');
  }, []);

  const canContinue = useMemo(() => {
    return selectedLocation !== null && hasValidServiceId && !isSaving;
  }, [selectedLocation, hasValidServiceId, isSaving]);

  const focusMapOnLocation = useCallback((latitude: number, longitude: number) => {
    const nextRegion: Region = {
      latitude,
      longitude,
      latitudeDelta: 0.03,
      longitudeDelta: 0.03,
    };

    setRegion(nextRegion);
    mapRef.current?.animateToRegion?.(nextRegion, 300);
  }, []);

  const applyCurrentLocation = useCallback(
    async (location: Location.LocationObject) => {
      setLocationAccuracy(typeof location.coords.accuracy === 'number' ? location.coords.accuracy : null);
      setLastLocationTimestamp(location.timestamp);
      setIsMockedLocation(typeof location.mocked === 'boolean' ? location.mocked : null);
      focusMapOnLocation(location.coords.latitude, location.coords.longitude);
      setLocationMessage('');
      setErrorMessage('');
      setIsLocationServicesDisabled(false);
      setShouldRetryLocationOnAppFocus(false);

      const reverse = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      const formattedAddress = formatAddressFromReverseGeocode(reverse[0]);

      setSelectedLocation((previous) => {
        if (previous && previous.source && previous.source !== 'device') {
          return previous;
        }

        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: formattedAddress || 'Current location',
          source: 'device',
        };
      });
    },
    [focusMapOnLocation],
  );

  const loadCurrentLocation = useCallback(async (requestPermission: boolean) => {
    setIsLoadingLocation(true);

    try {
      const permission = requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setIsLocationServicesDisabled(false);
        setShouldRetryLocationOnAppFocus(false);
        setLocationMessage('Location permission denied. You can still select a location on the map.');
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      const providerStatus = await Location.getProviderStatusAsync();
      setProviderState({
        gpsAvailable: providerStatus.gpsAvailable,
        networkAvailable: providerStatus.networkAvailable,
        locationServicesEnabled: providerStatus.locationServicesEnabled,
      });

      if (!servicesEnabled) {
        setIsLocationServicesDisabled(true);
        setShouldRetryLocationOnAppFocus(true);
        setLocationMessage(
          'Location services are off. Turn GPS on to use your current location, or select a location on the map.',
        );
        return;
      }

      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch {
          setLocationMessage(
            'High-accuracy mode was not enabled. Please enable precise/high-accuracy location on the phone.',
          );
        }
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
        timeInterval: 1000,
        distanceInterval: 1,
      });

      await applyCurrentLocation(current);
    } catch {
      setIsLocationServicesDisabled(false);
      setShouldRetryLocationOnAppFocus(false);
      setLocationMessage('Unable to access current location. You can still select a location manually.');
    } finally {
      setIsLoadingLocation(false);
    }
  }, [applyCurrentLocation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && shouldRetryLocationOnAppFocus) {
        void loadCurrentLocation(false);
      }
    });

    return () => subscription.remove();
  }, [loadCurrentLocation, shouldRetryLocationOnAppFocus]);

  useEffect(() => {
    if (suppressAutocompleteRef.current) {
      suppressAutocompleteRef.current = false;
      return;
    }

    const query = addressQuery.trim();

    if (!query) return;

    if (!HAS_GOOGLE_MAPS_API_KEY) {
      return;
    }

    let isCancelled = false;
    const timeoutId = setTimeout(() => {

      const loadSuggestions = async (): Promise<void> => {
        setIsSearchingPlaces(true);
        try {
          const suggestions = await searchPlacesAutocomplete(query);
          if (isCancelled) return;
          setPlaceSuggestions(suggestions);
          setSearchMessage(
            suggestions.length === 0 ? 'No matching places found.' : 'Choose a suggested address.',
          );
        } catch (error) {
          if (isCancelled) return;
          setPlaceSuggestions([]);
          setSearchMessage(
            error instanceof Error ? error.message : 'Places search failed. Please try again.',
          );
        } finally {
          if (!isCancelled) {
            setIsSearchingPlaces(false);
          }
        }
      };

      void loadSuggestions();
    }, 250);

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [addressQuery]);

  const applyResolvedPlace = useCallback((place: {
    latitude: number;
    longitude: number;
    address: string;
    placeId: string;
  }) => {
    suppressAutocompleteRef.current = true;
    setAddressQuery(place.address);
    setSelectedLocation({
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
      placeId: place.placeId,
      source: 'search',
    });
    setPlaceSuggestions([]);
    setShouldRetryLocationOnAppFocus(false);
    const nextRegion: Region = {
      latitude: place.latitude,
      longitude: place.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    };
    setRegion(nextRegion);
    mapRef.current?.animateToRegion?.(nextRegion, 300);
    setSearchMessage(`Pinned: ${place.address}`);
  }, []);

  const onSuggestionPress = useCallback(async (suggestion: PlaceAutocompleteSuggestion) => {
    setIsSearchingPlaces(true);
    setSearchMessage('');

    try {
      const place = await resolvePlaceSuggestion(suggestion);
      applyResolvedPlace(place);
    } catch (error) {
      setSearchMessage(
        error instanceof Error ? error.message : 'Places search failed. Please try again.',
      );
    } finally {
      setIsSearchingPlaces(false);
    }
  }, [applyResolvedPlace]);

  const onSearchSubmit = useCallback(async () => {
    const query = addressQuery.trim();

    if (!query) {
      setSearchMessage('Type an address first to search places.');
      return;
    }

    if (!HAS_GOOGLE_MAPS_API_KEY) {
      setSearchMessage('Google Places key is missing. Check your map environment configuration.');
      return;
    }

    setIsSearchingPlaces(true);
    setSearchMessage('');

    try {
      if (placeSuggestions.length > 0) {
        const place = await resolvePlaceSuggestion(placeSuggestions[0]);
        applyResolvedPlace(place);
        return;
      }

      const place = await resolvePlaceFromQuery(query);
      applyResolvedPlace(place);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Places search failed. Please try again.';
      setSearchMessage(message);
    } finally {
      setIsSearchingPlaces(false);
    }
  }, [addressQuery, applyResolvedPlace, placeSuggestions]);

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

      if (serviceKey === 'MOTORCYCLE_TRANSPORT') {
        const pendingMotorcycleDetails = parsePendingMotorcycleDetails(pendingMotorcycleDetailsRaw);
        if (!pendingMotorcycleDetails) {
          setErrorMessage('Motorcycle details are missing. Please go back and complete them first.');
          return;
        }

        const nextRoute = {
          pathname: '/dropoff-location',
          params: {
            serviceId,
            serviceKey,
            pickupLatitude: String(selectedLocation.latitude),
            pickupLongitude: String(selectedLocation.longitude),
            pickupAddress: selectedLocation.address ?? '',
            pickupPlaceId: selectedLocation.placeId ?? '',
            pendingMotorcycleDetails: pendingMotorcycleDetailsRaw,
            pendingMotorcyclePhotoAssets: pendingMotorcyclePhotoAssetsRaw,
          },
        } as unknown as Href;

        router.push(nextRoute);
        return;
      }

      if (serviceKey === 'GOODS_TRANSPORT') {
        const pendingGoodsDetails = parsePendingGoodsDetails(pendingGoodsDetailsRaw);
        if (!pendingGoodsDetails) {
          setErrorMessage('Goods details are missing. Please go back and complete them first.');
          return;
        }

        const nextRoute = {
          pathname: '/dropoff-location',
          params: {
            serviceId,
            serviceKey,
            pickupLatitude: String(selectedLocation.latitude),
            pickupLongitude: String(selectedLocation.longitude),
            pickupAddress: selectedLocation.address ?? '',
            pickupPlaceId: selectedLocation.placeId ?? '',
            pendingGoodsDetails: pendingGoodsDetailsRaw,
            pendingGoodsPhotoAssets: pendingGoodsPhotoAssetsRaw,
          },
        } as unknown as Href;

        router.push(nextRoute);
        return;
      }

      if (serviceKey === 'FURNITURE_TRANSPORT') {
        const pendingFurnitureDetails = parsePendingFurnitureDetails(
          pendingFurnitureDetailsRaw,
        );
        if (!pendingFurnitureDetails) {
          setErrorMessage('Furniture details are missing. Please go back and complete them first.');
          return;
        }

        const nextRoute = {
          pathname: '/dropoff-location',
          params: {
            serviceId,
            serviceKey,
            pickupLatitude: String(selectedLocation.latitude),
            pickupLongitude: String(selectedLocation.longitude),
            pickupAddress: selectedLocation.address ?? '',
            pickupPlaceId: selectedLocation.placeId ?? '',
            pendingFurnitureDetails: pendingFurnitureDetailsRaw,
            pendingFurniturePhotoAssets: pendingFurniturePhotoAssetsRaw,
          },
        } as unknown as Href;

        router.push(nextRoute);
        return;
      }

      if (!targetRequestId) {
        const parsedVehicleDetails = parseVehicleDetails(vehicleDetails);
        const parsedVehicleConditionDetails = parseVehicleConditionDetails(vehicleConditionDetails);
        const pendingRequestDetails = parsePendingRequestDetails(pendingRequestDetailsRaw);
        const created = await createCustomerRequest({
          serviceId,
          vehicleVin: parsedVehicleDetails?.vehicleVin,
          vehicleBrand:
            parsedVehicleDetails?.vehicleBrand?.trim() || pendingRequestDetails?.itemBrand?.trim() || undefined,
          vehicleModel:
            parsedVehicleDetails?.vehicleModel?.trim() || pendingRequestDetails?.itemModel?.trim() || undefined,
          vehicleSeries: parsedVehicleDetails?.vehicleSeries,
          vehicleVariant: parsedVehicleDetails?.vehicleVariant,
          vehicleManufactureYear:
            parsedVehicleDetails?.vehicleManufactureYear ?? pendingRequestDetails?.itemYear,
          vehicleEstimatedWeightKg:
            parsedVehicleDetails?.vehicleEstimatedWeightKg ?? pendingRequestDetails?.itemWeightKg,
          vehicleBodyType: parsedVehicleDetails?.vehicleBodyType,
          vehicleDataSource: parsedVehicleDetails?.vehicleDataSource,
          vehicleCondition: parsedVehicleConditionDetails?.vehicleCondition,
          vehicleConditionNotes: parsedVehicleConditionDetails?.vehicleConditionNotes?.trim() || undefined,
        });
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
          vehicleConditionDetails,
          pickupLatitude: String(selectedLocation.latitude),
          pickupLongitude: String(selectedLocation.longitude),
          pickupAddress: selectedLocation.address ?? '',
          pickupPlaceId: selectedLocation.placeId ?? '',
          pendingRequestDetails: pendingRequestDetailsRaw,
          pendingPhotoAssets: pendingPhotoAssetsRaw,
          pendingMotorcycleDetails: pendingMotorcycleDetailsRaw,
          pendingMotorcyclePhotoAssets: pendingMotorcyclePhotoAssetsRaw,
          pendingGoodsDetails: pendingGoodsDetailsRaw,
          pendingGoodsPhotoAssets: pendingGoodsPhotoAssetsRaw,
          pendingFurnitureDetails: pendingFurnitureDetailsRaw,
          pendingFurniturePhotoAssets: pendingFurniturePhotoAssetsRaw,
        },
      } as unknown as Href;

      router.push(nextRoute);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save pickup location.';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }, [hasValidServiceId, pendingFurnitureDetailsRaw, pendingFurniturePhotoAssetsRaw, pendingGoodsDetailsRaw, pendingGoodsPhotoAssetsRaw, pendingMotorcycleDetailsRaw, pendingMotorcyclePhotoAssetsRaw, pendingPhotoAssetsRaw, pendingRequestDetailsRaw, requestId, router, selectedLocation, serviceId, serviceKey, vehicleConditionDetails, vehicleDetails]);

  const selectionLabel = selectedLocation?.address?.trim()
    ? selectedLocation.address
    : selectedLocation
      ? 'Selected location'
      : 'Tap on the map or search for an address.';

  const locationDetails = selectedLocation
    ? `Lat: ${selectedLocation.latitude.toFixed(6)}  |  Lng: ${selectedLocation.longitude.toFixed(6)}`
    : '';

  const locationAccuracyText =
    locationAccuracy !== null ? `GPS accuracy: about ${Math.round(locationAccuracy)}m` : '';
  const providerSummary = providerState
    ? `GPS: ${providerState.gpsAvailable ? 'on' : 'off'} • Network: ${providerState.networkAvailable ? 'on' : 'off'} • Services: ${providerState.locationServicesEnabled ? 'on' : 'off'}`
    : '';
  const locationMetaText = [
    lastLocationTimestamp ? `Updated: ${new Date(lastLocationTimestamp).toLocaleTimeString()}` : null,
    isMockedLocation === true ? 'Mocked location detected' : null,
  ]
    .filter(Boolean)
    .join(' • ');

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
          onChangeText={(value) => {
            setAddressQuery(value);
            setErrorMessage('');
            setPlaceSuggestions([]);
            setSearchMessage('');
          }}
          onSubmitEditing={() => void onSearchSubmit()}
          placeholder="Search pickup address"
          placeholderTextColor="#98a2b3"
          style={styles.searchInput}
          returnKeyType="search"
        />
        <Text style={styles.searchHint}>
          {HAS_GOOGLE_MAPS_API_KEY
            ? 'Google Places API key is configured.'
            : 'Google Places API key is not configured yet.'}
        </Text>
        <Text style={styles.searchHint}>
          Start typing and tap a suggestion to pin the pickup location.
        </Text>
        {placeSuggestions.length > 0 ? (
          <View style={styles.suggestionsList}>
            {placeSuggestions.map((suggestion) => (
              <Pressable
                key={suggestion.placeId}
                style={styles.suggestionItem}
                onPress={() => void onSuggestionPress(suggestion)}
              >
                <Text style={styles.suggestionText}>{suggestion.description}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          style={[styles.locationButton, isLoadingLocation && styles.locationButtonDisabled]}
          onPress={() => void loadCurrentLocation(true)}
          disabled={isLoadingLocation}
        >
          {isLoadingLocation ? (
            <ActivityIndicator size="small" color="#1a73e8" />
          ) : (
            <Text style={styles.locationButtonText}>Use Current Location</Text>
          )}
        </Pressable>
        {isSearchingPlaces ? (
          <ActivityIndicator style={styles.searchSpinner} size="small" color="#1a73e8" />
        ) : null}
        {searchMessage ? <Text style={styles.searchHint}>{searchMessage}</Text> : null}
      </View>

      <View style={styles.mapContainer}>
        {isNativeMapRuntimeAvailable && NativeMapView && NativeMarker ? (
          <NativeMapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={region}
            region={region}
            showsUserLocation
            onRegionChangeComplete={setRegion}
            onPress={onMapPress}
          >
            {selectedLocation ? (
              <NativeMarker
                coordinate={{ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }}
                title="Pickup location"
                description={selectedLocation.address ?? 'Selected location'}
              />
            ) : null}
          </NativeMapView>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackTitle}>Map preview is not available on web.</Text>
            <Text style={styles.mapFallbackText}>
              Search for an address above to pin the pickup location, or open the app on iOS or Android for full map selection.
            </Text>
          </View>
        )}

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
        {locationAccuracyText ? <Text style={styles.bottomDetails}>{locationAccuracyText}</Text> : null}
        {providerSummary ? <Text style={styles.bottomDetails}>{providerSummary}</Text> : null}
        {locationMetaText ? <Text style={styles.bottomDetails}>{locationMetaText}</Text> : null}
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
  searchSpinner: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  suggestionsList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  suggestionItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#eaecf0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#101828',
  },
  locationButton: {
    marginTop: 10,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationButtonDisabled: {
    opacity: 0.7,
  },
  locationButtonText: {
    color: '#1d4ed8',
    fontSize: 14,
    fontWeight: '700',
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
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#eef2f7',
    gap: 8,
  },
  mapFallbackTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  mapFallbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475467',
    textAlign: 'center',
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
