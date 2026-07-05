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
  NativeMapViewDirections,
  NativeMarker,
  PROVIDER_GOOGLE,
  Region,
} from '@/components/native-maps';
import { GOOGLE_MAPS_API_KEY, HAS_GOOGLE_MAPS_API_KEY } from '@/config/maps';
import {
  updateDropoffLocation,
  updateScheduleAndItemDetails,
  uploadRequestPhotos,
} from '@/lib/api';
import {
  resolvePlaceFromQuery,
  resolvePlaceSuggestion,
  searchPlacesAutocomplete,
  type PlaceAutocompleteSuggestion,
} from '@/lib/places';
import type {
  Coordinates,
  DropoffLocationRouteParams,
  LocalPhotoAsset,
  PendingFurnitureDetailsPayload,
  PendingGoodsDetailsPayload,
  PendingMotorcycleDetailsPayload,
  UpdateScheduleAndItemDetailsPayload,
  UploadedRequestPhoto,
} from '@/types/customer-request';
import type { VehicleCondition } from '@/types/vehicle-condition';
import type { VehicleDetailsPayload } from '@/types/vehicle';

type SelectedDropoffLocation = {
  latitude: number;
  longitude: number;
  address?: string;
  placeId?: string;
  source?: 'device' | 'manual' | 'search';
};

