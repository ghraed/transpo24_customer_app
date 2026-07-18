import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { decodeVehicleVin } from '@/lib/api';
import type {
  LocalPhotoAsset,
  MotorcycleCondition,
  MotorcycleDetailsRouteParams,
  MotorcycleTransportFormData,
  MotorcycleType,
  PendingMotorcycleDetailsPayload,
} from '@/types/customer-request';
import type { DecodedVinResult } from '@/types/vehicle';
import { M3LoginColors } from '@/constants/theme';
import {
  getVinValidationMessage,
  INVALID_VIN_MESSAGE,
  normalizeVinInput,
  sanitizeVin,
  VIN_DECODE_EMPTY_RESULT_MESSAGE,
  VIN_DECODE_NETWORK_ERROR_MESSAGE,
} from '@/utils/vin';

const MAX_PHOTOS = 8;

const MOTORCYCLE_TYPE_OPTIONS: { value: MotorcycleType; label: string }[] = [
  { value: 'SPORT_BIKE', label: 'Sport bike' },
  { value: 'CRUISER', label: 'Cruiser' },
  { value: 'ELECTRIC_MOTORCYCLE', label: 'Electric motorcycle' },
  { value: 'SCOOTER', label: 'Scooter' },
  { value: 'OTHER', label: 'Other' },
];

