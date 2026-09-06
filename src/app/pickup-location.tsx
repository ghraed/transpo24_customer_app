import { Redirect } from 'expo-router';
import * as Location from 'expo-location';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ColorValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import {
  reverseGeocodeCoordinates,
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
import appI18n from '@/localization/i18n';

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

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

function PickupLocationScreen() {
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const params = useLocalSearchParams<PickupLocationRouteParams>();
  const insets = useSafeAreaInsets();

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
  const [, setIsLocationServicesDisabled] = useState<boolean>(false);
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

  const resolveSelectionAddress = useCallback(
    async (latitude: number, longitude: number): Promise<{ address?: string; placeId?: string }> => {
      try {
        const resolved = await reverseGeocodeCoordinates(latitude, longitude);
        if (resolved?.address) {
          return {
            address: resolved.address,
            placeId: resolved.placeId || undefined,
          };
        }
      } catch {
        // Fall back to expo-location reverse geocoding below.
      }

      try {
        const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
        const formattedAddress = formatAddressFromReverseGeocode(reverse[0]);
        return formattedAddress ? { address: formattedAddress } : {};
      } catch {
        return {};
      }
    },
    [],
  );

  const onMapPress = useCallback((event: MapPressEvent) => {
    const coordinates: Coordinates = event.nativeEvent.coordinate;

    setSelectedLocation({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      source: 'manual',
    });
    setErrorMessage('');

    void resolveSelectionAddress(coordinates.latitude, coordinates.longitude).then((resolved) => {
      setSelectedLocation((previous) => {
        if (
          !previous ||
          previous.latitude !== coordinates.latitude ||
          previous.longitude !== coordinates.longitude ||
          previous.source !== 'manual'
        ) {
          return previous;
        }

        return {
          ...previous,
          address: resolved.address,
          placeId: resolved.placeId,
        };
      });
    });
  }, [resolveSelectionAddress]);

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

      const resolved = await resolveSelectionAddress(
        location.coords.latitude,
        location.coords.longitude,
      );

      const nextLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        address: resolved.address || appI18n.t("Current location"),
        placeId: resolved.placeId,
        source: 'device' as const,
      };

      suppressAutocompleteRef.current = true;
      setAddressQuery(nextLocation.address);
      setPlaceSuggestions([]);
      setSearchMessage(`Pinned: ${nextLocation.address}`);
      setSelectedLocation(() => {
        return nextLocation;
      });
    },
    [focusMapOnLocation, resolveSelectionAddress],
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
            suggestions.length === 0
              ? appI18n.t('No matching places found.')
              : appI18n.t('Choose a suggested address.'),
          );
        } catch (error) {
          if (isCancelled) return;
          setPlaceSuggestions([]);
          setSearchMessage(
            error instanceof Error ? error.message : appI18n.t("Places search failed. Please try again."),
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
        error instanceof Error ? error.message : appI18n.t("Places search failed. Please try again."),
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
        error instanceof Error ? error.message : appI18n.t("Places search failed. Please try again.");
      setSearchMessage(message);
    } finally {
      setIsSearchingPlaces(false);
    }
  }, [addressQuery, applyResolvedPlace, placeSuggestions]);

  const onContinue = useCallback(async () => {
    if (!selectedLocation) {
      setErrorMessage(appI18n.t("Please select a pickup location first."));
      return;
    }

    if (!hasValidServiceId) {
      setErrorMessage(appI18n.t("Missing selected service. Please go back and choose a service first."));
      return;
    }

    setErrorMessage('');
    setIsSaving(true);

    try {
      let targetRequestId = requestId;

      if (serviceKey === 'MOTORCYCLE_TRANSPORT') {
        const pendingMotorcycleDetails = parsePendingMotorcycleDetails(pendingMotorcycleDetailsRaw);
        if (!pendingMotorcycleDetails) {
          setErrorMessage(appI18n.t("Motorcycle details are missing. Please go back and complete them first."));
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
          setErrorMessage(appI18n.t("Goods details are missing. Please go back and complete them first."));
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
          setErrorMessage(appI18n.t("Furniture details are missing. Please go back and complete them first."));
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
      const message = error instanceof Error ? error.message : appI18n.t("Failed to save pickup location.");
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }, [hasValidServiceId, pendingFurnitureDetailsRaw, pendingFurniturePhotoAssetsRaw, pendingGoodsDetailsRaw, pendingGoodsPhotoAssetsRaw, pendingMotorcycleDetailsRaw, pendingMotorcyclePhotoAssetsRaw, pendingPhotoAssetsRaw, pendingRequestDetailsRaw, requestId, router, selectedLocation, serviceId, serviceKey, vehicleConditionDetails, vehicleDetails]);

  const selectionLabel = selectedLocation?.address?.trim()
    ? selectedLocation.address
    : selectedLocation
      ? appI18n.t('Selected location')
      : appI18n.t('Tap on the map or search for an address.');

  const locationDetails = selectedLocation
    ? appI18n.t('Lat: {{latitude}} | Lng: {{longitude}}', {
        latitude: selectedLocation.latitude.toFixed(6),
        longitude: selectedLocation.longitude.toFixed(6),
      })
    : '';

  const locationAccuracyText =
    locationAccuracy !== null
      ? appI18n.t('GPS accuracy: about {{accuracy}}m', { accuracy: Math.round(locationAccuracy) })
      : '';
  const providerSummary = providerState
    ? appI18n.t('GPS: {{gps}} • Network: {{network}} • Services: {{services}}', {
        gps: providerState.gpsAvailable ? appI18n.t('On') : appI18n.t('Off'),
        network: providerState.networkAvailable ? appI18n.t('On') : appI18n.t('Off'),
        services: providerState.locationServicesEnabled ? appI18n.t('On') : appI18n.t('Off'),
      })
    : '';
  const locationMetaText = [
    lastLocationTimestamp
      ? appI18n.t('Updated: {{time}}', {
          time: new Date(lastLocationTimestamp).toLocaleTimeString([], { hour12: false }),
        })
      : null,
    isMockedLocation === true ? appI18n.t('Mocked location detected') : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom + 24, 36) + keyboardInset,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroBadge}>
            <IconSymbol name={{ ios: 'mappin.and.ellipse', android: 'place', web: 'place' }} color="#111827" size={20} />
          </View>
          <Text style={styles.heroLabel}>{appI18n.t("Pickup")}</Text>
        </View>
        <Text style={styles.title}>{appI18n.t("Pickup Location")}</Text>
        <Text style={styles.subtitle}>{appI18n.t("Where should the driver pick up your item?")}</Text>
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
          placeholder={appI18n.t("Search pickup address")}
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
          {appI18n.t("Start typing and tap a suggestion to pin the pickup location.")}</Text>
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
            <ActivityIndicator size="small" color="#111827" />
          ) : (
            <>
              <IconSymbol name={{ ios: 'location.fill', android: 'my_location', web: 'my_location' }} color="#111827" size={16} />
              <Text style={styles.locationButtonText}>{appI18n.t("Use Current Location")}</Text>
            </>
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
                title={appI18n.t("Pickup location")}
                description={selectedLocation.address ?? appI18n.t("Selected location")}
              />
            ) : null}
          </NativeMapView>
        ) : (
          <View style={styles.mapFallback}>
            <Text style={styles.mapFallbackTitle}>{appI18n.t("Map preview is not available on web.")}</Text>
            <Text style={styles.mapFallbackText}>
              {appI18n.t("Search for an address above to pin the pickup location, or open the app on iOS or Android for full map selection.")}</Text>
          </View>
        )}

        {isLoadingLocation ? (
          <View style={styles.mapOverlay}>
            <ActivityIndicator size="small" color="#1a73e8" />
            <Text style={styles.mapOverlayText}>{appI18n.t("Getting your location...")}</Text>
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
      </ScrollView>

      <View style={styles.footerBar}>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={() => void onContinue()}
          disabled={!canContinue}
        >
          {isSaving ? <ActivityIndicator size="small" color="#111827" /> : <Text style={styles.continueText}>{appI18n.t("Continue")}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  content: {
    paddingHorizontal: 20,
    gap: 12,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#68768A',
    lineHeight: 22,
  },
  searchContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EF',
    borderRadius: 24,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  searchInput: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  searchHint: {
    marginTop: 6,
    fontSize: 13,
    color: '#68768A',
    lineHeight: 18,
  },
  searchSpinner: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  suggestionsList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  suggestionText: {
    fontSize: 14,
    color: '#111827',
  },
  locationButton: {
    marginTop: 10,
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFC548',
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  locationButtonDisabled: {
    opacity: 0.7,
  },
  locationButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '800',
  },
  mapContainer: {
    minHeight: 320,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E8EF',
    backgroundColor: '#FFFFFF',
  },
  map: {
    minHeight: 320,
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
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  mapFallbackText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#68768A',
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
    color: '#68768A',
    fontSize: 12,
    fontWeight: '500',
  },
  infoMessage: {
    marginTop: 8,
    color: '#b54708',
    fontSize: 13,
  },
  bottomCard: {
    borderWidth: 1,
    borderColor: '#E5E8EF',
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  bottomTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  bottomDetails: {
    marginTop: 4,
    fontSize: 13,
    color: '#68768A',
  },
  errorText: {
    marginTop: 10,
    color: '#B42318',
    fontSize: 13,
  },
  footerBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  continueButton: {
    marginTop: 12,
    height: 56,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
});

export default function ServiceRoute() {
  const route = useLocalSearchParams<{ serviceId?: string; serviceKey?: string }>();
  if (route.serviceKey === 'VEHICLE_TRANSPORT') return <Redirect href={{ pathname: '/vehicle-request', params: { serviceId: route.serviceId ?? '' } }} />;
  return <PickupLocationScreen />;
}