const DEFAULT_REGION: Region = {
  latitude: 33.8938,
  longitude: 35.5018,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(distanceMeters >= 10 ? 1 : 2)} km`;
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

function parsePendingPhotoAssets(raw: string | undefined): LocalPhotoAsset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalPhotoAsset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseVehicleDetails(raw: string | undefined): VehicleDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as VehicleDetailsPayload;
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

function parseVehicleConditionDetails(
  raw: string | undefined,
): { vehicleCondition?: VehicleCondition; vehicleConditionNotes?: string } | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as { vehicleCondition?: VehicleCondition; vehicleConditionNotes?: string };
  } catch {
    return undefined;
  }
}

function serializeItemDetails(payload: UpdateScheduleAndItemDetailsPayload): string {
  return JSON.stringify({
    title: payload.itemTitle,
    description: payload.itemDescription ?? null,
    type: payload.itemType,
    brand: payload.itemBrand ?? null,
    model: payload.itemModel ?? null,
    year: payload.itemYear ?? null,
    condition: payload.itemCondition ?? null,
    weightKg: payload.itemWeightKg ?? null,
    dimensions: {
      lengthCm: payload.itemLengthCm ?? null,
      widthCm: payload.itemWidthCm ?? null,
      heightCm: payload.itemHeightCm ?? null,
    },
    requiresLoadingHelp: payload.requiresLoadingHelp,
    loadingWorkersCount: payload.loadingWorkersCount ?? null,
    specialInstructions: payload.specialInstructions ?? null,
  });
}

export default function DropoffLocationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<DropoffLocationRouteParams>();

  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey.trim() : '';
  const vehicleDetails = typeof params.vehicleDetails === 'string' ? params.vehicleDetails : '';
  const vehicleConditionDetails =
    typeof params.vehicleConditionDetails === 'string' ? params.vehicleConditionDetails : '';
  const pickupLatitude = typeof params.pickupLatitude === 'string' ? Number(params.pickupLatitude) : null;
  const pickupLongitude =
    typeof params.pickupLongitude === 'string' ? Number(params.pickupLongitude) : null;
  const pickupAddress = typeof params.pickupAddress === 'string' ? params.pickupAddress.trim() : '';
  const pickupPlaceId = typeof params.pickupPlaceId === 'string' ? params.pickupPlaceId.trim() : '';
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
  const itemDetails = typeof params.itemDetails === 'string' ? params.itemDetails : '';
  const uploadedPhotos = typeof params.uploadedPhotos === 'string' ? params.uploadedPhotos : '';
  const isImmediate = typeof params.isImmediate === 'string' ? params.isImmediate : '';
  const scheduledPickupAt =
    typeof params.scheduledPickupAt === 'string' ? params.scheduledPickupAt : '';

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
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(false);
  const [locationMessage, setLocationMessage] = useState<string>('');
  const [isLocationServicesDisabled, setIsLocationServicesDisabled] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [searchMessage, setSearchMessage] = useState<string>('');
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [routeMessage, setRouteMessage] = useState<string>('');
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [shouldRetryLocationOnAppFocus, setShouldRetryLocationOnAppFocus] = useState<boolean>(false);
  const suppressAutocompleteRef = useRef<boolean>(false);
  const mapRef = useRef<any>(null);

  const onMapPress = useCallback((event: MapPressEvent) => {
    const coordinates: Coordinates = event.nativeEvent.coordinate;

    setSelectedLocation({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: 'manual',
    });
    setRouteDistanceKm(null);
    setRouteMessage('');
    setErrorMessage('');
  }, []);

  const canContinue = useMemo(() => {
    const hasDraftContext =
      serviceKey === 'MOTORCYCLE_TRANSPORT' ||
      serviceKey === 'GOODS_TRANSPORT' ||
      serviceKey === 'FURNITURE_TRANSPORT'
        ? serviceId.length > 0
        : requestId.length > 0 && serviceId.length > 0;
    return selectedLocation !== null && hasDraftContext && !isSaving;
  }, [requestId, selectedLocation, serviceId, serviceKey, isSaving]);

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

  const applyCurrentLocation = useCallback((location: Location.LocationObject) => {
    focusMapOnLocation(location.coords.latitude, location.coords.longitude);
    setLocationMessage('');
    setErrorMessage('');
    setIsLocationServicesDisabled(false);
    setShouldRetryLocationOnAppFocus(false);
    setSelectedLocation((previous) => {
      if (previous && previous.source && previous.source !== 'device') {
        return previous;
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: 'Current location',
        source: 'device',
      };
    });
  }, [focusMapOnLocation]);

  const loadCurrentLocation = useCallback(async (requestPermission: boolean) => {
    setIsLoadingLocation(true);

    try {
      const permission = requestPermission
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();

      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setIsLocationServicesDisabled(false);
        setShouldRetryLocationOnAppFocus(false);
        setLocationMessage(
          'Location permission denied. You can still select a dropoff location manually on the map.',
        );
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();

      if (!servicesEnabled) {
        setIsLocationServicesDisabled(true);
        setShouldRetryLocationOnAppFocus(true);
        setLocationMessage(
          'Location services are off. Turn GPS on to use your current location, or choose a dropoff location on the map.',
        );
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      applyCurrentLocation(current);
    } catch {
      setIsLocationServicesDisabled(false);
      setShouldRetryLocationOnAppFocus(false);
      setLocationMessage('Unable to access current location. You can still pick location manually.');
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
    setRouteDistanceKm(null);
    setRouteMessage('');
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
      setErrorMessage('Please select a dropoff location first.');
      return;
    }

    if (
      requestId.length === 0 &&
      serviceKey !== 'MOTORCYCLE_TRANSPORT' &&
      serviceKey !== 'GOODS_TRANSPORT' &&
      serviceKey !== 'FURNITURE_TRANSPORT'
    ) {
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
      if (serviceKey === 'MOTORCYCLE_TRANSPORT') {
        const pendingMotorcycleDetails = parsePendingMotorcycleDetails(pendingMotorcycleDetailsRaw);
        if (!pendingMotorcycleDetails) {
          setErrorMessage('Motorcycle details are missing. Please go back and complete them first.');
          return;
        }

        const nextRoute = {
          pathname: '/submit-request',
          params: {
            serviceId,
            serviceKey,
            pendingMotorcycleDetails: pendingMotorcycleDetailsRaw,
            pendingMotorcyclePhotoAssets: pendingMotorcyclePhotoAssetsRaw,
            pickupLatitude: hasPickupCoordinates ? String(pickupLatitude) : '',
            pickupLongitude: hasPickupCoordinates ? String(pickupLongitude) : '',
            pickupAddress,
            pickupPlaceId,
            dropoffLatitude: String(selectedLocation.latitude),
            dropoffLongitude: String(selectedLocation.longitude),
            dropoffAddress: selectedLocation.address ?? '',
            dropoffPlaceId: selectedLocation.placeId ?? '',
            routeDistanceKm: routeDistanceKm !== null ? String(routeDistanceKm) : '',
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
          pathname: '/submit-request',
          params: {
            serviceId,
            serviceKey,
            pendingGoodsDetails: pendingGoodsDetailsRaw,
            pendingGoodsPhotoAssets: pendingGoodsPhotoAssetsRaw,
            pickupLatitude: hasPickupCoordinates ? String(pickupLatitude) : '',
            pickupLongitude: hasPickupCoordinates ? String(pickupLongitude) : '',
            pickupAddress,
            pickupPlaceId,
            dropoffLatitude: String(selectedLocation.latitude),
            dropoffLongitude: String(selectedLocation.longitude),
            dropoffAddress: selectedLocation.address ?? '',
            dropoffPlaceId: selectedLocation.placeId ?? '',
            routeDistanceKm: routeDistanceKm !== null ? String(routeDistanceKm) : '',
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
          pathname: '/submit-request',
          params: {
            serviceId,
            serviceKey,
            pendingFurnitureDetails: pendingFurnitureDetailsRaw,
            pendingFurniturePhotoAssets: pendingFurniturePhotoAssetsRaw,
            pickupLatitude: hasPickupCoordinates ? String(pickupLatitude) : '',
            pickupLongitude: hasPickupCoordinates ? String(pickupLongitude) : '',
            pickupAddress,
            pickupPlaceId,
            dropoffLatitude: String(selectedLocation.latitude),
            dropoffLongitude: String(selectedLocation.longitude),
            dropoffAddress: selectedLocation.address ?? '',
            dropoffPlaceId: selectedLocation.placeId ?? '',
            routeDistanceKm: routeDistanceKm !== null ? String(routeDistanceKm) : '',
          },
        } as unknown as Href;

        router.push(nextRoute);
        return;
      }

      const updated = await updateDropoffLocation(requestId, {
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        address: selectedLocation.address,
        placeId: selectedLocation.placeId,
      });

      let nextIsImmediate = isImmediate;
      let nextScheduledPickupAt = scheduledPickupAt;
      let nextItemDetails = itemDetails;
      let nextUploadedPhotos = uploadedPhotos;

      if (serviceKey === 'VEHICLE_TRANSPORT' && pendingRequestDetailsRaw) {
        const pendingRequestDetails = parsePendingRequestDetails(pendingRequestDetailsRaw);
        if (pendingRequestDetails) {
          const parsedVehicleConditionDetails = parseVehicleConditionDetails(vehicleConditionDetails);
          const parsedVehicleDetails = parseVehicleDetails(vehicleDetails);
          const payload: UpdateScheduleAndItemDetailsPayload = {
            ...pendingRequestDetails,
            vehicleVin: parsedVehicleDetails?.vehicleVin,
            vehicleBrand:
              parsedVehicleDetails?.vehicleBrand?.trim() ||
              pendingRequestDetails.vehicleBrand?.trim() ||
              pendingRequestDetails.itemBrand?.trim() ||
              undefined,
            vehicleModel:
              parsedVehicleDetails?.vehicleModel?.trim() ||
              pendingRequestDetails.vehicleModel?.trim() ||
              pendingRequestDetails.itemModel?.trim() ||
              undefined,
            vehicleSeries: parsedVehicleDetails?.vehicleSeries,
            vehicleVariant: parsedVehicleDetails?.vehicleVariant,
            vehicleManufactureYear:
              parsedVehicleDetails?.vehicleManufactureYear ??
              pendingRequestDetails.vehicleManufactureYear ??
              pendingRequestDetails.itemYear,
            vehicleEstimatedWeightKg:
              parsedVehicleDetails?.vehicleEstimatedWeightKg ??
              pendingRequestDetails.vehicleEstimatedWeightKg ??
              pendingRequestDetails.itemWeightKg,
            vehicleBodyType:
              parsedVehicleDetails?.vehicleBodyType ?? pendingRequestDetails.vehicleBodyType,
            vehicleDataSource:
              parsedVehicleDetails?.vehicleDataSource ?? pendingRequestDetails.vehicleDataSource,
            vehicleCondition: parsedVehicleConditionDetails?.vehicleCondition,
            vehicleConditionNotes:
              parsedVehicleConditionDetails?.vehicleConditionNotes?.trim() || undefined,
          };

          await updateScheduleAndItemDetails(requestId, payload);

          let uploaded: UploadedRequestPhoto[] = [];
          const pendingPhotoAssets = parsePendingPhotoAssets(pendingPhotoAssetsRaw);
          if (pendingPhotoAssets.length > 0) {
            const uploadResponse = await uploadRequestPhotos(requestId, pendingPhotoAssets);
            uploaded = uploadResponse.photos;
          }

          nextIsImmediate = String(payload.isImmediate);
          nextScheduledPickupAt = payload.scheduledPickupAt ?? '';
          nextItemDetails = serializeItemDetails(payload);
          nextUploadedPhotos = JSON.stringify(uploaded);
        }
      }

      const nextRoute = {
        pathname: serviceKey === 'VEHICLE_TRANSPORT' ? '/submit-request' : '/date-time',
        params: {
          requestId: updated.id,
          serviceId: updated.serviceId,
          serviceKey,
          vehicleDetails,
          vehicleConditionDetails,
          pendingMotorcycleDetails: pendingMotorcycleDetailsRaw,
          pickupLatitude: hasPickupCoordinates ? String(pickupLatitude) : '',
          pickupLongitude: hasPickupCoordinates ? String(pickupLongitude) : '',
          pickupAddress,
          pickupPlaceId,
          dropoffLatitude: String(selectedLocation.latitude),
          dropoffLongitude: String(selectedLocation.longitude),
          dropoffAddress: selectedLocation.address ?? '',
          dropoffPlaceId: selectedLocation.placeId ?? '',
          isImmediate: nextIsImmediate,
          scheduledPickupAt: nextScheduledPickupAt,
          itemDetails: nextItemDetails,
          uploadedPhotos: nextUploadedPhotos,
          routeDistanceKm: routeDistanceKm !== null ? String(routeDistanceKm) : '',
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
          params: {
            serviceId,
            serviceKey,
            vehicleDetails,
            vehicleConditionDetails,
              pendingMotorcycleDetails: pendingMotorcycleDetailsRaw,
              pendingMotorcyclePhotoAssets: pendingMotorcyclePhotoAssetsRaw,
              pendingGoodsDetails: pendingGoodsDetailsRaw,
              pendingGoodsPhotoAssets: pendingGoodsPhotoAssetsRaw,
              pendingFurnitureDetails: pendingFurnitureDetailsRaw,
              pendingFurniturePhotoAssets: pendingFurniturePhotoAssetsRaw,
            },
          } as unknown as Href;
        router.push(pickupRoute);
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
    isImmediate,
    itemDetails,
    pendingFurnitureDetailsRaw,
    pendingFurniturePhotoAssetsRaw,
    pendingGoodsDetailsRaw,
    pendingGoodsPhotoAssetsRaw,
    pendingPhotoAssetsRaw,
    pendingMotorcycleDetailsRaw,
    pendingMotorcyclePhotoAssetsRaw,
    pendingRequestDetailsRaw,
    vehicleConditionDetails,
    vehicleDetails,
    uploadedPhotos,
    scheduledPickupAt,
    routeDistanceKm,
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

  const distanceSummary =
    routeDistanceKm !== null ? formatDistance(routeDistanceKm * 1000) : '';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Dropoff Location</Text>
        <Text style={styles.subtitle}>Where should the driver deliver your item?</Text>
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
          placeholder="Search dropoff address"
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
          Start typing and tap a suggestion to pin the dropoff location.
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
            {hasPickupCoordinates ? (
              <NativeMarker
                coordinate={{ latitude: pickupLatitude, longitude: pickupLongitude }}
                title="Pickup location"
                description={pickupAddress || 'Pickup location'}
                pinColor="#2563eb"
              />
            ) : null}

            {hasPickupCoordinates &&
            selectedLocation &&
            NativeMapViewDirections &&
            GOOGLE_MAPS_API_KEY ? (
              <NativeMapViewDirections
                origin={{ latitude: pickupLatitude, longitude: pickupLongitude }}
                destination={{
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude,
                }}
                apikey={GOOGLE_MAPS_API_KEY}
                mode="DRIVING"
                strokeWidth={4}
                strokeColor="#2563EB"
                onReady={(result) => {
                  setRouteDistanceKm(result.distance);
                  setRouteMessage('');
                }}
                onError={(message: string) => {
                  setRouteDistanceKm(null);
                  setRouteMessage(`Route error: ${message}`);
                }}
              />
            ) : null}

            {selectedLocation ? (
              <NativeMarker
                coordinate={{
                  latitude: selectedLocation.latitude,
                  longitude: selectedLocation.longitude,
                }}
                title="Dropoff location"
                description={selectedLocation.address ?? 'Selected dropoff location'}
                pinColor="#dc2626"
              />
            ) : null}
          </NativeMapView>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackTitle}>Map preview is not available on web.</Text>
            <Text style={styles.mapFallbackText}>
              Search for a destination above to pin the dropoff location, or open the app on iOS or Android for full map selection.
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
      {routeMessage ? <Text style={styles.infoMessage}>{routeMessage}</Text> : null}

      <View style={styles.bottomCard}>
        <Text style={styles.bottomTitle}>{selectedDropoffLabel}</Text>
        {selectedDropoffDetails ? <Text style={styles.bottomDetails}>{selectedDropoffDetails}</Text> : null}
        {distanceSummary ? (
          <View style={styles.distanceSummaryContainer}>
            <Text style={styles.distanceLabel}>Distance from pickup:</Text>
            <Text style={styles.distanceValue}>{distanceSummary}</Text>
          </View>
        ) : null}
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
  pickupSummaryContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e4e7ec',
    paddingTop: 8,
  },
  distanceSummaryContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e4e7ec',
    paddingTop: 8,
  },
  distanceLabel: {
    fontSize: 12,
    color: '#344054',
    fontWeight: '600',
  },
  distanceValue: {
    marginTop: 2,
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
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
