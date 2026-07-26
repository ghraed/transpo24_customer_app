import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useLocalSearchParams, type Href } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  decodeVehicleVin,
  getVehicleBrands,
  getVehicleModels,
  getVehicleSeries,
  getVehicleYears,
} from '@/lib/api';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import type { ItemType, LocalPhotoAsset, UpdateScheduleAndItemDetailsPayload } from '@/types/customer-request';
import type {
  VehicleCatalogBrand,
  VehicleCatalogModel,
  VehicleCatalogSeries,
  VehicleCatalogYearOption,
  VehicleDetailsFormValues,
  VehicleDetailsPayload,
} from '@/types/vehicle';
import {
  getVinValidationMessage,
  INVALID_VIN_MESSAGE,
  normalizeVinInput,
  sanitizeVin,
  VIN_DECODE_EMPTY_RESULT_MESSAGE,
  VIN_DECODE_NETWORK_ERROR_MESSAGE,
} from '@/utils/vin';

type RouteParams = {
  serviceId?: string;
  serviceKey?: string;
};

type VehicleRequestForm = {
  isImmediate: boolean;
  scheduledPickupAt: Date;
  itemTitle: string;
  itemDescription?: string;
  requiresLoadingHelp: boolean;
  loadingWorkersCount?: string;
  specialInstructions?: string;
};

const MAX_PHOTOS = 8;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function hasDecodedVehicleData(input: {
  make?: string;
  model?: string;
  year?: string;
  trim?: string;
  bodyClass?: string;
  vehicleType?: string;
  manufactureYear?: number;
  estimatedWeightKg?: number;
}): boolean {
  return Boolean(
    input.make ||
      input.model ||
      input.year ||
      input.trim ||
      input.bodyClass ||
      input.vehicleType ||
      input.manufactureYear ||
      input.estimatedWeightKg,
  );
}

function inferMimeType(uri: string): string | undefined {
  const normalized = uri.toLowerCase();
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return undefined;
}

function mapPickerAssetToLocalPhoto(asset: ImagePicker.ImagePickerAsset): LocalPhotoAsset {
  const mimeType = asset.mimeType ?? inferMimeType(asset.uri);
  return {
    uri: asset.uri,
    fileName: asset.fileName ?? undefined,
    mimeType: mimeType ?? undefined,
    fileSize: asset.fileSize ?? undefined,
    width: asset.width,
    height: asset.height,
  };
}

