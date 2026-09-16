import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/lib/auth-token';
import { getCustomerPlaces, removeCustomerPlace, saveCustomerPlace, type CustomerPlaces, type SavedPlace } from './customer-places';
import type { Address } from './vehicle-draft';

const samePoint = (a: Address, b: Address) => a.latitude.toFixed(6) === b.latitude.toFixed(6) && a.longitude.toFixed(6) === b.longitude.toFixed(6);

export function AddressPlaces(props: { value?: Address; onSelect: (address: Address) => void; locationKind: 'pickup' | 'dropoff' }) {
  const { user } = useAuthSession();
  // Remount account data immediately on account switches, including pending save dialogs.
  return user ? <AccountPlaces key={`${user.id}:${props.locationKind}`} {...props} /> : null;
}

function AccountPlaces({ value, onSelect, locationKind }: { value?: Address; onSelect: (address: Address) => void; locationKind: 'pickup' | 'dropoff' }) {
  const { t, i18n } = useTranslation();
  const [places, setPlaces] = useState<CustomerPlaces>({ saved: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState<Address>();
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState('');
  const alive = useRef(true);
  const mutation = useRef(false);
  const revision = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const version = revision.current;
    void getCustomerPlaces().then(data => {
      if (active) setPlaces(current => ({ ...data, saved: revision.current === version ? data.saved : current.saved }));
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry, locationKind]);

  const edit = (address: Address) => {
    setEditing(address);
    setLabel(places.saved.find(place => samePoint(place, address))?.label ?? '');
    setMutationError('');
  };
  const save = async () => {
    if (!editing || !label.trim() || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMutationError('');
    try {
      const saved = await saveCustomerPlace(editing, label.trim());
      if (!alive.current) return;
      revision.current += 1;
      setPlaces(current => ({ ...current, saved: [saved, ...current.saved.filter(place => place.id !== saved.id && !samePoint(place, saved))] }));
      setEditing(undefined);
    } catch { if (alive.current) setMutationError('places.saveError'); }
    finally { mutation.current = false; if (alive.current) setBusy(false); }
  };
  const remove = async (place: SavedPlace) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setMutationError('');
    try {
      await removeCustomerPlace(place.id);
      if (!alive.current) return;
      revision.current += 1;
      setPlaces(current => ({ ...current, saved: current.saved.filter(item => item.id !== place.id) }));
      setEditing(undefined);
    } catch { if (alive.current) setMutationError('places.removeError'); }
    finally { mutation.current = false; if (alive.current) setBusy(false); }
  };
  return <ScrollView style={styles.container} contentContainerStyle={styles.section} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
    <View style={styles.heading}>
      <Text style={styles.title}>{t('places.saved')}</Text>
      {value?.address ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => edit(value)} style={styles.action}>
        <Text style={styles.link}>{t(places.saved.some(place => samePoint(place, value)) ? 'places.editName' : 'places.saveAddress')}</Text>
      </Pressable> : null}
    </View>
    {loading ? <ActivityIndicator accessibilityLabel={t('places.loading')} /> : null}
    {loadError ? <Pressable accessibilityRole="button" onPress={() => { setLoading(true); setLoadError(false); setRetry(count => count + 1); }} style={styles.action}>
      <Text style={styles.error}>{t('places.loadError')}</Text>
    </Pressable> : null}
    {!loading && !loadError && !places.saved.length ? <Text style={styles.hint}>{t('places.empty')}</Text> : null}
    {places.saved.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.cards}>
      {places.saved.map(place => <View key={place.id} style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${place.label}, ${place.address}`} onPress={() => onSelect(place)} style={styles.cardSelect}>
          <Text numberOfLines={1} style={styles.title}>{place.label}</Text>
          <Text numberOfLines={2} style={styles.address}>{place.address}</Text>
        </Pressable>

      </View>)}
    </ScrollView> : null}
    {places.recent.length ? <>
      <Text style={styles.title}>{t('places.recent')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.cards}>
        {places.recent.map((place, index) => <Pressable key={index} accessibilityRole="button" accessibilityLabel={place.address} onPress={() => onSelect(place)} style={[styles.card, styles.cardSelect]}>
          <Text numberOfLines={2} style={styles.address}>{place.address}</Text>
        </Pressable>)}
      </ScrollView>
    </> : null}
    {mutationError && !editing ? <Text accessibilityRole="alert" style={styles.error}>{t(mutationError)}</Text> : null}
    <Modal visible={Boolean(editing)} transparent animationType="fade" onRequestClose={() => { if (!busy) setEditing(undefined); }}>
      <SafeAreaView style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContainer}>
            <View style={[styles.dialog, { direction: i18n.dir() }]}>
              <Text style={styles.title}>{t('places.saveAddress')}</Text>
              <Text style={styles.address}>{editing?.address}</Text>
              <TextInput autoFocus value={label} onChangeText={setLabel} maxLength={80} editable={!busy} placeholder={t('places.namePlaceholder')} accessibilityLabel={t('places.name')} style={styles.input} returnKeyType="done" onSubmitEditing={() => void save()} />
              {mutationError ? <Text accessibilityRole="alert" style={styles.error}>{t(mutationError)}</Text> : null}
              {editing && places.saved.find(place => samePoint(place, editing)) ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => {
                const saved = places.saved.find(place => samePoint(place, editing));
                if (saved) void remove(saved);
              }} style={styles.action}><Text style={styles.error}>{t('places.remove')}</Text></Pressable> : null}
              <View style={styles.heading}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => setEditing(undefined)} style={styles.action}><Text style={styles.link}>{t('places.cancel')}</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={busy || !label.trim()} onPress={() => void save()} style={[styles.save, (busy || !label.trim()) && styles.disabled]}>
                  {busy ? <ActivityIndicator /> : <Text style={styles.title}>{t('places.save')}</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  </ScrollView>;
}
const styles = StyleSheet.create({
  container: { maxHeight: 220, flexGrow: 0, flexShrink: 1 },
  section: { gap: 8 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: '#111827' },
  hint: { fontSize: 12, color: '#68768A' },
  address: { fontSize: 13, color: '#374151', lineHeight: 18 },
  cards: { gap: 8 },
  card: { width: 180, borderRadius: 12, borderWidth: 1, borderColor: '#D9DFE8', backgroundColor: '#FFF' },
  cardSelect: { padding: 10, gap: 4, minHeight: 56 },
  remove: { paddingHorizontal: 10, minHeight: 44, justifyContent: 'center' },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { fontSize: 13, color: '#2458A6', fontWeight: '600' },
  error: { fontSize: 13, color: '#C0392B' },
  overlay: { flex: 1, backgroundColor: '#0008' },
  keyboard: { flex: 1 },
  dialogContainer: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#FFF', padding: 20, borderRadius: 16, gap: 16 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#D9DFE8', borderRadius: 10, padding: 12, color: '#111827' },
  save: { minHeight: 48, minWidth: 90, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFC548', borderRadius: 10 },
  disabled: { opacity: 0.45 },
});
