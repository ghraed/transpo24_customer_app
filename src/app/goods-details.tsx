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

import type {
  GoodsDetailsRouteParams,
  GoodsShipmentSize,
  GoodsTransportFormData,
  LocalPhotoAsset,
  PendingGoodsDetailsPayload,
} from '@/types/customer-request';
import { M3LoginColors } from '@/constants/theme';
import { M3Styles } from '@/lib/m3-styles';

const MAX_PHOTOS = 8;

const SHIPMENT_SIZE_OPTIONS: {
  value: GoodsShipmentSize;
  label: string;
  approximateWeight: string;
  dimensions: string;
  usage: string;
}[] = [
  {
    value: 'XS',
    label: 'XS',
    approximateWeight: 'Less than 5 kg',
    dimensions: '30 × 20 × 15 cm',
    usage: 'Documents, small parcels',
  },
  {
    value: 'S',
    label: 'S',
    approximateWeight: '5 - 10 kg',
    dimensions: '40 × 30 × 25 cm',
    usage: 'Gifts, small electronics',
  },
  {
    value: 'M',
    label: 'M',
    approximateWeight: '10 - 25 kg',
    dimensions: '50 × 40 × 35 cm',
    usage: 'Bags, electronics',
  },
  {
    value: 'L',
    label: 'L',
    approximateWeight: '25 - 50 kg',
    dimensions: '70 × 50 × 45 cm',
    usage: 'Small household appliances',
  },
  {
    value: 'XL',
    label: 'XL',
    approximateWeight: '50 - 100 kg',
    dimensions: '100 × 60 × 50 cm',
    usage: 'Large appliances',
  },
  {
    value: 'XXL',
    label: 'XXL',
    approximateWeight: 'More than 100 kg',
    dimensions: '120+ × 70+ × 60+ cm',
    usage: 'Furniture, heavy equipment',
  },
];

type SearchableOption = {
  id: string;
  label: string;
};

function inferHeavyShipmentType(
  approximateWeightKg: number,
  numberOfPieces: number,
): GoodsTransportFormData['heavyShipmentType'] {
  if (approximateWeightKg < 50) {
    return '';
  }

  return numberOfPieces > 1 ? 'MULTIPLE_SMALLER_PIECES' : 'ONE_HEAVY_ITEM';
}

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

