import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  FlatList,
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
import type { VehicleDraft } from './vehicle-draft';
import { RegistrationScan } from './registration-scan';
import { SCAN_FORM_FIELDS, sameVehicle } from './registration-mapping';

export function ChoiceField({
  label,
  value,
  options,
  onChange,
  invalid = false,
  disabled = false,
  loading = false,
  onSearchChange,
  searchHint,
  error = false,
  onRetry,
  displayValue,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onSearchChange?: (query: string) => void;
  searchHint?: string;
  error?: boolean;
  onRetry?: () => void;
  displayValue?: string;
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
        accessibilityState={{ disabled, expanded: open, busy: loading }}
        disabled={disabled}
        style={[styles.input, disabled && styles.disabled, invalid && styles.invalid]}
        onPress={() => {
          setQuery('');
          onSearchChange?.('');
          setOpen(true);
        }}
      >
        {loading ? <ActivityIndicator color="#111827" /> : <Text style={styles.body}>
          {options.find((option) => option.value === value)?.label ||
            displayValue ||
            value ||
            t('vehicleRequest.select')}
        </Text>}
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
            onChangeText={(text) => { setQuery(text); onSearchChange?.(text); }}
            maxLength={80}
            accessibilityLabel={t('vehicleRequest.search')}
            placeholder={t('vehicleRequest.search')}
          />
          {searchHint ? <Text style={styles.body}>{searchHint}</Text> : null}
          <FlatList
            keyboardShouldPersistTaps="handled"
            data={loading || error ? [] : options
              .filter((option) =>
                option.label
                  .toLocaleLowerCase()
                  .replace(/\s/g, '')
                  .includes(query.toLocaleLowerCase().replace(/\s/g, '')),
              )}
            keyExtractor={(option) => option.value}
            ListEmptyComponent={loading ? <ActivityIndicator accessibilityLabel={t('vehicleRequest.catalogLoading')} /> : (
              <View style={styles.field}>
                <Text accessibilityLiveRegion="polite" style={styles.body}>{t(error ? 'vehicleRequest.catalogUnavailable' : 'vehicleRequest.catalogEmpty')}</Text>
                {error && onRetry ? <Pressable style={styles.lookup} onPress={onRetry}><Text style={styles.buttonText}>{t('vehicleRequest.catalogRetry')}</Text></Pressable> : null}
              </View>
            )}
            renderItem={({ item: option }) => (
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
              )}
          />
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
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [brandError, setBrandError] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [loadedModelContext, setLoadedModelContext] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const modelContext = value.brandId ? `${value.brandId}:${modelSearch}` : '';
  const retryCatalog = () => {
    setBrandsLoading(true);
    setBrandError(false);
    setModelsLoading(Boolean(value.brandId));
    setModelError(false);
    setCatalogRetry((count) => count + 1);
  };
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [lookupMode, setLookupMode] = useState<'vin' | 'registration'>(
    value.registration ? 'registration' : 'vin',
  );
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const patch = (change: Partial<VehicleDraft['vehicle']>) => {
    const next = { ...latest.current, ...change, fieldSources: { ...latest.current.fieldSources } };
    for (const name of SCAN_FORM_FIELDS) if (name in change) next.fieldSources[name] = 'MANUAL';
    if (SCAN_FORM_FIELDS.some(name => name in change)) next.source = 'MANUAL';
    latest.current = next;
    onChange(next);
  };
  useEffect(() => {
    let active = true;
    void getVehicleBrands()
      .then((result) => {
        if (active) setBrands(result);
      })
      .catch(() => {
        if (active) { setBrandError(true); setMessage('vehicleRequest.catalogUnavailable'); }
      })
      .finally(() => { if (active) setBrandsLoading(false); });
    return () => {
      active = false;
    };
  }, [catalogRetry]);
  useEffect(() => {
    let active = true;
    if (!value.brandId) return () => { active = false; };
    let retryTimer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const loadModels = async () => {
      try {
        const result = await getVehicleModels(value.brandId, modelSearch);
        if (!active) return;
        setModels(result.filter((model) => !model.brandId || model.brandId === value.brandId));
        setMessage((current) => current === 'vehicleRequest.catalogUnavailable' ? '' : current);
        setModelsLoading(false);
        setLoadedModelContext(`${value.brandId}:${modelSearch}`);
      } catch (error) {
        if (!active) return;
        const status = (error as { status?: number }).status;
        if (attempts < 1 && (status === undefined || status === 429 || status >= 500)) {
          attempts += 1;
          retryTimer = setTimeout(() => { void loadModels(); }, 400);
          return;
        }
        setModelError(true);
        setMessage('vehicleRequest.catalogUnavailable');
        setModelsLoading(false);
        setLoadedModelContext(`${value.brandId}:${modelSearch}`);
      }
    };
    const timer = setTimeout(() => {
      setModels([]);
      setModelError(false);
      setModelsLoading(true);
      void loadModels();
    }, modelSearch ? 350 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(retryTimer);
    };
  }, [value.brandId, modelSearch, catalogRetry]);
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
    const searchedVehicle = { ...latest.current };
    try {
      const result = await decodeVehicleVin(vin, { swissRegistrationNumber });
      if (
        latest.current.vin !== searchedVin ||
        latest.current.registration !== searchedRegistration
        || !sameVehicle(latest.current, searchedVehicle)
      )
        return;
      if (!result.brand && !result.model) {
        setMessage('vehicleRequest.lookupUnavailable');
        return;
      }
      const providerChange: Partial<VehicleDraft['vehicle']> = {
        brand: result.brand ?? '',
        model: result.model ?? '',
        brandId: '',
        modelId: '',
        year: result.manufactureYear ? String(result.manufactureYear) : '',
        weight: result.estimatedWeightKg
          ? String(result.estimatedWeightKg)
          : '',
        source: 'VIN_API',
        manual: false,
        ...(result.vin && /^[A-HJ-NPR-Z0-9]{17}$/.test(result.vin)
          ? { vin: result.vin }
          : {}),
      };
      const sources = { ...latest.current.fieldSources };
      const preserveExisting = latest.current.registrationScanApplied;
      // Provider fallback fills gaps after a card scan without replacing confirmed details.
      for (const name of SCAN_FORM_FIELDS) {
        if (name in providerChange) {
          if (preserveExisting && latest.current[name]) delete providerChange[name];
          else sources[name] = 'VIN_API';
        }
      }
      if (preserveExisting && latest.current.brand && latest.current.model) {
        delete providerChange.brandId; delete providerChange.modelId; delete providerChange.manual;
      }
      if (preserveExisting && latest.current.brand) {
        delete providerChange.brandId;
        // A provider model for a different make cannot fill this dependent selector.
        if (result.brand?.trim().toLocaleLowerCase() !== latest.current.brand.trim().toLocaleLowerCase()) {
          delete providerChange.model; delete providerChange.modelId; delete providerChange.manual;
        }
      }
      if (!SCAN_FORM_FIELDS.some(name => name in providerChange && providerChange[name])) delete providerChange.source;
      const next = { ...latest.current, ...providerChange, fieldSources: sources };
      latest.current = next;
      onChange(next);
      setMessage('vehicleRequest.checkLookup');
    } catch {
      setMessage('vehicleRequest.lookupUnavailable');
    } finally {
      setLoading(false);
    }
  };
  const field = (
    name: 'vin' | 'registration' | 'year' | 'weight',
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
      <RegistrationScan value={value} brands={brands} onApply={(next) => { latest.current = next; onChange(next); }} />
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
        {field('vin', 'vehicleRequest.vin')}
        {field('registration', 'vehicleRequest.registration', true)}
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
        <Text style={styles.label}>{t('vehicleRequest.manualMode')}</Text>
        <ChoiceField
          label={t('vehicleRequest.brand')}
          value={value.brandId || value.brand}
          displayValue={value.brand}
          invalid={errors.includes('brand')}
          loading={brandsLoading}
          disabled={loading}
          error={brandError}
          onRetry={retryCatalog}
          options={brands.map((brand) => ({
            value: brand.id,
            label: brand.name,
          }))}
          onChange={(id) => {
            if (id === value.brandId) return;
            setModels([]);
            setModelSearch('');
            patch({
              brandId: id,
              brand: brands.find((brand) => brand.id === id)?.name ?? '',
              modelId: '',
              model: '',
              manual: false,
              source: 'MANUAL',
            });
          }}
        />
        <ChoiceField
          label={t('vehicleRequest.model')}
          value={value.modelId || value.model}
          displayValue={value.model}
          invalid={errors.includes('model')}
          disabled={!value.brandId || loading}
          loading={Boolean(value.brandId) && (modelsLoading || loadedModelContext !== modelContext)}
          error={modelError}
          onRetry={retryCatalog}
          onSearchChange={value.brandId.startsWith('sci:') ? (query) => {
            if (query !== modelSearch) { setModels([]); setModelsLoading(true); setModelSearch(query); }
          } : undefined}
          searchHint={value.brandId.startsWith('sci:') ? t('vehicleRequest.modelSearchHint') : undefined}
          options={models.map((model) => ({
            value: model.id,
            label: model.name,
          }))}
          onChange={(id) =>
            patch({
              modelId: id,
              model: models.find((model) => model.id === id)?.name ?? '',
              manual: false,
              source: 'MANUAL',
            })
          }
        />
        {(value.brandId.startsWith('sci:') || brands.some((brand) => brand.id.startsWith('sci:'))) ? <Text style={styles.body}>{t('vehicleRequest.catalogSource')}</Text> : null}
        {field('weight', 'vehicleRequest.weight', true)}
        {field('year', 'vehicleRequest.year', true)}
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
  disabled: { backgroundColor: '#F4F6F8', opacity: 0.65 },
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
  modal: { flex: 1, padding: 20, gap: 20, backgroundColor: '#FFF' },
  buttonText: { color: '#111827', fontWeight: '700' },
  heading: { color: '#111827', fontSize: 20, fontWeight: '700' },
  option: { paddingVertical: 18, borderBottomWidth: 1, borderColor: '#E5E8EF' },
});
