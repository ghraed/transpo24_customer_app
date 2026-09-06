import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
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
import type { Address } from './vehicle-draft';
import { resolveCurrentAddress } from './resolve-current-address';

export function AddressEditor({
  value,
  onChange,
  countryCode,
  label,
  invalid,
  fillHeight = false,
}: {
  value?: Address;
  onChange: (address: Address | undefined) => void;
  countryCode?: string | null;
  label: string;
  invalid: boolean;
  fillHeight?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Camera state is independent of the selected pin, as in the original page.
  const [region, setRegion] = useState<Region>(() => value
    ? { latitude: value.latitude, longitude: value.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }
    : { latitude: 0, longitude: 0, latitudeDelta: 120, longitudeDelta: 300 });
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
    if (center && !value && selectionId.current === 0 && !mapInteracted.current) {
      setRegion({ ...center, latitudeDelta: 0.2, longitudeDelta: 0.2 });
    }
  }, [center, value]);
  const focusAddress = (address: Address) => {
    setRegion({ latitude: address.latitude, longitude: address.longitude,
      latitudeDelta: 0.012, longitudeDelta: 0.012 });
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
  const select = async (suggestion: PlaceAutocompleteSuggestion) => {
    const id = ++selectionId.current;
    setResolving(true);
    setError('');
    try {
      const address = await fetchPlaceDetails(suggestion.placeId, session.current);
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
  const map = (expanded = false) =>
    isNativeMapRuntimeAvailable ? (
      <View style={[styles.map, expanded && styles.expandedMap]}>
        <NativeMapView
          provider={PROVIDER_GOOGLE}
          onPress={(event: MapPressEvent) => void movePin(event)}
          onPanDrag={() => { mapInteracted.current = true; }}
          onRegionChangeComplete={setRegion}
          style={StyleSheet.absoluteFill}
          region={region}
        >
          {pendingPin || value ? <NativeMarker coordinate={pendingPin ?? value} /> : null}
        </NativeMapView>
        {resolving ? (
          <View pointerEvents="none" style={styles.mapLoading}>
            <ActivityIndicator color="#111827" />
          </View>
        ) : null}
      </View>
    ) : null;

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
      {map(fillHeight)}
      <Modal
        visible={open}
        animationType="slide"
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
          {map()}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { color: '#111827', fontSize: 14, lineHeight: 20 },
  section: { gap: 16 },
  fill: { flex: 1 },
  expandedMap: { flex: 1, height: undefined, minHeight: 190 },
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