const MOTORCYCLE_CONDITION_OPTIONS: { value: MotorcycleCondition; label: string }[] = [
  { value: 'WORKING', label: 'Working' },
  { value: 'NOT_WORKING', label: 'Not working' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

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
}) {
  return (
    <View>
      <Text style={styles.label}>{props.label}</Text>
      <Pressable style={styles.dropdownButton} onPress={props.onToggle}>
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

function formatValidationMessage(form: MotorcycleTransportFormData): string | null {
  if (form.chassisNumber.trim()) {
    const vinError = getVinValidationMessage(form.chassisNumber);
    if (vinError) {
      return vinError;
    }
  }

  if (!form.motorcycleType) {
    return 'Please select the motorcycle type.';
  }

  if (!form.motorcycleCondition) {
    return 'Please select the motorcycle condition.';
  }

  if (!form.isImmediate && form.scheduledPickupAt.getTime() <= Date.now()) {
    return 'Scheduled pickup must be in the future.';
  }

  return null;
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

function parsePendingMotorcyclePhotoAssets(raw: string | undefined): LocalPhotoAsset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LocalPhotoAsset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

function buildDefaultScheduledPickupAt(raw?: string): Date {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const nextDate = new Date();
  nextDate.setHours(nextDate.getHours() + 1, 0, 0, 0);
  return nextDate;
}

function hasDecodedMotorcycleData(decoded: DecodedVinResult): boolean {
  return Boolean(
    decoded.make ||
      decoded.model ||
      decoded.year ||
      decoded.trim ||
      decoded.vehicleType ||
      decoded.bodyClass,
  );
}

function resolveMotorcycleType(decoded: DecodedVinResult): MotorcycleType | '' {
  const hints = [
    decoded.vehicleType,
    decoded.bodyClass,
    decoded.trim,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (hints.includes('scooter')) return 'SCOOTER';
  if (hints.includes('electric') && hints.includes('motorcycle'))
    return 'ELECTRIC_MOTORCYCLE';
  if (hints.includes('cruiser')) return 'CRUISER';
  if (hints.includes('sport bike') || hints.includes('sportbike')) return 'SPORT_BIKE';

  return '';
}

export default function MotorcycleDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<MotorcycleDetailsRouteParams>();

  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey.trim() : '';
  const pendingMotorcycleDetails = parsePendingMotorcycleDetails(
    typeof params.pendingMotorcycleDetails === 'string' ? params.pendingMotorcycleDetails : undefined,
  );
  const pendingMotorcyclePhotoAssets = parsePendingMotorcyclePhotoAssets(
    typeof params.pendingMotorcyclePhotoAssets === 'string'
      ? params.pendingMotorcyclePhotoAssets
      : undefined,
  );

  const [form, setForm] = useState<MotorcycleTransportFormData>(() => ({
    motorcycleType: pendingMotorcycleDetails?.motorcycleType ?? '',
    chassisNumber: pendingMotorcycleDetails?.chassisNumber ?? '',
    motorcycleCondition: pendingMotorcycleDetails?.motorcycleCondition ?? '',
    requiresSpecialWrapping: pendingMotorcycleDetails?.requiresSpecialWrapping ?? false,
    requiresDedicatedCarrier: pendingMotorcycleDetails?.requiresDedicatedCarrier ?? false,
    isImmediate: pendingMotorcycleDetails?.isImmediate ?? false,
    scheduledPickupAt: buildDefaultScheduledPickupAt(pendingMotorcycleDetails?.scheduledPickupAt),
  }));
  const [selectedPhotos, setSelectedPhotos] = useState<LocalPhotoAsset[]>(pendingMotorcyclePhotoAssets);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [vinMessage, setVinMessage] = useState<string>('');
  const [decodedVin, setDecodedVin] = useState<DecodedVinResult | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState<boolean>(false);
  const [isDecodingVin, setIsDecodingVin] = useState<boolean>(false);
  const [typeSearch, setTypeSearch] = useState<string>('');
  const [conditionSearch, setConditionSearch] = useState<string>('');
  const [openDropdown, setOpenDropdown] = useState<'type' | 'condition' | null>(null);

  const validationMessage = useMemo(() => formatValidationMessage(form), [form]);
  const normalizedVin = useMemo(() => sanitizeVin(form.chassisNumber), [form.chassisNumber]);
  const vinValidationMessage = useMemo(
    () => (normalizedVin ? getVinValidationMessage(normalizedVin) : null),
    [normalizedVin],
  );
  const canDecodeVin = normalizedVin.length > 0 && !vinValidationMessage && !isDecodingVin;
  const canContinue = serviceId.length > 0;
  const typeOptions = useMemo(
    () =>
      MOTORCYCLE_TYPE_OPTIONS.filter((option) =>
        option.label.toLowerCase().includes(typeSearch.trim().toLowerCase()),
      ).map((option) => ({ id: option.value, label: option.label })),
    [typeSearch],
  );
  const conditionOptions = useMemo(
    () =>
      MOTORCYCLE_CONDITION_OPTIONS.filter((option) =>
        option.label.toLowerCase().includes(conditionSearch.trim().toLowerCase()),
      ).map((option) => ({ id: option.value, label: option.label })),
    [conditionSearch],
  );

  const decodeVin = async (): Promise<void> => {
    const vin = sanitizeVin(form.chassisNumber);
    if (!vin) {
      setVinMessage(INVALID_VIN_MESSAGE);
      return;
    }

    const vinError = getVinValidationMessage(vin);
    if (vinError) {
      setVinMessage(vinError);
      return;
    }

    setIsDecodingVin(true);
    setVinMessage('');
    setErrorMessage('');

    try {
      const decoded = await decodeVehicleVin(vin);
      if (!hasDecodedMotorcycleData(decoded)) {
        setDecodedVin(null);
        setVinMessage(VIN_DECODE_EMPTY_RESULT_MESSAGE);
        return;
      }

      const resolvedType = resolveMotorcycleType(decoded);
      setDecodedVin(decoded);
      setForm((prev) => ({
        ...prev,
        chassisNumber: vin,
        motorcycleType: prev.motorcycleType || resolvedType,
      }));
    } catch {
      setDecodedVin(null);
      setVinMessage(VIN_DECODE_NETWORK_ERROR_MESSAGE);
    } finally {
      setIsDecodingVin(false);
    }
  };

  const onContinue = (): void => {
    if (!canContinue) {
      setErrorMessage('Missing selected service. Please go back and choose a service again.');
      return;
    }

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage('');

    router.push({
      pathname: '/pickup-location',
      params: {
        serviceId,
        serviceKey,
        pendingMotorcycleDetails: JSON.stringify({
          motorcycleType: form.motorcycleType,
          chassisNumber: normalizedVin || undefined,
          motorcycleCondition: form.motorcycleCondition,
          requiresSpecialWrapping: form.requiresSpecialWrapping,
          requiresDedicatedCarrier: form.requiresDedicatedCarrier,
          isImmediate: form.isImmediate,
          scheduledPickupAt:
            form.isImmediate || !form.scheduledPickupAt
              ? undefined
              : form.scheduledPickupAt.toISOString(),
        }),
        pendingMotorcyclePhotoAssets: JSON.stringify(selectedPhotos),
      },
    } as unknown as Href);
  };

  const pickFromLibrary = async (): Promise<void> => {
    setIsPickingPhoto(true);
    try {
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
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const takePhoto = async (): Promise<void> => {
    setIsPickingPhoto(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setErrorMessage('Camera permission is needed to take photos.');
        return;
      }

      if (selectedPhotos.length >= MAX_PHOTOS) {
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
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const removePhoto = (index: number): void => {
    setSelectedPhotos((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Motorcycle Details</Text>
        <Text style={styles.subtitle}>
          Add your motorcycle details, pickup schedule, and photos before choosing pickup location.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Manual Motorcycle Selection</Text>
      <SearchableDropdown
        label="Motorcycle Type"
        placeholder="Select motorcycle type"
        options={typeOptions}
        valueLabel={MOTORCYCLE_TYPE_OPTIONS.find((option) => option.value === form.motorcycleType)?.label ?? ''}
        isOpen={openDropdown === 'type'}
        searchText={typeSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'type' ? null : 'type'))}
        onSearchChange={setTypeSearch}
        onSelect={(option) => {
          setForm((prev) => ({ ...prev, motorcycleType: option.id as MotorcycleType }));
          setOpenDropdown(null);
          setErrorMessage('');
        }}
      />

      <Text style={styles.label}>VIN / Chassis Number (optional)</Text>
      <TextInput
        value={form.chassisNumber}
        onChangeText={(value) => {
          setForm((prev) => ({ ...prev, chassisNumber: normalizeVinInput(value) }));
          setDecodedVin(null);
          setVinMessage('');
          setErrorMessage('');
        }}
        placeholder="Enter 17-character VIN"
        placeholderTextColor="#98a2b3"
        style={styles.input}
        autoCapitalize="characters"
      />
      <Pressable
        style={[styles.secondaryButton, !canDecodeVin && styles.secondaryButtonDisabled]}
        onPress={() => void decodeVin()}
        disabled={!canDecodeVin}
      >
        {isDecodingVin ? (
          <ActivityIndicator color="#1a73e8" />
        ) : (
          <Text style={styles.secondaryButtonText}>Decode VIN</Text>
        )}
      </Pressable>
      {vinMessage ? <Text style={styles.infoText}>{vinMessage}</Text> : null}
      {decodedVin ? (
        <View style={styles.decodedCard}>
          <Text style={styles.decodedTitle}>Decoded VIN details</Text>
          {decodedVin.make ? <Text style={styles.decodedText}>Make: {decodedVin.make}</Text> : null}
          {decodedVin.model ? <Text style={styles.decodedText}>Model: {decodedVin.model}</Text> : null}
          {decodedVin.year ? <Text style={styles.decodedText}>Year: {decodedVin.year}</Text> : null}
          {decodedVin.trim ? <Text style={styles.decodedText}>Trim: {decodedVin.trim}</Text> : null}
          {decodedVin.vehicleType ? (
            <Text style={styles.decodedText}>Vehicle type: {decodedVin.vehicleType}</Text>
          ) : null}
          {decodedVin.bodyClass ? (
            <Text style={styles.decodedText}>Body class: {decodedVin.bodyClass}</Text>
          ) : null}
        </View>
      ) : null}

      <SearchableDropdown
        label="Motorcycle Condition"
        placeholder="Select motorcycle condition"
        options={conditionOptions}
        valueLabel={MOTORCYCLE_CONDITION_OPTIONS.find((option) => option.value === form.motorcycleCondition)?.label ?? ''}
        isOpen={openDropdown === 'condition'}
        searchText={conditionSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'condition' ? null : 'condition'))}
        onSearchChange={setConditionSearch}
        onSelect={(option) => {
          setForm((prev) => ({ ...prev, motorcycleCondition: option.id as MotorcycleCondition }));
          setOpenDropdown(null);
          setErrorMessage('');
        }}
      />

      <Text style={styles.sectionTitle}>Transport Requirements</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Requires special wrapping</Text>
        <Pressable
          style={[styles.switchChip, form.requiresSpecialWrapping && styles.switchChipActive]}
          onPress={() =>
            setForm((prev) => ({
              ...prev,
              requiresSpecialWrapping: !prev.requiresSpecialWrapping,
            }))
          }
        >
          <Text
            style={[
              styles.switchChipText,
              form.requiresSpecialWrapping && styles.switchChipTextActive,
            ]}
          >
            {form.requiresSpecialWrapping ? 'Yes' : 'No'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Requires dedicated carrier</Text>
        <Pressable
          style={[styles.switchChip, form.requiresDedicatedCarrier && styles.switchChipActive]}
          onPress={() =>
            setForm((prev) => ({
              ...prev,
              requiresDedicatedCarrier: !prev.requiresDedicatedCarrier,
            }))
          }
        >
          <Text
            style={[
              styles.switchChipText,
              form.requiresDedicatedCarrier && styles.switchChipTextActive,
            ]}
          >
            {form.requiresDedicatedCarrier ? 'Yes' : 'No'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Date & Time</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.optionChip, form.isImmediate && styles.optionChipActive]}
          onPress={() => setForm((prev) => ({ ...prev, isImmediate: true }))}
        >
          <Text style={[styles.optionChipText, form.isImmediate && styles.optionChipTextActive]}>
            Immediate pickup
          </Text>
        </Pressable>
        <Pressable
          style={[styles.optionChip, !form.isImmediate && styles.optionChipActive]}
          onPress={() => setForm((prev) => ({ ...prev, isImmediate: false }))}
        >
          <Text style={[styles.optionChipText, !form.isImmediate && styles.optionChipTextActive]}>
            Schedule for later
          </Text>
        </Pressable>
      </View>

      {!form.isImmediate ? (
        <View style={styles.datetimeContainer}>
          <Pressable style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.pickerButtonLabel}>Pickup Date</Text>
            <Text style={styles.pickerButtonValue}>
              {form.scheduledPickupAt.toLocaleDateString()}
            </Text>
          </Pressable>
          <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.pickerButtonLabel}>Pickup Time</Text>
            <Text style={styles.pickerButtonValue}>
              {form.scheduledPickupAt.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
      {isPickingPhoto ? <ActivityIndicator color="#1a73e8" style={styles.loader} /> : null}
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

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        style={[styles.continueButton, !canContinue && styles.continueDisabled]}
        onPress={onContinue}
        disabled={!canContinue}
      >
        <Text style={styles.continueText}>Continue to Pickup Location</Text>
      </Pressable>

      {showDatePicker ? (
        <DateTimePicker
          value={form.scheduledPickupAt}
          mode="date"
          minimumDate={new Date()}
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (!selectedDate) return;
            const base = form.scheduledPickupAt;
            const next = new Date(selectedDate);
            next.setHours(base.getHours(), base.getMinutes(), 0, 0);
            setForm((prev) => ({ ...prev, scheduledPickupAt: next }));
          }}
        />
      ) : null}

      {showTimePicker ? (
        <DateTimePicker
          value={form.scheduledPickupAt}
          mode="time"
          onChange={(_, selectedDate) => {
            setShowTimePicker(false);
            if (!selectedDate) return;
            const next = new Date(form.scheduledPickupAt);
            next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
            setForm((prev) => ({ ...prev, scheduledPickupAt: next }));
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: M3LoginColors.background,
    paddingBottom: 30,
  },
  header: {
    marginBottom: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    backgroundColor: M3LoginColors.surface,
  },
  backButtonText: {
    color: M3LoginColors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: M3LoginColors.textSecondary,
    marginTop: 4,
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: M3LoginColors.textPrimary,
    marginBottom: 6,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
    marginTop: 14,
    marginBottom: 10,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: M3LoginColors.surface,
  },
  dropdownValue: {
    color: M3LoginColors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  dropdownPlaceholder: {
    color: M3LoginColors.textTertiary,
    fontSize: 15,
  },
  dropdownChevron: {
    color: M3LoginColors.textTertiary,
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 10,
    backgroundColor: M3LoginColors.surface,
    overflow: 'hidden',
  },
  dropdownSearch: {
    borderBottomWidth: 1,
    borderBottomColor: M3LoginColors.outlineVariant,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  dropdownList: {
    maxHeight: 210,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: M3LoginColors.surfaceContainer,
  },
  dropdownItemText: {
    fontSize: 15,
    color: M3LoginColors.textPrimary,
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: M3LoginColors.textTertiary,
    fontSize: 14,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: M3LoginColors.textPrimary,
    backgroundColor: M3LoginColors.surface,
  },
  infoText: {
    color: M3LoginColors.textSecondary,
    fontSize: 14,
    marginTop: 8,
  },
  decodedCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    backgroundColor: M3LoginColors.surface,
    gap: 4,
  },
  decodedTitle: {
    color: M3LoginColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  decodedText: {
    color: M3LoginColors.textSecondary,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: M3LoginColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  optionChipActive: {
    borderColor: M3LoginColors.primary,
    backgroundColor: M3LoginColors.primary,
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: M3LoginColors.textPrimary,
  },
  optionChipTextActive: {
    color: '#FFFFFF',
  },
  datetimeContainer: {
    marginTop: 12,
    gap: 12,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: M3LoginColors.surface,
  },
  pickerButtonLabel: {
    fontSize: 13,
    color: M3LoginColors.textTertiary,
    marginBottom: 4,
  },
  pickerButtonValue: {
    fontSize: 16,
    fontWeight: '600',
    color: M3LoginColors.textPrimary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 10,
  },
  switchLabel: {
    flex: 1,
    fontSize: 15,
    color: M3LoginColors.textPrimary,
    fontWeight: '500',
  },
  switchChip: {
    minWidth: 74,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: M3LoginColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  switchChipActive: {
    borderColor: M3LoginColors.primary,
    backgroundColor: M3LoginColors.primary,
  },
  switchChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  switchChipTextActive: {
    color: '#FFFFFF',
  },
  photoCounter: {
    marginBottom: 8,
    color: M3LoginColors.textTertiary,
    fontSize: 13,
    fontWeight: '500',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  flexButton: {
    flex: 1,
  },
  secondaryButton: {
    minHeight: 48,
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.primary,
    paddingHorizontal: 14,
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  photoButton: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.primary,
    paddingHorizontal: 14,
  },
  photoButtonText: {
    color: M3LoginColors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  loader: {
    marginVertical: 10,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  photoItem: {
    width: '47%',
  },
  photoPreview: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: M3LoginColors.outlineVariant,
    marginBottom: 6,
  },
  removePhotoButton: {
    alignSelf: 'flex-start',
  },
  removePhotoText: {
    color: M3LoginColors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: M3LoginColors.error,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 16,
  },
  continueButton: {
    marginTop: 24,
    minHeight: 54,
    borderRadius: 12,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: {
    opacity: 0.5,
  },
  continueText: {
    color: M3LoginColors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
});
