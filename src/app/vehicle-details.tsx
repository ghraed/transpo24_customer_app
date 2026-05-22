import { useRouter } from 'expo-router';
import { useLocalSearchParams, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  decodeVehicleVin,
  getVehicleBrands,
  getVehicleModels,
  getVehicleSeries,
  getVehicleYears,
} from '@/lib/api';
import type {
  VehicleCatalogBrand,
  VehicleCatalogModel,
  VehicleCatalogSeries,
  VehicleCatalogYearOption,
  VehicleDetailsFormValues,
} from '@/types/vehicle';

type RouteParams = {
  serviceId?: string;
  serviceKey?: string;
};

const BODY_TYPE_OPTIONS: SearchableOption[] = [
  { id: 'Sedan', label: 'Sedan' },
  { id: 'SUV', label: 'SUV' },
  { id: 'Hatchback', label: 'Hatchback' },
  { id: 'Coupe', label: 'Coupe' },
  { id: 'Convertible', label: 'Convertible' },
  { id: 'Pickup Truck', label: 'Pickup Truck' },
  { id: 'Van', label: 'Van' },
  { id: 'Minivan', label: 'Minivan' },
  { id: 'Wagon / Estate', label: 'Wagon / Estate' },
  { id: 'Crossover', label: 'Crossover' },
  { id: 'Roadster', label: 'Roadster' },
  { id: 'Truck', label: 'Truck' },
  { id: 'Motorcycle', label: 'Motorcycle' },
  { id: 'Scooter', label: 'Scooter' },
];

function toNumericOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

type SearchableOption = {
  id: string;
  label: string;
};