function buildDefaultScheduledPickupAt(): Date {
  return new Date(Date.now() + 60 * 60 * 1000);
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

function IconSymbol({
  name,
  color,
  size = 20,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

export default function VehicleDetailsScreen() {
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const [requestForm, setRequestForm] = useState<VehicleRequestForm>(() => ({
    isImmediate: false,
    scheduledPickupAt: buildDefaultScheduledPickupAt(),
    itemTitle: '',
    itemDescription: '',
    requiresLoadingHelp: false,
    loadingWorkersCount: '',
    specialInstructions: '',
  }));
  const [selectedPhotos, setSelectedPhotos] = useState<LocalPhotoAsset[]>([]);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);

  const isVehicleTransport = serviceKey === 'VEHICLE_TRANSPORT';

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

  const normalizedVin = useMemo(() => sanitizeVin(form.vin ?? ''), [form.vin]);
  const vinValidationMessage = useMemo(
    () => (normalizedVin ? getVinValidationMessage(normalizedVin) : null),
    [normalizedVin],
  );
  const canDecodeVin = normalizedVin.length > 0 && !vinValidationMessage && !isDecodingVin;

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const nowYear = new Date().getFullYear();
    if (normalizedVin) {
      const vinError = getVinValidationMessage(normalizedVin);
      if (vinError) {
        errors.push(vinError);
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

    if (isVehicleTransport) {
      if (!requestForm.isImmediate) {
        if (!requestForm.scheduledPickupAt) {
          errors.push('Please select pickup date and time.');
        }
      }

      if (requestForm.requiresLoadingHelp) {
        const workers = parsePositiveInteger(requestForm.loadingWorkersCount);
        if (workers === undefined || workers <= 0) {
          errors.push('Loading workers count must be a positive number.');
        }
      }

      if (selectedPhotos.length > MAX_PHOTOS) {
        errors.push(`You can upload up to ${MAX_PHOTOS} photos.`);
      }

      selectedPhotos.forEach((photo, index) => {
        const mimeType = photo.mimeType ?? inferMimeType(photo.uri);
        if (mimeType && !ALLOWED_MIME_TYPES.has(mimeType)) {
          errors.push(`Photo ${index + 1} has unsupported format.`);
        }
        if (photo.fileSize && photo.fileSize > MAX_FILE_SIZE_BYTES) {
          errors.push(`Photo ${index + 1} is larger than 5 MB.`);
        }
      });
    }

    return errors;
  }, [form, isVehicleTransport, normalizedVin, requestForm.isImmediate, requestForm.loadingWorkersCount, requestForm.requiresLoadingHelp, requestForm.scheduledPickupAt, selectedPhotos]);

  const decodeVin = useCallback(async () => {
    const vin = sanitizeVin(form.vin ?? '');
    if (!vin) {
      setFallbackMessage(INVALID_VIN_MESSAGE);
      return;
    }

    const vinError = getVinValidationMessage(vin);
    if (vinError) {
      setFallbackMessage(vinError);
      return;
    }

    setIsDecodingVin(true);
    setFallbackMessage('');
    setErrorMessage('');
    setOpenDropdown(null);

    try {
      const decoded = await decodeVehicleVin(vin);
      const hasUsefulData = hasDecodedVehicleData(decoded);

      if (!hasUsefulData) {
        setFallbackMessage(VIN_DECODE_EMPTY_RESULT_MESSAGE);
        return;
      }

      const shouldResolveBrand = !form.brandName.trim() && Boolean(decoded.make);
      const shouldResolveModel = !form.modelName.trim() && Boolean(decoded.model);
      const shouldResolveSeries = !form.seriesName?.trim() && Boolean(decoded.series ?? decoded.trim);

      let matchedBrand: VehicleCatalogBrand | undefined;
      let loadedModels: VehicleCatalogModel[] = [];
      let matchedModel: VehicleCatalogModel | undefined;
      let loadedSeries: VehicleCatalogSeries[] = [];
      let matchedSeries: VehicleCatalogSeries | undefined;
      let loadedYears: VehicleCatalogYearOption[] = [];

      if (shouldResolveBrand && decoded.make) {
        const decodedBrand = normalizeForMatch(decoded.make);
        matchedBrand = brands.find(
          (brand) => normalizeForMatch(brand.name) === decodedBrand,
        );
      }

      if (matchedBrand) {
        await pickBrand(matchedBrand);
        loadedModels = await getVehicleModels(matchedBrand.id);
        setModels(loadedModels);
      }

      if (shouldResolveModel && decoded.model && loadedModels.length > 0) {
        const decodedModel = normalizeForMatch(decoded.model);
        matchedModel =
          loadedModels.find(
            (model) => normalizeForMatch(model.name) === decodedModel,
          ) ??
          loadedModels.find((model) =>
            normalizeForMatch(model.name).includes(decodedModel),
          ) ??
          loadedModels.find((model) =>
            decodedModel.includes(normalizeForMatch(model.name)),
          );
      }

      if (matchedModel) {
        await pickModel(matchedModel);
        loadedSeries = await getVehicleSeries(matchedModel.id);
        setSeries(loadedSeries);
      }

      if (shouldResolveSeries && loadedSeries.length > 0) {
        const decodedSeriesRaw = decoded.series ?? decoded.trim ?? '';
        const decodedSeries = normalizeForMatch(decodedSeriesRaw);
        matchedSeries =
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
      }

      if (matchedSeries) {
        await pickSeries(matchedSeries);
        loadedYears = await getVehicleYears(matchedSeries.id);
        setYears(loadedYears);
      }

      setForm((prev) => ({
        ...prev,
        vin,
        brandId: prev.brandId ?? matchedBrand?.id,
        brandName: prev.brandName.trim() ? prev.brandName : decoded.make ?? prev.brandName,
        modelId: prev.modelId ?? matchedModel?.id,
        modelName: prev.modelName.trim() ? prev.modelName : decoded.model ?? prev.modelName,
        seriesId: prev.seriesId ?? matchedSeries?.id,
        seriesName:
          prev.seriesName?.trim()
            ? prev.seriesName
            : matchedSeries?.name ??
              decoded.series ??
              decoded.variant ??
              decoded.trim ??
              prev.seriesName,
        variantName:
          prev.variantName?.trim()
            ? prev.variantName
            : decoded.variant ??
              decoded.trim ??
              matchedSeries?.variantName ??
              prev.variantName,
        manufactureYear:
          prev.manufactureYear ??
          (decoded.manufactureYear &&
          loadedYears.length > 0 &&
          !loadedYears.some((yearOption) => yearOption.year === decoded.manufactureYear)
            ? undefined
            : decoded.manufactureYear),
        estimatedWeightKg:
          prev.estimatedWeightKg && prev.estimatedWeightKg > 0
            ? prev.estimatedWeightKg
            : decoded.estimatedWeightKg && decoded.estimatedWeightKg > 0
              ? decoded.estimatedWeightKg
              : matchedSeries?.estimatedWeightKg ?? prev.estimatedWeightKg,
        bodyType:
          prev.bodyType?.trim()
            ? prev.bodyType
            : decoded.bodyClass ?? decoded.bodyType ?? matchedSeries?.bodyType ?? prev.bodyType,
        source: 'VIN_API',
      }));
    } catch {
      setFallbackMessage(VIN_DECODE_NETWORK_ERROR_MESSAGE);
    } finally {
      setIsDecodingVin(false);
    }
  }, [
    brands,
    form.brandName,
    form.modelName,
    form.seriesName,
    form.vin,
    pickBrand,
    pickModel,
    pickSeries,
  ]);

  const canContinue = validationErrors.length === 0 && !isDecodingVin;

  const pickFromLibrary = useCallback(async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setErrorMessage('Media library permission is needed to select photos.');
      return;
    }

    const remainingSlots = MAX_PHOTOS - selectedPhotos.length;
    if (remainingSlots <= 0) {
      setErrorMessage(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ['images'],
      quality: 0.9,
      selectionLimit: remainingSlots,
    });

    if (result.canceled) return;

    const nextPhotos = result.assets.map(mapPickerAssetToLocalPhoto);
    setSelectedPhotos((prev) => [...prev, ...nextPhotos].slice(0, MAX_PHOTOS));
    setErrorMessage('');
  }, [selectedPhotos.length]);

  const takePhoto = useCallback(async (): Promise<void> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setErrorMessage('Camera permission is needed to take photos.');
      return;
    }

    const remainingSlots = MAX_PHOTOS - selectedPhotos.length;
    if (remainingSlots <= 0) {
      setErrorMessage(`You can upload up to ${MAX_PHOTOS} photos.`);
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });

    if (result.canceled) return;

    const nextPhoto = mapPickerAssetToLocalPhoto(result.assets[0]);
    setSelectedPhotos((prev) => [...prev, nextPhoto].slice(0, MAX_PHOTOS));
    setErrorMessage('');
  }, [selectedPhotos.length]);

  const removePhoto = useCallback((index: number): void => {
    setSelectedPhotos((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const onContinue = useCallback(() => {
    if (!canContinue) {
      setErrorMessage(validationErrors[0] ?? 'Please complete the vehicle details.');
      return;
    }

    if (!requestForm.isImmediate && requestForm.scheduledPickupAt.getTime() <= Date.now()) {
      setErrorMessage('Scheduled pickup must be in the future.');
      return;
    }

    const nextParams = {
      serviceId,
      serviceKey,
      vehicleDetails: JSON.stringify({
        vehicleVin: normalizedVin || undefined,
        vehicleBrand: form.brandName.trim(),
        vehicleModel: form.modelName.trim(),
        vehicleSeries: form.seriesName?.trim() || undefined,
        vehicleVariant: form.variantName?.trim() || undefined,
        vehicleManufactureYear: form.manufactureYear,
        vehicleEstimatedWeightKg: form.estimatedWeightKg,
        vehicleBodyType: form.bodyType?.trim() || undefined,
        vehicleDataSource: form.source,
      } satisfies VehicleDetailsPayload),
      pendingRequestDetails: isVehicleTransport
        ? JSON.stringify({
            isImmediate: requestForm.isImmediate,
            scheduledPickupAt:
              requestForm.isImmediate || !requestForm.scheduledPickupAt
                ? undefined
                : requestForm.scheduledPickupAt.toISOString(),
            itemTitle:
              requestForm.itemTitle.trim() ||
              [form.brandName.trim(), form.modelName.trim(), form.manufactureYear ? String(form.manufactureYear) : '']
                .filter(Boolean)
                .join(' '),
            itemDescription: requestForm.itemDescription?.trim() || undefined,
            itemType: 'VEHICLE' as ItemType,
            itemBrand: form.brandName.trim(),
            itemModel: form.modelName.trim(),
            itemYear: form.manufactureYear,
            vehicleVin: normalizedVin || undefined,
            vehicleBrand: form.brandName.trim(),
            vehicleModel: form.modelName.trim(),
            vehicleSeries: form.seriesName?.trim() || undefined,
            vehicleVariant: form.variantName?.trim() || undefined,
            vehicleManufactureYear: form.manufactureYear,
            vehicleEstimatedWeightKg: form.estimatedWeightKg,
            vehicleBodyType: form.bodyType?.trim() || undefined,
            vehicleDataSource: form.source,
            itemWeightKg: form.estimatedWeightKg,
            requiresLoadingHelp: requestForm.requiresLoadingHelp,
            loadingWorkersCount: requestForm.requiresLoadingHelp
              ? parsePositiveInteger(requestForm.loadingWorkersCount)
              : undefined,
            specialInstructions: requestForm.specialInstructions?.trim() || undefined,
          } satisfies UpdateScheduleAndItemDetailsPayload)
        : '',
      pendingPhotoAssets: isVehicleTransport ? JSON.stringify(selectedPhotos) : '',
    };

    router.push({
      pathname: '/vehicle-condition',
      params: nextParams,
    } as unknown as Href);
  }, [canContinue, form, isVehicleTransport, normalizedVin, requestForm, router, selectedPhotos, serviceId, serviceKey, validationErrors]);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            {
              paddingTop: Math.max(10, insets.top + 4),
              paddingBottom: Math.max(30, insets.bottom + 18) + keyboardInset,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
      <View style={styles.heroBlock}>
        <Text style={styles.title}>Tell us about the vehicle</Text>
        <Text style={styles.subtitle}>
          {isVehicleTransport
            ? 'Add the vehicle, pickup timing and photos before choosing the route.'
            : 'Add the vehicle details before choosing pickup location.'}
        </Text>
      </View>

      <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>VIN / Chassis</Text>
      <Text style={styles.sectionHint}>Use VIN decode if you want us to prefill the details automatically.</Text>
      <View style={styles.vinInputRow}>
        <TextInput
          value={form.vin ?? ''}
          onChangeText={(value) => {
            setForm((prev) => ({ ...prev, vin: normalizeVinInput(value) }));
            setFallbackMessage('');
            setErrorMessage('');
          }}
          placeholder="Enter 17-character VIN"
          placeholderTextColor="#98a2b3"
          style={styles.vinInput}
          autoCapitalize="characters"
        />
        {form.vin?.trim() ? (
          <Pressable
            style={styles.clearVinButton}
            onPress={() => {
              setForm({
                vin: '',
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
              });
              setModels([]);
              setSeries([]);
              setYears([]);
              setFallbackMessage('');
              setErrorMessage('');
            }}
          >
            <Text style={styles.clearVinText}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        style={[styles.secondaryButton, !canDecodeVin && styles.secondaryButtonDisabled]}
        onPress={() => void decodeVin()}
        disabled={!canDecodeVin}
      >
        {isDecodingVin ? <ActivityIndicator color="#111827" /> : <Text style={styles.secondaryButtonText}>Decode VIN</Text>}
      </Pressable>

      {fallbackMessage ? <Text style={styles.warning}>{fallbackMessage}</Text> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {isLoadingBrands ? <ActivityIndicator color="#111827" style={styles.loader} /> : null}
      </View>

      <View style={styles.sectionCard}>
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

      {isLoadingModels ? <ActivityIndicator color="#111827" style={styles.loader} /> : null}
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

      {isLoadingSeries ? <ActivityIndicator color="#111827" style={styles.loader} /> : null}
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

      {isLoadingYears ? <ActivityIndicator color="#111827" style={styles.loader} /> : null}
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
      </View>

      {isVehicleTransport ? (
        <>
          <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.optionChip, requestForm.isImmediate && styles.optionChipActive]}
              onPress={() => setRequestForm((prev) => ({ ...prev, isImmediate: true }))}
            >
              <Text style={[styles.optionChipText, requestForm.isImmediate && styles.optionChipTextActive]}>
                Immediate pickup
              </Text>
            </Pressable>
            <Pressable
              style={[styles.optionChip, !requestForm.isImmediate && styles.optionChipActive]}
              onPress={() => setRequestForm((prev) => ({ ...prev, isImmediate: false }))}
            >
              <Text style={[styles.optionChipText, !requestForm.isImmediate && styles.optionChipTextActive]}>
                Schedule for later
              </Text>
            </Pressable>
          </View>

          {!requestForm.isImmediate ? (
            <View style={styles.datetimeContainer}>
              <Pressable style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.pickerButtonLabel}>Pickup Date</Text>
                <Text style={styles.pickerButtonValue}>
                  {requestForm.scheduledPickupAt
                    ? requestForm.scheduledPickupAt.toLocaleDateString()
                    : 'Select date'}
                </Text>
              </Pressable>
              <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.pickerButtonLabel}>Pickup Time</Text>
                <Text style={styles.pickerButtonValue}>
                  {requestForm.scheduledPickupAt
                    ? requestForm.scheduledPickupAt.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Select time'}
                </Text>
              </Pressable>
            </View>
          ) : null}
          </View>

          <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Request Details</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Transport Title</Text>
            <TextInput
              value={requestForm.itemTitle}
              onChangeText={(value) => setRequestForm((prev) => ({ ...prev, itemTitle: value }))}
              placeholder="Transport title (optional)"
              placeholderTextColor="#98a2b3"
              style={styles.input}
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Extra Details</Text>
            <TextInput
              value={requestForm.itemDescription ?? ''}
              onChangeText={(value) => setRequestForm((prev) => ({ ...prev, itemDescription: value }))}
              placeholder="Extra details for the driver (optional)"
              placeholderTextColor="#98a2b3"
              style={[styles.input, styles.textarea]}
              multiline
            />
          </View>
          <View style={[styles.switchRow, styles.fieldRow]}>
            <Text style={styles.switchLabel}>Requires loading help</Text>
            <Pressable
              style={[styles.switchChip, requestForm.requiresLoadingHelp && styles.switchChipActive]}
              onPress={() =>
                setRequestForm((prev) => ({
                  ...prev,
                  requiresLoadingHelp: !prev.requiresLoadingHelp,
                  loadingWorkersCount: prev.requiresLoadingHelp ? '' : prev.loadingWorkersCount,
                }))
              }
            >
              <Text
                style={[
                  styles.switchChipText,
                  requestForm.requiresLoadingHelp && styles.switchChipTextActive,
                ]}
              >
                {requestForm.requiresLoadingHelp ? 'Yes' : 'No'}
              </Text>
            </Pressable>
          </View>
          {requestForm.requiresLoadingHelp ? (
            <View style={styles.fieldRow}>
              <Text style={styles.label}>Loading Workers Count</Text>
              <TextInput
                value={requestForm.loadingWorkersCount ?? ''}
                onChangeText={(value) =>
                  setRequestForm((prev) => ({ ...prev, loadingWorkersCount: value }))
                }
                placeholder="Loading workers count"
                placeholderTextColor="#98a2b3"
                style={styles.input}
                keyboardType="number-pad"
              />
            </View>
          ) : null}
          <View style={styles.fieldRow}>
            <Text style={styles.label}>Special Instructions</Text>
            <TextInput
              value={requestForm.specialInstructions ?? ''}
              onChangeText={(value) =>
                setRequestForm((prev) => ({ ...prev, specialInstructions: value }))
              }
              placeholder="Special instructions (optional)"
              placeholderTextColor="#98a2b3"
              style={[styles.input, styles.textarea]}
              multiline
            />
          </View>
          </View>

          <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Upload Photos</Text>
          <Text style={styles.photoCounter}>{selectedPhotos.length} / {MAX_PHOTOS}</Text>
          <View style={styles.actionsRow}>
            <Pressable style={[styles.secondaryButton, styles.flexButton]} onPress={() => void pickFromLibrary()}>
              <Text style={styles.secondaryButtonText}>Add Photos</Text>
            </Pressable>
            <Pressable style={[styles.photoButton, styles.flexButton]} onPress={() => void takePhoto()}>
              <Text style={styles.photoButtonText}>Take Photo</Text>
            </Pressable>
          </View>
          <View style={styles.photoGrid}>
            {selectedPhotos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoItem}>
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                <Pressable style={styles.removePhotoButton} onPress={() => removePhoto(index)}>
                  <Text style={styles.removePhotoText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
          </View>
        </>
      ) : null}

      <Pressable
        style={[styles.continueButton, !canContinue && styles.continueDisabled]}
        onPress={onContinue}
        disabled={!canContinue}
      >
        <Text style={styles.continueText}>Continue to Vehicle Condition</Text>
        <IconSymbol
          name={{ ios: 'arrow.right', android: 'east', web: 'east' }}
          color="#FFFFFF"
          size={18}
        />
      </Pressable>

      {showDatePicker ? (
        <DateTimePicker
          value={requestForm.scheduledPickupAt}
          mode="date"
          minimumDate={new Date()}
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (!selectedDate) return;
            const base = requestForm.scheduledPickupAt ?? new Date();
            const next = new Date(selectedDate);
            next.setHours(base.getHours(), base.getMinutes(), 0, 0);
            setRequestForm((prev) => ({ ...prev, scheduledPickupAt: next }));
          }}
        />
      ) : null}

        {showTimePicker ? (
          <DateTimePicker
            value={requestForm.scheduledPickupAt}
            mode="time"
            onChange={(_, selectedDate) => {
              setShowTimePicker(false);
              if (!selectedDate) return;
              const base = requestForm.scheduledPickupAt ?? new Date();
              const next = new Date(base);
              next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
              setRequestForm((prev) => ({ ...prev, scheduledPickupAt: next }));
            }}
          />
        ) : null}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    gap: 16,
    backgroundColor: '#FAFAFA',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  heroBlock: {
    gap: 8,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 2,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 15,
    color: '#68768A',
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  sectionHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#68768A',
    marginBottom: 10,
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
    borderColor: '#D9DFE8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#111827',
    fontSize: 14,
  },
  textarea: {
    minHeight: 88,
    height: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  vinInputRow: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  vinInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: '#111827',
  },
  clearVinButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  clearVinText: {
    color: '#68768A',
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
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
    color: '#98A2B3',
    fontSize: 14,
  },
  dropdownChevron: {
    color: '#98A2B3',
    fontSize: 12,
  },
  dropdownPanel: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    marginTop: 6,
    overflow: 'hidden',
  },
  dropdownSearch: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E8EF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#111827',
  },
  dropdownList: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  dropdownItemText: {
    color: '#111827',
    fontSize: 14,
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#98A2B3',
    fontSize: 13,
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC548',
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  optionChipActive: {
    borderColor: '#FFC548',
    backgroundColor: '#FFC548',
  },
  optionChipText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: '#111827',
  },
  datetimeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  pickerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  pickerButtonLabel: {
    fontSize: 12,
    color: '#98A2B3',
  },
  pickerButtonValue: {
    marginTop: 2,
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldRow: {
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  switchChip: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  switchChipActive: {
    borderColor: '#FFC548',
    backgroundColor: '#FFC548',
  },
  switchChipText: {
    color: '#111827',
    fontWeight: '700',
  },
  switchChipTextActive: {
    color: '#111827',
  },
  photoCounter: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#68768A',
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  flexButton: {
    flex: 1,
  },
  photoButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  photoButtonText: {
    color: '#111827',
    fontWeight: '700',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  photoItem: {
    width: '31%',
    minWidth: 100,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#EEF2F7',
  },
  removePhotoButton: {
    marginTop: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F4C7C3',
    borderRadius: 10,
    paddingVertical: 6,
  },
  removePhotoText: {
    fontSize: 12,
    color: '#C0392B',
    fontWeight: '600',
  },
  loader: {
    marginTop: 8,
  },
  warning: {
    color: '#C0392B',
    marginTop: 10,
    lineHeight: 18,
  },
  error: {
    color: '#C0392B',
    marginTop: 10,
    lineHeight: 18,
  },
  continueButton: {
    marginTop: 8,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  continueDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
