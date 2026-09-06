import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
} from '@/components/native-maps';
import {
  fetchPlaceDetails,
  getAccountCountryCenter,
  reverseGeocodeCoordinates,
  searchPlacesAutocomplete,
  type PlaceAutocompleteSuggestion,
} from '@/lib/places';
import type { Address } from './vehicle-draft';

export function AddressEditor({
  value,
  onChange,
  countryCode,
  label,
  invalid,
}: {
  value?: Address;
  onChange: (address: Address) => void;
  countryCode?: string | null;
  label: string;
  invalid: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
    setResolving(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError('vehicleRequest.locationPermission');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCenter(position.coords);
      const address = await reverseGeocodeCoordinates(
        position.coords.latitude,
        position.coords.longitude,
      );
      if (!address) throw new Error();
      onChange(address);
      setOpen(false);
    } catch {
      setError('vehicleRequest.locationUnavailable');
    } finally {
      setResolving(false);
    }
  };
  const select = async (suggestion: PlaceAutocompleteSuggestion) => {
    setResolving(true);
    setError('');
    try {
      onChange(await fetchPlaceDetails(suggestion.placeId, session.current));
      setOpen(false);
    } catch {
      setError('vehicleRequest.searchUnavailable');
    } finally {
      setResolving(false);
    }
  };
  const map = (point?: { latitude: number; longitude: number }) =>
    isNativeMapRuntimeAvailable ? (
      <NativeMapView
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        region={
          point
            ? {
                ...point,
                latitudeDelta: value ? 0.012 : 0.2,
                longitudeDelta: value ? 0.012 : 0.2,
              }
            : {
                latitude: 0,
                longitude: 0,
                latitudeDelta: 120,
                longitudeDelta: 300,
              }
        }
      >
        {value ? <NativeMarker coordinate={value} /> : null}
      </NativeMapView>
    ) : null;

  return (
    <View style={styles.section}>
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
      {resolving ? <ActivityIndicator color="#111827" /> : null}
      {error && !open ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t(error)}
        </Text>
      ) : null}
      {map(value ?? center)}
      {value ? <Text style={styles.address}>{value.address}</Text> : null}
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
            <Pressable
              accessibilityLabel={t('vehicleRequest.currentLocation')}
              disabled={resolving}
              onPress={() => void locate()}
              style={styles.location}
            >
              <Text style={styles.locationIcon}>⌖</Text>
            </Pressable>
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
          {map(center)}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { color: '#111827', fontSize: 14, lineHeight: 20 },
  section: { gap: 16 },
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
  map: { height: 190, borderRadius: 14 },
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