function SearchableDropdown(props: {
  label: string;
  placeholder: string;
  options: SearchableOption[];
  valueLabel: string;
  isOpen: boolean;
  searchText: string;
  onToggle: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (option: SearchableOption) => void;
  disabled?: boolean;
}) {
  const isInactive = Boolean(props.disabled) || props.options.length === 0;
  return (
    <View>
      <Text style={styles.label}>{props.label}</Text>
      <Pressable
        style={[styles.dropdownButton, isInactive && styles.dropdownDisabled]}
        onPress={props.onToggle}
        disabled={isInactive}
      >
        <Text style={props.valueLabel ? styles.dropdownValue : styles.dropdownPlaceholder}>
          {props.valueLabel || props.placeholder}
        </Text>
        <Text style={styles.dropdownChevron}>{props.isOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {props.isOpen ? (
        <View style={styles.dropdownPanel}>
          <TextInput
            value={props.searchText}
            onChangeText={props.onSearchChange}
            placeholder="Search..."
            placeholderTextColor="#98a2b3"
            style={styles.dropdownSearch}
          />
          <ScrollView style={styles.dropdownList} nestedScrollEnabled>
            {props.options.length === 0 ? (
              <Text style={styles.emptyText}>No results</Text>
            ) : (
              props.options.map((option) => (
                <Pressable key={option.id} style={styles.dropdownItem} onPress={() => props.onSelect(option)}>
                  <Text style={styles.dropdownItemText}>{option.label}</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export default function VehicleDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey : '';

  const [form, setForm] = useState<VehicleDetailsFormValues>({
    vin: '',
    brandName: '',
    modelName: '',
    seriesName: '',
    variantName: '',
    manufactureYear: undefined,
    estimatedWeightKg: undefined,
    bodyType: '',
    source: 'MANUAL',
  });

  const [brands, setBrands] = useState<VehicleCatalogBrand[]>([]);
  const [models, setModels] = useState<VehicleCatalogModel[]>([]);
  const [series, setSeries] = useState<VehicleCatalogSeries[]>([]);
  const [years, setYears] = useState<VehicleCatalogYearOption[]>([]);

  const [isLoadingBrands, setIsLoadingBrands] = useState<boolean>(true);
  const [isDecodingVin, setIsDecodingVin] = useState<boolean>(false);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [isLoadingSeries, setIsLoadingSeries] = useState<boolean>(false);
  const [isLoadingYears, setIsLoadingYears] = useState<boolean>(false);

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [fallbackMessage, setFallbackMessage] = useState<string>('');
  const [brandSearch, setBrandSearch] = useState<string>('');
  const [modelSearch, setModelSearch] = useState<string>('');
  const [seriesSearch, setSeriesSearch] = useState<string>('');
  const [yearSearch, setYearSearch] = useState<string>('');
  const [bodyTypeSearch, setBodyTypeSearch] = useState<string>('');
  const [openDropdown, setOpenDropdown] = useState<'brand' | 'model' | 'series' | 'year' | 'bodyType' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingBrands(true);
      try {
        const list = await getVehicleBrands();
        if (!cancelled) setBrands(list);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Failed to load vehicle brands.');
      } finally {
        if (!cancelled) setIsLoadingBrands(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const pickBrand = useCallback(async (brand: VehicleCatalogBrand) => {
    setForm((prev) => ({
      ...prev,
      brandId: brand.id,
      brandName: brand.name,
      modelId: undefined,
      modelName: '',
      seriesId: undefined,
      seriesName: '',
      manufactureYear: undefined,
    }));
    setModels([]);
    setSeries([]);
    setYears([]);
    setIsLoadingModels(true);
    setOpenDropdown(null);
    setErrorMessage('');
    try {
      const list = await getVehicleModels(brand.id);
      setModels(list);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load vehicle models.');
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  const pickModel = useCallback(async (model: VehicleCatalogModel) => {
    setForm((prev) => ({
      ...prev,
      modelId: model.id,
      modelName: model.name,
      seriesId: undefined,
      seriesName: '',
      manufactureYear: undefined,
    }));
    setSeries([]);
    setYears([]);
    setIsLoadingSeries(true);
    setOpenDropdown(null);
    setErrorMessage('');
    try {
      const list = await getVehicleSeries(model.id);
      setSeries(list);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load vehicle series.');
    } finally {
      setIsLoadingSeries(false);
    }
  }, []);

  const pickSeries = useCallback(async (nextSeries: VehicleCatalogSeries) => {
    setForm((prev) => ({
      ...prev,
      seriesId: nextSeries.id,
      seriesName: nextSeries.name,
      manufactureYear: undefined,
    }));
    setYears([]);
    setIsLoadingYears(true);
    setOpenDropdown(null);
    setErrorMessage('');
    try {
      const list = await getVehicleYears(nextSeries.id);
      setYears(list);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load vehicle years.');
    } finally {
      setIsLoadingYears(false);
    }
  }, []);

  const yearOptions = useMemo(() => {
    const rawYears =
      years.length > 0
        ? years.map((item) => item.year)
        : Array.from({ length: 37 }, (_, idx) => new Date().getFullYear() - idx);
    return Array.from(new Set(rawYears))
      .filter((year) => Number.isFinite(year))
      .sort((a, b) => b - a)
      .map((year) => ({ id: String(year), label: String(year) }));
  }, [years]);

  const filteredBrandOptions = useMemo(
    () =>
      brands
        .filter((brand) => brand.name.toLowerCase().includes(brandSearch.trim().toLowerCase()))
        .map((brand) => ({ id: brand.id, label: brand.name })),
    [brandSearch, brands],
  );

  const filteredModelOptions = useMemo(
    () =>
      models
        .filter((model) => model.name.toLowerCase().includes(modelSearch.trim().toLowerCase()))
        .map((model) => ({ id: model.id, label: model.name })),
    [modelSearch, models],
  );

  const filteredSeriesOptions = useMemo(
    () =>
      series
        .filter((seriesItem) => seriesItem.name.toLowerCase().includes(seriesSearch.trim().toLowerCase()))
        .map((seriesItem) => ({ id: seriesItem.id, label: seriesItem.name })),
    [series, seriesSearch],
  );

  const filteredYearOptions = useMemo(
    () => yearOptions.filter((year) => year.label.includes(yearSearch.trim())),
    [yearOptions, yearSearch],
  );

  const filteredBodyTypeOptions = useMemo(
    () =>
      BODY_TYPE_OPTIONS.filter((item) =>
        item.label.toLowerCase().includes(bodyTypeSearch.trim().toLowerCase()),
      ),
    [bodyTypeSearch],
  );

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const nowYear = new Date().getFullYear();

    if (form.vin?.trim()) {
      const vinLength = form.vin.trim().length;
      if (vinLength < 6 || vinLength > 32) {
        errors.push('VIN/chassis number must be between 6 and 32 characters.');
      }
    }

    if (!form.brandName.trim()) errors.push('Vehicle brand is required.');
    if (!form.modelName.trim()) errors.push('Vehicle model is required.');

    if (!form.manufactureYear) {
      errors.push('Manufacture year is required.');
    } else if (form.manufactureYear > nowYear) {
      errors.push('Manufacture year cannot be in the future.');
    }

    if (!form.estimatedWeightKg) {
      errors.push('Estimated weight is required.');
    } else if (form.estimatedWeightKg <= 0) {
      errors.push('Estimated weight must be a positive number.');
    }

    return errors;
  }, [form]);

  const decodeVin = useCallback(async () => {
    const vin = form.vin?.trim();
    if (!vin) {
      setFallbackMessage('');
      return;
    }

    const vinLength = vin.length;
    if (vinLength < 6 || vinLength > 32) {
      setFallbackMessage('VIN/chassis number must be between 6 and 32 characters.');
      return;
    }

    setIsDecodingVin(true);
    setFallbackMessage('');
    setErrorMessage('');
    setOpenDropdown(null);

    setForm((prev) => ({
      ...prev,
      brandId: undefined,
      brandName: '',
      modelId: undefined,
      modelName: '',
      seriesId: undefined,
      seriesName: '',
      variantName: '',
      manufactureYear: undefined,
      estimatedWeightKg: undefined,
      bodyType: '',
      source: 'MANUAL',
    }));
    setModels([]);
    setSeries([]);
    setYears([]);

    try {
      const decoded = await decodeVehicleVin(vin);
      const hasUsefulData = Boolean(decoded.brand || decoded.model || decoded.manufactureYear || decoded.estimatedWeightKg);

      if (!hasUsefulData) {
        setFallbackMessage('We could not fetch vehicle details from the VIN. Please select the vehicle details manually.');
        return;
      }

      setForm((prev) => ({
        ...prev,
        vin,
        brandName: decoded.brand ?? prev.brandName,
        modelName: decoded.model ?? prev.modelName,
        seriesName: decoded.series ?? prev.seriesName,
        variantName: decoded.variant ?? prev.variantName,
        manufactureYear: decoded.manufactureYear ?? prev.manufactureYear,
        estimatedWeightKg:
          decoded.estimatedWeightKg && decoded.estimatedWeightKg > 0
            ? decoded.estimatedWeightKg
            : prev.estimatedWeightKg,
        bodyType: decoded.bodyType ?? prev.bodyType,
        source: 'VIN_API',
      }));

      if (decoded.brand) {
        const decodedBrand = normalizeForMatch(decoded.brand);
        const matchedBrand = brands.find(
          (brand) => normalizeForMatch(brand.name) === decodedBrand,
        );
        if (matchedBrand) {
          await pickBrand(matchedBrand);

          if (decoded.model) {
            const decodedModel = normalizeForMatch(decoded.model);
            const loadedModels = await getVehicleModels(matchedBrand.id);
            setModels(loadedModels);
            const matchedModel =
              loadedModels.find(
                (model) => normalizeForMatch(model.name) === decodedModel,
              ) ??
              loadedModels.find((model) =>
                normalizeForMatch(model.name).includes(decodedModel),
              ) ??
              loadedModels.find((model) =>
                decodedModel.includes(normalizeForMatch(model.name)),
              );
            if (matchedModel) {
              await pickModel(matchedModel);
              setForm((prev) => ({ ...prev, modelName: matchedModel.name }));

              const decodedSeriesRaw = decoded.series ?? decoded.variant ?? '';
              if (decodedSeriesRaw) {
                const decodedSeries = normalizeForMatch(decodedSeriesRaw);
                const loadedSeries = await getVehicleSeries(matchedModel.id);
                setSeries(loadedSeries);
                const matchedSeries =
                  loadedSeries.find(
                    (seriesItem) =>
                      normalizeForMatch(seriesItem.name) === decodedSeries ||
                      normalizeForMatch(seriesItem.variantName ?? '') === decodedSeries,
                  ) ??
                  loadedSeries.find(
                    (seriesItem) =>
                      normalizeForMatch(seriesItem.name).includes(decodedSeries) ||
                      normalizeForMatch(seriesItem.variantName ?? '').includes(decodedSeries),
                  ) ??
                  loadedSeries.find(
                    (seriesItem) =>
                      decodedSeries.includes(normalizeForMatch(seriesItem.name)) ||
                      decodedSeries.includes(normalizeForMatch(seriesItem.variantName ?? '')),
                  );
                if (matchedSeries) {
                  await pickSeries(matchedSeries);
                  setForm((prev) => ({
                    ...prev,
                    seriesName: matchedSeries.name,
                    variantName: decoded.variant ?? matchedSeries.variantName ?? prev.variantName,
                    bodyType: decoded.bodyType ?? matchedSeries.bodyType ?? prev.bodyType,
                    estimatedWeightKg:
                      decoded.estimatedWeightKg && decoded.estimatedWeightKg > 0
                        ? decoded.estimatedWeightKg
                        : matchedSeries.estimatedWeightKg ?? prev.estimatedWeightKg,
                  }));

                  if (decoded.manufactureYear) {
                    const loadedYears = await getVehicleYears(matchedSeries.id);
                    setYears(loadedYears);
                    const matchedYear = loadedYears.find(
                      (yearOption) => yearOption.year === decoded.manufactureYear,
                    );
                    setForm((prev) => ({
                      ...prev,
                      manufactureYear: matchedYear?.year ?? decoded.manufactureYear ?? prev.manufactureYear,
                    }));
                  }
                } else if (decoded.manufactureYear) {
                  setForm((prev) => ({
                    ...prev,
                    seriesName: decodedSeriesRaw || prev.seriesName,
                    variantName: decoded.variant ?? prev.variantName,
                    manufactureYear: decoded.manufactureYear,
                  }));
                } else {
                  setForm((prev) => ({
                    ...prev,
                    seriesName: decodedSeriesRaw || prev.seriesName,
                    variantName: decoded.variant ?? prev.variantName,
                  }));
                }
              } else if (decoded.manufactureYear) {
                setForm((prev) => ({ ...prev, manufactureYear: decoded.manufactureYear }));
              }
            }
          }
        } else if (decoded.manufactureYear) {
          setForm((prev) => ({ ...prev, manufactureYear: decoded.manufactureYear }));
        }
      } else if (decoded.manufactureYear) {
        setForm((prev) => ({ ...prev, manufactureYear: decoded.manufactureYear }));
      }
    } catch {
      setFallbackMessage('We could not fetch vehicle details from the VIN. Please select the vehicle details manually.');
    } finally {
      setIsDecodingVin(false);
    }
  }, [brands, form.vin, pickBrand, pickModel, pickSeries]);

  const canContinue = validationErrors.length === 0 && !isDecodingVin;

  const onContinue = useCallback(() => {
    if (!canContinue) {
      setErrorMessage(validationErrors[0] ?? 'Please complete the vehicle details.');
      return;
    }

    const nextParams = {
      serviceId,
      serviceKey,
      vehicleDetails: JSON.stringify({
        vehicleVin: form.vin?.trim() || undefined,
        vehicleBrand: form.brandName.trim(),
        vehicleModel: form.modelName.trim(),
        vehicleSeries: form.seriesName?.trim() || undefined,
        vehicleVariant: form.variantName?.trim() || undefined,
        vehicleManufactureYear: form.manufactureYear,
        vehicleEstimatedWeightKg: form.estimatedWeightKg,
        vehicleBodyType: form.bodyType?.trim() || undefined,
        vehicleDataSource: form.source,
      }),
    };

    router.push({
      pathname: '/pickup-location',
      params: nextParams,
    } as unknown as Href);
  }, [canContinue, form, router, serviceId, serviceKey, validationErrors]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Vehicle Details</Text>
      <Text style={styles.subtitle}>Add your vehicle details before choosing pickup location.</Text>

      <Text style={styles.label}>VIN / Chassis Number (optional)</Text>
      <View style={styles.vinInputRow}>
        <TextInput
          value={form.vin ?? ''}
          onChangeText={(value) => setForm((prev) => ({ ...prev, vin: value }))}
          placeholder="Enter VIN or chassis number"
          placeholderTextColor="#98a2b3"
          style={styles.vinInput}
          autoCapitalize="characters"
        />
        {form.vin?.trim() ? (
          <Pressable
            style={styles.clearVinButton}
            onPress={() => {
              setForm((prev) => ({ ...prev, vin: '' }));
              setFallbackMessage('');
              setErrorMessage('');
            }}
          >
            <Text style={styles.clearVinText}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable style={styles.secondaryButton} onPress={() => void decodeVin()} disabled={isDecodingVin}>
        {isDecodingVin ? <ActivityIndicator color="#1a73e8" /> : <Text style={styles.secondaryButtonText}>Decode VIN</Text>}
      </Pressable>

      {fallbackMessage ? <Text style={styles.warning}>{fallbackMessage}</Text> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {isLoadingBrands ? <ActivityIndicator color="#1a73e8" style={styles.loader} /> : null}

      <Text style={styles.sectionTitle}>Manual Vehicle Selection</Text>
      <SearchableDropdown
        label="Vehicle Brand"
        placeholder="Select brand"
        options={filteredBrandOptions}
        valueLabel={form.brandName}
        isOpen={openDropdown === 'brand'}
        searchText={brandSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'brand' ? null : 'brand'))}
        onSearchChange={setBrandSearch}
        onSelect={(option) => {
          const selected = brands.find((brand) => brand.id === option.id);
          if (selected) void pickBrand(selected);
        }}
        disabled={isLoadingBrands}
      />
      {!isLoadingBrands && brands.length === 0 ? (
        <View>
          <Text style={styles.label}>Vehicle Brand (manual)</Text>
          <TextInput
            value={form.brandName}
            onChangeText={(value) => setForm((prev) => ({ ...prev, brandName: value, brandId: undefined }))}
            placeholder="Type vehicle brand"
            placeholderTextColor="#98a2b3"
            style={styles.input}
          />
        </View>
      ) : null}

      {isLoadingModels ? <ActivityIndicator color="#1a73e8" style={styles.loader} /> : null}
      <SearchableDropdown
        label="Vehicle Model"
        placeholder="Select model"
        options={filteredModelOptions}
        valueLabel={form.modelName}
        isOpen={openDropdown === 'model'}
        searchText={modelSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'model' ? null : 'model'))}
        onSearchChange={setModelSearch}
        onSelect={(option) => {
          const selected = models.find((model) => model.id === option.id);
          if (selected) void pickModel(selected);
        }}
        disabled={isLoadingModels}
      />
      {!isLoadingModels && models.length === 0 ? (
        <View>
          <Text style={styles.label}>Vehicle Model (manual)</Text>
          <TextInput
            value={form.modelName}
            onChangeText={(value) => setForm((prev) => ({ ...prev, modelName: value, modelId: undefined }))}
            placeholder="Type vehicle model"
            placeholderTextColor="#98a2b3"
            style={styles.input}
          />
        </View>
      ) : null}

      {isLoadingSeries ? <ActivityIndicator color="#1a73e8" style={styles.loader} /> : null}
      <SearchableDropdown
        label="Vehicle Series / Variant (optional)"
        placeholder="Select series"
        options={filteredSeriesOptions}
        valueLabel={form.seriesName ?? ''}
        isOpen={openDropdown === 'series'}
        searchText={seriesSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'series' ? null : 'series'))}
        onSearchChange={setSeriesSearch}
        onSelect={(option) => {
          const selected = series.find((seriesItem) => seriesItem.id === option.id);
          if (selected) void pickSeries(selected);
        }}
        disabled={isLoadingSeries}
      />
      {!isLoadingSeries && series.length === 0 ? (
        <View>
          <Text style={styles.label}>Series / Variant (manual)</Text>
          <TextInput
            value={form.seriesName ?? ''}
            onChangeText={(value) => setForm((prev) => ({ ...prev, seriesName: value }))}
            placeholder="Type series or variant"
            placeholderTextColor="#98a2b3"
            style={styles.input}
          />
        </View>
      ) : null}

      {isLoadingYears ? <ActivityIndicator color="#1a73e8" style={styles.loader} /> : null}
      <SearchableDropdown
        label="Manufacture Year"
        placeholder="Select year"
        options={filteredYearOptions}
        valueLabel={form.manufactureYear ? String(form.manufactureYear) : ''}
        isOpen={openDropdown === 'year'}
        searchText={yearSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'year' ? null : 'year'))}
        onSearchChange={setYearSearch}
        onSelect={(option) => {
          const year = Number(option.id);
          if (Number.isFinite(year)) {
            setForm((prev) => ({ ...prev, manufactureYear: year }));
            setOpenDropdown(null);
          }
        }}
        disabled={false}
      />

      <Text style={styles.label}>Estimated Weight (kg)</Text>
      <TextInput
        value={form.estimatedWeightKg ? String(form.estimatedWeightKg) : ''}
        onChangeText={(value) => setForm((prev) => ({ ...prev, estimatedWeightKg: toNumericOrUndefined(value) }))}
        placeholder="Estimated vehicle weight in kg"
        placeholderTextColor="#98a2b3"
        style={styles.input}
        keyboardType="decimal-pad"
      />

      <SearchableDropdown
        label="Body Type"
        placeholder="Select body type"
        options={filteredBodyTypeOptions}
        valueLabel={form.bodyType ?? ''}
        isOpen={openDropdown === 'bodyType'}
        searchText={bodyTypeSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'bodyType' ? null : 'bodyType'))}
        onSearchChange={setBodyTypeSearch}
        onSelect={(option) => {
          setForm((prev) => ({ ...prev, bodyType: option.label }));
          setOpenDropdown(null);
        }}
      />

      <Text style={styles.label}>Variant (optional)</Text>
      <TextInput
        value={form.variantName ?? ''}
        onChangeText={(value) => setForm((prev) => ({ ...prev, variantName: value }))}
        placeholder="Trim / variant"
        placeholderTextColor="#98a2b3"
        style={styles.input}
      />

      <Pressable
        style={[styles.continueButton, !canContinue && styles.continueDisabled]}
        onPress={onContinue}
        disabled={!canContinue}
      >
        <Text style={styles.continueText}>Continue to Pickup Location</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f7f9fc',
    paddingBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    fontSize: 15,
    color: '#475467',
    marginTop: 4,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginVertical: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
  vinInputRow: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  vinInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
  clearVinButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f4f7',
  },
  clearVinText: {
    color: '#475467',
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownDisabled: {
    opacity: 0.5,
  },
  dropdownValue: {
    color: '#111827',
    fontSize: 14,
  },
  dropdownPlaceholder: {
    color: '#98a2b3',
    fontSize: 14,
  },
  dropdownChevron: {
    color: '#667085',
    fontSize: 12,
  },
  dropdownPanel: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    marginTop: 6,
    overflow: 'hidden',
  },
  dropdownSearch: {
    borderBottomWidth: 1,
    borderBottomColor: '#eaecf0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
  dropdownList: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f4f7',
  },
  dropdownItemText: {
    color: '#111827',
    fontSize: 14,
  },
  emptyText: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#667085',
    fontSize: 13,
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7fbff',
  },
  secondaryButtonText: {
    color: '#1a73e8',
    fontWeight: '700',
  },
  loader: {
    marginTop: 8,
  },
  warning: {
    color: '#b54708',
    marginTop: 10,
  },
  error: {
    color: '#b42318',
    marginTop: 10,
  },
  continueButton: {
    marginTop: 20,
    height: 50,
    borderRadius: 12,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
