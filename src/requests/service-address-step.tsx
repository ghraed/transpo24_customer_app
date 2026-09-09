import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/lib/auth-token';
import { getDrivingDistance } from '@/lib/places';
import { AddressEditor } from './address-editor';
import { MotorcycleProgress } from './motorcycle-progress';
import type { Address } from './vehicle-draft';

const DETAIL_KEYS: Record<string, string> = {
  MOTORCYCLE_TRANSPORT: 'pendingMotorcycleDetails',
  GOODS_TRANSPORT: 'pendingGoodsDetails',
  FURNITURE_TRANSPORT: 'pendingFurnitureDetails',
};
export function usesSharedAddressStep(serviceKey?: string) {
  return Boolean(serviceKey && Object.hasOwn(DETAIL_KEYS, serviceKey));
}
function readAddress(params: Record<string, string>, kind: 'pickup' | 'dropoff'): Address | undefined {
  const latitude = params[`${kind}Latitude`];
  const longitude = params[`${kind}Longitude`];
  if (!latitude || !longitude) return undefined;
  const point = { latitude: Number(latitude), longitude: Number(longitude) };
  if (!Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
      !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180) return undefined;
  return { ...point, address: params[`${kind}Address`] || '', placeId: params[`${kind}PlaceId`] || undefined };
}

// All non-car transport drafts use the same address editor and only submit
// after the existing final review. Carry every detail/photo parameter forward.
export function ServiceAddressStep({ kind }: { kind: 'pickup' | 'dropoff' }) {
  const rawParams = useLocalSearchParams();
  const params = Object.fromEntries(Object.entries(rawParams).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ));
  const router = useRouter();
  const { t } = useTranslation();
  const { user } = useAuthSession();
  const [address, setAddress] = useState(() => readAddress(params, kind));
  const pickup = readAddress(params, 'pickup');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigating = useRef(false);
  const [distance, setDistance] = useState<{ key: string; km: number }>();
  const routeKey = kind === 'dropoff' && pickup && address
    ? `${pickup.latitude},${pickup.longitude}:${address.latitude},${address.longitude}` : '';
  const pickupLatitude = pickup?.latitude;
  const pickupLongitude = pickup?.longitude;
  const dropoffLatitude = address?.latitude;
  const dropoffLongitude = address?.longitude;
  useEffect(() => {
    if (!routeKey || pickupLatitude === undefined || pickupLongitude === undefined ||
        dropoffLatitude === undefined || dropoffLongitude === undefined) return;
    const abort = new AbortController();
    void getDrivingDistance(
      { latitude: pickupLatitude, longitude: pickupLongitude },
      { latitude: dropoffLatitude, longitude: dropoffLongitude },
      abort.signal,
    ).then((km) => {
      if (!abort.signal.aborted) setDistance({ key: routeKey, km });
    }).catch(() => { /* Distance is optional; address confirmation remains available. */ });
    return () => abort.abort();
  }, [routeKey, pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude]);

  const confirm = () => {
    if (!address || navigating.current) return;
    if (!params.serviceId) {
      setError('Missing selected service. Please go back and choose a service first.');
      return;
    }
    try {
      const details = JSON.parse(params[DETAIL_KEYS[params.serviceKey]] || 'null');
      if (!details || typeof details !== 'object' || Array.isArray(details)) throw new Error();
    } catch {
      setError('Transport details are missing. Please go back and complete them first.');
      return;
    }
    if (kind === 'dropoff' && !pickup) {
      setError('Please select a pickup location first.');
      return;
    }
    if (kind === 'dropoff' && pickup?.latitude === address.latitude && pickup.longitude === address.longitude) {
      setError('vehicleRequest.errorSameAddress');
      return;
    }
    navigating.current = true;
    setBusy(true);
    try {
      router.push({
        pathname: kind === 'pickup' ? '/dropoff-location' : '/submit-request',
        params: {
          ...params,
          [`${kind}Latitude`]: String(address.latitude),
          [`${kind}Longitude`]: String(address.longitude),
          [`${kind}Address`]: address.address,
          [`${kind}PlaceId`]: address.placeId ?? '',
          routeDistanceKm: distance?.key === routeKey ? String(distance.km) : '',
        },
      } as Href);
    } finally {
      navigating.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.screen}>
      {params.serviceKey === 'MOTORCYCLE_TRANSPORT' ? <MotorcycleProgress current={kind === 'pickup' ? 4 : 5} /> : null}
      <Text style={styles.title}>{t(`vehicleRequest.step.${kind}`)}</Text>
      <View style={styles.editor}>
        <AddressEditor
          fillHeight
          locationKind={kind}
          pickupLocation={kind === 'dropoff' ? pickup : undefined}
          value={address}
          countryCode={user?.countryCode}
          label={t(`vehicleRequest.step.${kind}`)}
          invalid={Boolean(error) && !address}
          onChange={(next) => { setAddress(next); setError(''); }}
        />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={!address || busy}
        style={[styles.confirm, (!address || busy) && styles.disabled]}
        onPress={confirm}
      >
        {busy ? <ActivityIndicator color="#111827" /> : <Text style={styles.confirmText}>
          {t(kind === 'pickup' ? 'Confirm pickup address' : 'Confirm delivery address')}
        </Text>}
      </Pressable>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 12, backgroundColor: '#FAFAFA', gap: 16 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800', color: '#111827' },
  editor: { flex: 1 },
  confirm: { minHeight: 56, borderRadius: 16, backgroundColor: '#FFC548', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  disabled: { opacity: 0.45 },
  confirmText: { fontSize: 16, fontWeight: '700', color: '#111827' },
  error: { color: '#C0392B', fontSize: 14 },
});