function parsePendingGoodsDetails(raw: string | undefined): PendingGoodsDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingGoodsDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingGoodsPhotoAssets(raw: string | undefined): LocalPhotoAsset[] {
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

function formatValidationMessage(form: GoodsTransportFormData): string | null {
  if (!form.shipmentSize) {
    return 'Please select a shipment size.';
  }

  if (!form.goodsDescription.trim()) {
    return 'Please describe the goods you want to transport.';
  }

  const weight = Number(form.approximateWeightKg);
  if (!Number.isFinite(weight) || weight <= 0) {
    return 'Approximate weight must be greater than 0.';
  }

  const pieces = Number(form.numberOfPieces);
  if (!Number.isInteger(pieces) || pieces < 1) {
    return 'Number of pieces must be at least 1.';
  }

  if (!form.isImmediate && form.scheduledPickupAt.getTime() <= Date.now()) {
    return 'Scheduled pickup must be in the future.';
  }

  return null;
}

export default function GoodsDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<GoodsDetailsRouteParams>();

  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey.trim() : '';
  const pendingGoodsDetails = parsePendingGoodsDetails(
    typeof params.pendingGoodsDetails === 'string' ? params.pendingGoodsDetails : undefined,
  );
  const pendingGoodsPhotoAssets = parsePendingGoodsPhotoAssets(
    typeof params.pendingGoodsPhotoAssets === 'string' ? params.pendingGoodsPhotoAssets : undefined,
  );

  const [form, setForm] = useState<GoodsTransportFormData>(() => ({
    shipmentSize: pendingGoodsDetails?.shipmentSize ?? '',
    goodsDescription: pendingGoodsDetails?.goodsDescription ?? '',
    approximateWeightKg:
      typeof pendingGoodsDetails?.approximateWeightKg === 'number'
        ? String(pendingGoodsDetails.approximateWeightKg)
        : '',
    numberOfPieces:
      typeof pendingGoodsDetails?.numberOfPieces === 'number'
        ? String(pendingGoodsDetails.numberOfPieces)
        : '1',
    isFragile: pendingGoodsDetails?.isFragile ?? false,
    requiresRefrigeration: pendingGoodsDetails?.requiresRefrigeration ?? false,
    heavyShipmentType: pendingGoodsDetails?.heavyShipmentType ?? '',
    isImmediate: pendingGoodsDetails?.isImmediate ?? false,
    scheduledPickupAt: buildDefaultScheduledPickupAt(pendingGoodsDetails?.scheduledPickupAt),
  }));
  const [selectedPhotos, setSelectedPhotos] = useState<LocalPhotoAsset[]>(pendingGoodsPhotoAssets);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isPickingPhoto, setIsPickingPhoto] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [sizeSearch, setSizeSearch] = useState<string>('');
  const [openDropdown, setOpenDropdown] = useState<'size' | null>(null);

  const validationMessage = useMemo(() => formatValidationMessage(form), [form]);
  const canContinue = serviceId.length > 0;
  const selectedShipmentSize = SHIPMENT_SIZE_OPTIONS.find((option) => option.value === form.shipmentSize);

  const sizeOptions = useMemo(
    () =>
      SHIPMENT_SIZE_OPTIONS.filter((option) =>
        [option.label, option.approximateWeight, option.usage].join(' ').toLowerCase().includes(sizeSearch.trim().toLowerCase()),
      ).map((option) => ({ id: option.value, label: option.label })),
    [sizeSearch],
  );

  const onContinue = (): void => {
    if (!canContinue) {
      setErrorMessage('Missing selected service. Please go back and choose a service again.');
      return;
    }

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    const weight = Number(form.approximateWeightKg);
    const pieces = Number(form.numberOfPieces);

    setErrorMessage('');

    router.push({
      pathname: '/pickup-location',
      params: {
        serviceId,
        serviceKey,
        pendingGoodsDetails: JSON.stringify({
          shipmentSize: form.shipmentSize as GoodsShipmentSize,
          goodsDescription: form.goodsDescription.trim(),
          approximateWeightKg: weight,
          numberOfPieces: pieces,
          isFragile: form.isFragile,
          requiresRefrigeration: form.requiresRefrigeration,
          heavyShipmentType: inferHeavyShipmentType(weight, pieces) || undefined,
          isImmediate: form.isImmediate,
          scheduledPickupAt:
            form.isImmediate || !form.scheduledPickupAt
              ? undefined
              : form.scheduledPickupAt.toISOString(),
        }),
        pendingGoodsPhotoAssets: JSON.stringify(selectedPhotos),
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
        <Text style={styles.title}>Goods Details</Text>
        <Text style={styles.subtitle}>
          Add your shipment details, photos, and handling requirements before choosing pickup location.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Shipment Size</Text>
      <SearchableDropdown
        label="Size"
        placeholder="Select shipment size"
        options={sizeOptions}
        valueLabel={selectedShipmentSize?.label ?? ''}
        isOpen={openDropdown === 'size'}
        searchText={sizeSearch}
        onToggle={() => setOpenDropdown((prev) => (prev === 'size' ? null : 'size'))}
        onSearchChange={setSizeSearch}
        onSelect={(option) => {
          setForm((prev) => ({ ...prev, shipmentSize: option.id as GoodsShipmentSize }));
          setOpenDropdown(null);
          setErrorMessage('');
        }}
      />

      {selectedShipmentSize ? (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{selectedShipmentSize.label} shipment</Text>
          <Text style={styles.summaryLine}>Approximate weight: {selectedShipmentSize.approximateWeight}</Text>
          <Text style={styles.summaryLine}>Dimensions: {selectedShipmentSize.dimensions}</Text>
          <Text style={styles.summaryLine}>Usage: {selectedShipmentSize.usage}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Goods Description</Text>
      <TextInput
        value={form.goodsDescription}
        onChangeText={(value) => {
          setForm((prev) => ({ ...prev, goodsDescription: value }));
          setErrorMessage('');
        }}
        placeholder="Examples: electronics, clothing, food items, furniture"
        placeholderTextColor="#98a2b3"
        style={[styles.input, styles.multilineInput]}
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.sectionTitle}>Shipment Details</Text>
      <Text style={styles.label}>Approximate Weight (kg)</Text>
      <TextInput
        value={form.approximateWeightKg}
        onChangeText={(value) => {
          setForm((prev) => ({
            ...prev,
            approximateWeightKg: value,
            heavyShipmentType: inferHeavyShipmentType(
              Number(value),
              Number(prev.numberOfPieces),
            ),
          }));
          setErrorMessage('');
        }}
        placeholder="Enter weight in kg"
        placeholderTextColor="#98a2b3"
        style={styles.input}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Number of Pieces</Text>
      <TextInput
        value={form.numberOfPieces}
        onChangeText={(value) => {
          setForm((prev) => ({
            ...prev,
            numberOfPieces: value,
            heavyShipmentType: inferHeavyShipmentType(
              Number(prev.approximateWeightKg),
              Number(value),
            ),
          }));
          setErrorMessage('');
        }}
        placeholder="Enter number of pieces"
        placeholderTextColor="#98a2b3"
        style={styles.input}
        keyboardType="number-pad"
      />

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
          <Text
            style={[styles.optionChipText, !form.isImmediate && styles.optionChipTextActive]}
          >
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

      <Text style={styles.sectionTitle}>Special Handling</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Fragile goods</Text>
        <Pressable
          style={[styles.switchChip, form.isFragile && styles.switchChipActive]}
          onPress={() => setForm((prev) => ({ ...prev, isFragile: !prev.isFragile }))}
        >
          <Text style={[styles.switchChipText, form.isFragile && styles.switchChipTextActive]}>
            {form.isFragile ? 'Yes' : 'No'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Requires refrigeration</Text>
        <Pressable
          style={[styles.switchChip, form.requiresRefrigeration && styles.switchChipActive]}
          onPress={() =>
            setForm((prev) => ({
              ...prev,
              requiresRefrigeration: !prev.requiresRefrigeration,
            }))
          }
        >
          <Text
            style={[
              styles.switchChipText,
              form.requiresRefrigeration && styles.switchChipTextActive,
            ]}
          >
            {form.requiresRefrigeration ? 'Yes' : 'No'}
          </Text>
        </Pressable>
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
    borderTopColor: M3LoginColors.outlineVariant,
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
  summaryCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    backgroundColor: M3LoginColors.primaryContainer,
    padding: 12,
    gap: 4,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryLine: {
    fontSize: 14,
    color: '#FFFFFF',
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
  multilineInput: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
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
    paddingHorizontal: 16,
  },
  optionChipActive: {
    borderColor: M3LoginColors.primary,
    backgroundColor: M3LoginColors.primary,
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  optionChipTextActive: {
    color: '#FFFFFF',
  },
  pickerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: M3LoginColors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: M3LoginColors.primaryContainer,
  },
  datetimeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  pickerButtonLabel: {
    fontSize: 13,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  pickerButtonValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  helperText: {
    marginTop: 8,
    color: M3LoginColors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
    color: M3LoginColors.primary,
  },
  photoCounter: {
    marginBottom: 8,
    color: M3LoginColors.textSecondary,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.primary,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: M3LoginColors.onPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  photoButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.surface,
    paddingHorizontal: 14,
  },
  photoButtonText: {
    color: M3LoginColors.primary,
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
    backgroundColor: '#e5e7eb',
    marginBottom: 6,
  },
  removePhotoButton: {
    alignSelf: 'flex-start',
  },
  removePhotoText: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#b42318',
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
    color: M3LoginColors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
