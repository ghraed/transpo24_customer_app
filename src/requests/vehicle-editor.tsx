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
  decodeVehicleVin,
  getVehicleBrands,
  getVehicleModels,
} from '@/lib/api';
import type { VehicleCatalogBrand, VehicleCatalogModel } from '@/types/vehicle';
import {
  normalizeBodyType,
  normalizeTransmission,
  type VehicleDraft,
} from './vehicle-draft';

export const BODY_TYPES = [
  'SEDAN',
  'HATCHBACK',
  'ESTATE',
  'SUV',
  'VAN',
  'PICKUP',
  'COUPE',
  'CONVERTIBLE',
  'OTHER',
];
export function ChoiceField({
  label,
  value,
  options,
  onChange,
  invalid = false,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.input, invalid && styles.invalid]}
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        <Text style={styles.body}>
          {options.find((option) => option.value === value)?.label ||
            value ||
            t('vehicleRequest.select')}
        </Text>
      </Pressable>
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="slide"
      >
        <SafeAreaView style={[styles.modal, { direction: i18n.dir() }]}>
          <View style={styles.row}>
            <Text style={styles.heading}>{label}</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.body}>{t('vehicleRequest.close')}</Text>
            </Pressable>
          </View>
          <TextInput
            autoFocus
            style={styles.input}
            placeholderTextColor="#98A2B3"
            value={query}
            onChangeText={setQuery}
            accessibilityLabel={t('vehicleRequest.search')}
            placeholder={t('vehicleRequest.search')}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {options
              .filter((option) =>
                option.label
                  .toLocaleLowerCase()
                  .includes(query.toLocaleLowerCase()),
              )
              .map((option) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: value === option.value }}
                  style={styles.option}
                  key={option.value}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.body}>{option.label}</Text>
                </Pressable>
              ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function VehicleEditor({
  value,
  onChange,
  errors,
}: {
  value: VehicleDraft['vehicle'];
  onChange: (value: VehicleDraft['vehicle']) => void;
  errors: string[];
}) {
  const { t } = useTranslation();
  const [brands, setBrands] = useState<VehicleCatalogBrand[]>([]);
  const [models, setModels] = useState<VehicleCatalogModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [lookupMode, setLookupMode] = useState<'vin' | 'registration'>(
    value.registration ? 'registration' : 'vin',
  );
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const patch = (change: Partial<VehicleDraft['vehicle']>) =>
    onChange({ ...latest.current, ...change });
  useEffect(() => {
    let active = true;
    void getVehicleBrands()
      .then((result) => {
        if (active) setBrands(result);
      })
      .catch(() => {
        if (active) setMessage('vehicleRequest.catalogUnavailable');
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (value.brandId)
      void getVehicleModels(value.brandId)
        .then((result) => {
          if (active) setModels(result);
        })
        .catch(() => {
          if (active) setMessage('vehicleRequest.catalogUnavailable');
        });
    return () => {
      active = false;
    };
  }, [value.brandId]);
  const lookup = async () => {
    if (lookupMode === 'vin' && !/^[A-HJ-NPR-Z0-9]{17}$/.test(value.vin)) {
      setMessage('vehicleRequest.errorVin');
      return;
    }
    if (
      lookupMode === 'registration' &&
      !/^\d{9}$/.test(value.registration.replace(/\D/g, ''))
    ) {
      setMessage('vehicleRequest.errorRegistration');
      return;
    }
    setLoading(true);
    setMessage('');
    // Preserve the combined lookup: Swiss records can need the VIN to
    // distinguish multiple matches for the same registration number.
    const vin = /^[A-HJ-NPR-Z0-9]{17}$/.test(value.vin) ? value.vin : '';
    const registration = value.registration.replace(/\D/g, '');
    const swissRegistrationNumber = /^\d{9}$/.test(registration)
      ? registration
      : undefined;
    const searchedVin = value.vin;
    const searchedRegistration = value.registration;
    try {
      const result = await decodeVehicleVin(vin, { swissRegistrationNumber });
      if (
        latest.current.vin !== searchedVin ||
        latest.current.registration !== searchedRegistration
      )
        return;
      if (!result.brand && !result.model) {
        setMessage('vehicleRequest.lookupUnavailable');
        return;
      }
      patch({
        brand: result.brand ?? '',
        model: result.model ?? '',
        brandId: '',
        modelId: '',
        year: result.manufactureYear ? String(result.manufactureYear) : '',
        weight: result.estimatedWeightKg
          ? String(result.estimatedWeightKg)
          : '',
        bodyType: normalizeBodyType(result.bodyType),
        transmission: normalizeTransmission(result.transmissionStyle),
        source: 'VIN_API',
        manual: false,
        ...(result.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(result.vin)
          ? { vin: result.vin }
          : {}),
      });
      setMessage('vehicleRequest.checkLookup');
    } catch {
      setMessage('vehicleRequest.lookupUnavailable');
    } finally {
      setLoading(false);
    }
  };
  const field = (
    name: 'vin' | 'registration' | 'brand' | 'model' | 'year' | 'weight',
    label: string,
    numeric = false,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{t(label)}</Text>
      <TextInput
        testID={`vehicle-${name}`}
        accessibilityLabel={t(label)}
        style={[styles.input, errors.includes(name) && styles.invalid]}
        value={value[name]}
        editable={!loading}
        onChangeText={(text) =>
          patch({
            [name]:
              name === 'vin'
                ? text.replace(/\s/g, '').toUpperCase()
                : name === 'weight'
                  ? text.replace(',', '.')
                  : text,
          })
        }
        autoCapitalize={name === 'vin' ? 'characters' : 'sentences'}
        keyboardType={numeric ? 'numeric' : 'default'}
        maxLength={name === 'vin' ? 17 : name === 'year' ? 4 : 120}
      />
    </View>
  );
  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.row}>
          {(['vin', 'registration'] as const).map((mode) => (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ selected: lookupMode === mode }}
              onPress={() => setLookupMode(mode)}
              style={[styles.pill, lookupMode === mode && styles.selected]}
            >
              <Text style={styles.body}>
                {t(
                  mode === 'vin'
                    ? 'vehicleRequest.vin'
                    : 'vehicleRequest.registration',
                )}
              </Text>
            </Pressable>
          ))}
        </View>
        {lookupMode === 'vin'
          ? field('vin', 'vehicleRequest.vin')
          : field('registration', 'vehicleRequest.registration', true)}
        <Pressable
          disabled={loading}
          onPress={() => void lookup()}
          style={styles.lookup}
        >
          {loading ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={styles.buttonText}>{t('vehicleRequest.lookup')}</Text>
          )}
        </Pressable>
        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.body}>{t(message)}</Text>
        ) : null}
      </View>
      <View style={styles.card}>
        {value.manual ? (
          <>
            {field('brand', 'vehicleRequest.brand')}
            {field('model', 'vehicleRequest.model')}
          </>
        ) : (
          <>
            <ChoiceField
              label={t('vehicleRequest.brand')}
              value={value.brandId || value.brand}
              invalid={errors.includes('brand')}
              options={brands.map((brand) => ({
                value: brand.id,
                label: brand.name,
              }))}
              onChange={(id) => {
                setModels([]);
                patch({
                  brandId: id,
                  brand: brands.find((brand) => brand.id === id)?.name ?? '',
                  modelId: '',
                  model: '',
                  source: 'MANUAL',
                });
              }}
            />
            <ChoiceField
              label={t('vehicleRequest.model')}
              value={value.modelId || value.model}
              invalid={errors.includes('model')}
              options={models.map((model) => ({
                value: model.id,
                label: model.name,
              }))}
              onChange={(id) =>
                patch({
                  modelId: id,
                  model: models.find((model) => model.id === id)?.name ?? '',
                  source: 'MANUAL',
                })
              }
            />
          </>
        )}
        <Pressable
          onPress={() => patch({ manual: !value.manual, source: 'MANUAL' })}
        >
          <Text style={styles.link}>
            {t(
              value.manual
                ? 'vehicleRequest.useCatalog'
                : 'vehicleRequest.manualEntry',
            )}
          </Text>
        </Pressable>
        <ChoiceField
          label={t('vehicleRequest.bodyType')}
          value={value.bodyType}
          invalid={errors.includes('bodyType')}
          options={BODY_TYPES.map((type) => ({
            value: type,
            label: t(`vehicleRequest.body.${type}`),
          }))}
          onChange={(bodyType) => patch({ bodyType })}
        />
        <ChoiceField
          label={t('vehicleRequest.transmission')}
          value={value.transmission}
          invalid={errors.includes('transmission')}
          options={['MANUAL', 'AUTOMATIC', 'OTHER'].map((type) => ({
            value: type,
            label: t(`vehicleRequest.transmissionType.${type}`),
          }))}
          onChange={(transmission) => patch({ transmission })}
        />
        {field('year', 'vehicleRequest.year', true)}
        {field('weight', 'vehicleRequest.weight', true)}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { color: '#111827', fontSize: 14, lineHeight: 20 },
  section: { gap: 16 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 16,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 14,
    borderRadius: 14,
    backgroundColor: '#FFF',
    color: '#111827',
    minHeight: 50,
  },
  invalid: { borderColor: '#C0392B', borderWidth: 2 },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: { flex: 1, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: '#D9DFE8', backgroundColor: '#FFF' },
  selected: { backgroundColor: '#FFC548', borderColor: '#FFC548' },
  lookup: {
    padding: 14,
    backgroundColor: '#FFC548',
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
  },
  link: { color: '#111827', fontWeight: '600', paddingVertical: 8 },
  modal: { flex: 1, padding: 20, gap: 20, backgroundColor: '#FFF' },
  buttonText: { color: '#111827', fontWeight: '700' },
  heading: { color: '#111827', fontSize: 20, fontWeight: '700' },
  option: { paddingVertical: 18, borderBottomWidth: 1, borderColor: '#E5E8EF' },
});
