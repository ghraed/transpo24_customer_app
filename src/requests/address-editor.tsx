import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  NativeMapView,
  NativeMapViewDirections,
  NativeMarker,
  PROVIDER_GOOGLE,
  isNativeMapRuntimeAvailable,
  type MapPressEvent,
  type Region,
} from '@/components/native-maps';
import {
  fetchPlaceDetails,
  getAccountCountryCenter,
  searchPlacesAutocomplete,
  type PlaceAutocompleteSuggestion,
} from '@/lib/places';
import { GOOGLE_MAPS_API_KEY } from '@/config/maps';
import type { Address } from './vehicle-draft';
import { resolveCurrentAddress } from './resolve-current-address';
import { AddressPlaces } from './address-places';

function addressRegion(address?: Address, pickup?: Address): Region | undefined {
  const point = address ?? pickup;
  if (!point) return undefined;
  if (address && pickup) {
    return {
      latitude: (address.latitude + pickup.latitude) / 2,
      longitude: (address.longitude + pickup.longitude) / 2,
      latitudeDelta: Math.max(0.012, Math.abs(address.latitude - pickup.latitude) * 1.4),
      longitudeDelta: Math.max(0.012, Math.abs(address.longitude - pickup.longitude) * 1.4),
    };
  }
  return { latitude: point.latitude, longitude: point.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 };
}

