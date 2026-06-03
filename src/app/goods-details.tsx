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
  GoodsHeavyShipmentType,
  GoodsShipmentSize,
  GoodsTransportFormData,
  LocalPhotoAsset,
  PendingGoodsDetailsPayload,
} from '@/types/customer-request';

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

const HEAVY_SHIPMENT_OPTIONS: { value: GoodsHeavyShipmentType; label: string }[] = [
  { value: 'ONE_HEAVY_ITEM', label: 'One heavy item' },
  { value: 'MULTIPLE_SMALLER_PIECES', label: 'Multiple smaller pieces' },
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

  if (weight >= 50 && !form.heavyShipmentType) {
    return 'Please tell us whether this is one heavy item or multiple smaller pieces.';
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
  }));
  const [selectedPhotos, setSelectedPhotos] = useState<LocalPhotoAsset[]>(pendingGoodsPhotoAssets);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isPickingPhoto, setIsPickingPhoto] = useState<boolean>(false);
  const [sizeSearch, setSizeSearch] = useState<string>('');
  const [heavyTypeSearch, setHeavyTypeSearch] = useState<string>('');
  const [openDropdown, setOpenDropdown] = useState<'size' | 'heavyType' | null>(null);

  const validationMessage = useMemo(() => formatValidationMessage(form), [form]);
  const canContinue = serviceId.length > 0;
  const approximateWeight = Number(form.approximateWeightKg);
  const requiresHeavyShipmentType = Number.isFinite(approximateWeight) && approximateWeight >= 50;
  const selectedShipmentSize = SHIPMENT_SIZE_OPTIONS.find((option) => option.value === form.shipmentSize);

  const sizeOptions = useMemo(
    () =>
      SHIPMENT_SIZE_OPTIONS.filter((option) =>
        [option.label, option.approximateWeight, option.usage].join(' ').toLowerCase().includes(sizeSearch.trim().toLowerCase()),
      ).map((option) => ({ id: option.value, label: option.label })),
    [sizeSearch],
  );

  const heavyTypeOptions = useMemo(
    () =>
      HEAVY_SHIPMENT_OPTIONS.filter((option) =>
        option.label.toLowerCase().includes(heavyTypeSearch.trim().toLowerCase()),
      ).map((option) => ({ id: option.value, label: option.label })),
    [heavyTypeSearch],
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
          heavyShipmentType:
            requiresHeavyShipmentType && form.heavyShipmentType
              ? form.heavyShipmentType
              : undefined,
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
            heavyShipmentType:
              Number(value) >= 50 ? prev.heavyShipmentType : '',
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
          setForm((prev) => ({ ...prev, numberOfPieces: value }));
          setErrorMessage('');
        }}
        placeholder="Enter number of pieces"
        placeholderTextColor="#98a2b3"
        style={styles.input}
        keyboardType="number-pad"
      />

      {requiresHeavyShipmentType ? (
        <>
          <Text style={styles.sectionTitle}>Heavy Shipment</Text>
          <SearchableDropdown
            label="How is the shipment arranged?"
            placeholder="Select heavy shipment type"
            options={heavyTypeOptions}
            valueLabel={HEAVY_SHIPMENT_OPTIONS.find((option) => option.value === form.heavyShipmentType)?.label ?? ''}
            isOpen={openDropdown === 'heavyType'}
            searchText={heavyTypeSearch}
            onToggle={() => setOpenDropdown((prev) => (prev === 'heavyType' ? null : 'heavyType'))}
            onSearchChange={setHeavyTypeSearch}
            onSelect={(option) => {
              setForm((prev) => ({
                ...prev,
                heavyShipmentType: option.id as GoodsHeavyShipmentType,
              }));
              setOpenDropdown(null);
              setErrorMessage('');
            }}
          />
          <Text style={styles.helperText}>
            This helps us match the right vehicle and equipment for shipments 50 kg or more.
          </Text>
        </>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f7f9fc',
    paddingBottom: 30,
  },
  header: {
    marginBottom: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  backButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
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
    lineHeight: 22,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 14,
    marginBottom: 10,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
  },
  dropdownValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
  },
  dropdownPlaceholder: {
    color: '#98a2b3',
    fontSize: 15,
  },
  dropdownChevron: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  dropdownSearch: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
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
    borderTopColor: '#f2f4f7',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#111827',
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: '#98a2b3',
    fontSize: 14,
  },
  summaryCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#eff6ff',
    padding: 12,
    gap: 4,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  summaryLine: {
    fontSize: 14,
    color: '#334155',
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  multilineInput: {
    minHeight: 96,
    paddingTop: 12,
    paddingBottom: 12,
  },
  helperText: {
    marginTop: 8,
    color: '#667085',
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
    color: '#344054',
    fontWeight: '500',
  },
  switchChip: {
    minWidth: 74,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  switchChipActive: {
    borderColor: '#1a73e8',
    backgroundColor: '#e8f0fe',
  },
  switchChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#344054',
  },
  switchChipTextActive: {
    color: '#1a73e8',
  },
  photoCounter: {
    marginBottom: 8,
    color: '#667085',
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
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#1a73e8',
    fontSize: 14,
    fontWeight: '700',
  },
  photoButton: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a73e8',
    paddingHorizontal: 14,
  },
  photoButtonText: {
    color: '#ffffff',
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
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueDisabled: {
    opacity: 0.5,
  },
  continueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