export function AddressEditor({
  value,
  onChange,
  countryCode,
  label,
  invalid,
  fillHeight = false,
  locationKind = 'pickup',
  pickupLocation,
}: {
  value?: Address;
  onChange: (address: Address | undefined) => void;
  countryCode?: string | null;
  label: string;
  invalid: boolean;
  fillHeight?: boolean;
  locationKind?: 'pickup' | 'dropoff';
  pickupLocation?: Address;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Camera state is independent of the selected pin, as in the original page.
  const routeOrigin = locationKind === 'dropoff' ? pickupLocation : undefined;
  const [region, setRegion] = useState<Region | undefined>(() => addressRegion(value, routeOrigin));
  const [searchRegion, setSearchRegion] = useState<Region>();
  const mainMapRef = useRef<{ animateToRegion: (region: Region, duration: number) => void } | null>(null);
  const attachMainMap = useCallback((instance: { animateToRegion: (region: Region, duration: number) => void } | null) => {
    mainMapRef.current = instance;
  }, []);
  const [cameraTarget, setCameraTarget] = useState<Region>();
  useEffect(() => {
    if (!open && cameraTarget) {
      mainMapRef.current?.animateToRegion(cameraTarget, 300);
    }
  }, [open, cameraTarget]);
  const focusMainMap = useCallback(() => {
    if (!open && cameraTarget) mainMapRef.current?.animateToRegion(cameraTarget, 300);
  }, [open, cameraTarget]);
  const searchMapInteracted = useRef(false);
  const mapInteracted = useRef(false);
  const [center, setCenter] = useState<{
    latitude: number;
    longitude: number;
  }>();
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>(
    [],
  );
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');
  const session = useRef('');
  const selectionId = useRef(0);
  const [pendingPin, setPendingPin] = useState<{
    latitude: number;
    longitude: number;
  }>();
  useEffect(() => () => { selectionId.current += 1; }, []);
  useEffect(() => {
    if (center && !value && !routeOrigin && selectionId.current === 0 && !mapInteracted.current) {
      setRegion({ ...center, latitudeDelta: 0.03, longitudeDelta: 0.03 });
    }
  }, [center, value, routeOrigin]);
  useEffect(() => {
    if (open && !searchRegion && center && !searchMapInteracted.current) {
      setSearchRegion({ ...center, latitudeDelta: 0.03, longitudeDelta: 0.03 });
    }
  }, [open, searchRegion, center]);
  const focusAddress = (address: Address) => {
    const nextRegion = addressRegion(address);
    setCameraTarget(nextRegion);
    setRegion(nextRegion);
    setSearchRegion(nextRegion);
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.granted) {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          if (active) setCenter(position.coords);
          return;
        }
      } catch {
        /* Account country is the fallback when GPS is unavailable. */
      }
      if (countryCode) {
        try {
          const point = await getAccountCountryCenter(countryCode);
          if (active && point) setCenter(point);
        } catch {
          /* Search remains available without a map center. */
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [countryCode]);

  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      void searchPlacesAutocomplete(query, {
        location: center,
        sessionToken: session.current,
        signal: abort.signal,
      })
        .then((results) => {
          if (!abort.signal.aborted) {
            setSuggestions(results);
            setError('');
          }
        })
        .catch(() => {
          if (!abort.signal.aborted) {
            setSuggestions([]);
            setError('vehicleRequest.searchUnavailable');
          }
        })
        .finally(() => {
          if (!abort.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, center, open, i18n.language]);

  const locate = async () => {
    const id = ++selectionId.current;
    setResolving(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (id !== selectionId.current) return;
      if (!permission.granted) {
        setError('vehicleRequest.locationPermission');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (id !== selectionId.current) return;
      setCenter(position.coords);
      const address = await resolveCurrentAddress(
        position.coords.latitude,
        position.coords.longitude,
      );
      if (id !== selectionId.current) return;
      if (!address) throw new Error();
      setPendingPin(undefined);
      focusAddress(address);
      onChange(address);
      setOpen(false);
    } catch {
      if (id === selectionId.current) setError('vehicleRequest.locationUnavailable');
    } finally {
      if (id === selectionId.current) setResolving(false);
    }
  };
  const select = async (suggestion?: PlaceAutocompleteSuggestion) => {
    if (!suggestion && !query.trim()) return;
    const id = ++selectionId.current;
    setResolving(true);
    setError('');
    try {
      const match = suggestion ?? (await searchPlacesAutocomplete(query.trim(), {
        location: center,
        sessionToken: session.current,
      }))[0];
      if (id !== selectionId.current) return;
      if (!match) {
        setError('vehicleRequest.noPlaces');
        return;
      }
      const address = await fetchPlaceDetails(match.placeId, session.current);
      if (id !== selectionId.current) return;
      setPendingPin(undefined);
      focusAddress(address);
      onChange(address);
      setOpen(false);
    } catch {
      if (id === selectionId.current) setError('vehicleRequest.searchUnavailable');
    } finally {
      if (id === selectionId.current) setResolving(false);
    }
  };
  const movePin = async ({ nativeEvent: { coordinate } }: MapPressEvent) => {
    const id = ++selectionId.current;
    Keyboard.dismiss();
    setOpen(false);
    setPendingPin(coordinate);
    mapInteracted.current = true;
    setError('');
    setResolving(true);
    // The previous address must not be confirmed while the new pin is resolving.
    onChange(undefined);
    try {
      const address = await resolveCurrentAddress(coordinate.latitude, coordinate.longitude);
      if (id !== selectionId.current) return;
      if (!address) throw new Error();
      onChange({ ...address, ...coordinate });
      setPendingPin(undefined);
    } catch {
      if (id === selectionId.current) setError('vehicleRequest.locationUnavailable');
    } finally {
      if (id === selectionId.current) setResolving(false);
    }
  };
  const map = (expanded = false, searching = false) => {
    const camera = searching ? searchRegion : region;
    if (!isNativeMapRuntimeAvailable) return null;
    // A map without an address/location opens at the native world's default zoom.
    // Keep search available until we have a meaningful center instead.
    if (!camera) return <View style={[styles.map, styles.mapPlaceholder]}>
      <Text style={styles.body}>{t('vehicleRequest.searchAddress')}</Text>
    </View>;
    return (
      <View style={[styles.map, expanded && styles.expandedMap]}>
        <NativeMapView
          ref={searching ? undefined : attachMainMap}
          onMapReady={searching ? undefined : focusMainMap}
          provider={PROVIDER_GOOGLE}
          onPress={(event: MapPressEvent) => void movePin(event)}
          zoomEnabled
          scrollEnabled
          onPanDrag={() => {
            if (searching) searchMapInteracted.current = true;
            else {
              mapInteracted.current = true;
              setCameraTarget(undefined);
            }
          }}
          onRegionChangeComplete={(next: Region, details?: { isGesture?: boolean }) => {
            if (searching) {
              if (details?.isGesture) searchMapInteracted.current = true;
              setSearchRegion(next);
            } else {
              if (details?.isGesture) {
                mapInteracted.current = true;
                setCameraTarget(undefined);
              } else if (cameraTarget) {
                // Ignore old camera callbacks while the popup closes and the
                // native main map moves to the newly selected address.
                if (Math.abs(next.latitude - cameraTarget.latitude) > 0.0001 ||
                    Math.abs(next.longitude - cameraTarget.longitude) > 0.0001) return;
                setCameraTarget(undefined);
              }
              setRegion(next);
            }
          }}
          style={StyleSheet.absoluteFill}
          initialRegion={camera}
          region={camera}
        >
          {routeOrigin ? <NativeMarker
            coordinate={routeOrigin}
            title={t('vehicleRequest.step.pickup')}
            description={routeOrigin.address}
            pinColor="#DC2626"
          /> : null}
          {routeOrigin && (pendingPin || value) && GOOGLE_MAPS_API_KEY ? (
            <NativeMapViewDirections
              key={`${routeOrigin.latitude},${routeOrigin.longitude}:${(pendingPin ?? value)!.latitude},${(pendingPin ?? value)!.longitude}`}
              origin={routeOrigin}
              destination={pendingPin ?? value}
              apikey={GOOGLE_MAPS_API_KEY}
              mode="DRIVING"
              strokeWidth={4}
              strokeColor="#2563EB"
            />
          ) : null}
          {pendingPin || value ? <NativeMarker
            coordinate={pendingPin ?? value}
            title={t(`vehicleRequest.step.${locationKind}`)}
            description={pendingPin ? undefined : value?.address}
            pinColor={locationKind === 'dropoff' ? '#2563EB' : '#DC2626'}
          /> : null}
        </NativeMapView>
        {resolving ? (
          <View pointerEvents="none" style={styles.mapLoading}>
            <ActivityIndicator color="#111827" />
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.section, fillHeight && styles.fill]}>
      <View style={[styles.search, invalid && styles.invalid]}>
        <Pressable
          style={styles.searchText}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => {
            session.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            setQuery('');
            setSuggestions([]);
            setBusy(false);
            setError('');
            searchMapInteracted.current = false;
            const point = pendingPin ?? value ?? routeOrigin ?? center ?? region;
            setSearchRegion(point ? {
              latitude: point.latitude, longitude: point.longitude,
              latitudeDelta: 0.012, longitudeDelta: 0.012,
            } : undefined);
            setOpen(true);
          }}
        >
          <Text style={styles.body}>{value?.address || t('vehicleRequest.searchAddress')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('vehicleRequest.currentLocation')}
          disabled={resolving}
          onPress={() => void locate()}
          style={styles.location}
        >
          <Text style={styles.locationIcon}>⌖</Text>
        </Pressable>
      </View>
      {error && !open ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t(error)}
        </Text>
      ) : null}
      <AddressPlaces value={resolving ? undefined : value} locationKind={locationKind} onSelect={(address) => {
        selectionId.current += 1;
        setResolving(false);
        setPendingPin(undefined);
        setError('');
        Keyboard.dismiss();
        focusAddress(address);
        onChange(address);
        setOpen(false);
      }} />
      {map(fillHeight)}
      <Modal
        visible={open}
        animationType="slide"
        onDismiss={() => {
          if (cameraTarget) mainMapRef.current?.animateToRegion(cameraTarget, 300);
        }}
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={[styles.modal, { direction: i18n.dir() }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{label}</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.body}>{t('vehicleRequest.close')}</Text>
            </Pressable>
          </View>
          <View style={styles.search}>
            <TextInput
              autoFocus
              returnKeyType="search"
              onSubmitEditing={() => { if (!resolving) void select(); }}
              accessibilityLabel={t('vehicleRequest.searchAddress')}
              placeholder={t('vehicleRequest.searchAddress')}
              placeholderTextColor="#98A2B3"
              value={query}
              onChangeText={(text) => {
                setQuery(text);
                setSuggestions([]);
                setBusy(text.trim().length >= 2);
              }}
              style={styles.searchText}
            />
          </View>
          {busy || resolving ? <ActivityIndicator color="#111827" /> : null}
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(error)}
            </Text>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.results}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('vehicleRequest.currentLocation')}
              accessibilityState={{ disabled: resolving, busy: resolving }}
              disabled={resolving}
              onPress={() => void locate()}
              style={styles.currentLocation}
            >
              <Text style={styles.locationIcon}>⌖</Text>
              <Text style={styles.currentLocationText}>
                {t('vehicleRequest.currentLocation')}
              </Text>
            </Pressable>
            {suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.placeId}
                disabled={resolving}
                onPress={() => void select(suggestion)}
                style={styles.result}
              >
                <Text style={styles.body}>{suggestion.description}</Text>
                {suggestion.distanceMeters !== undefined ? (
                  <Text style={styles.distance}>
                    {t('vehicleRequest.nearbyDistance', {
                      distance: (
                        suggestion.distanceMeters / 1000
                      ).toLocaleString(i18n.language, {
                        maximumFractionDigits: 1,
                      }),
                    })}
                  </Text>
                ) : null}
              </Pressable>
            ))}
            {!busy && query.length >= 2 && !suggestions.length && !error ? (
              <Text style={styles.body}>{t('vehicleRequest.noPlaces')}</Text>
            ) : null}
          </ScrollView>
          {open ? map(false, true) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { color: '#111827', fontSize: 14, lineHeight: 20 },
  section: { gap: 16 },
  fill: { flex: 1 },
  expandedMap: { flex: 1, height: undefined, minHeight: 100 },
  currentLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: '#FFC548',
  },
  currentLocationText: { flex: 1, color: '#111827', fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    backgroundColor: '#FFF',
    minHeight: 56,
  },
  searchText: { flex: 1, padding: 16, color: '#111827' },
  location: { padding: 12 },
  locationIcon: { fontSize: 26, color: '#111827' },
  invalid: { borderColor: '#C0392B', borderWidth: 2 },
  map: { height: 190, borderRadius: 14, overflow: 'hidden' },
  mapPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  mapLoading: {
    position: 'absolute', top: 12, right: 12, padding: 10,
    backgroundColor: '#FFF', borderRadius: 20,
  },
  address: { fontSize: 16, lineHeight: 24, color: '#111827' },
  modal: { flex: 1, padding: 20, gap: 16, backgroundColor: '#FFF' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 24, fontWeight: '800', color: '#111827' },
  results: { flex: 1 },
  result: {
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: '#E5E8EF',
    gap: 6,
  },
  distance: { color: '#68768A', fontSize: 12 },
  error: { color: '#C0392B' },
});
