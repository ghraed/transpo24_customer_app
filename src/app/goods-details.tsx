import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import type {
  GoodsDetailsRouteParams,
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

type SearchableOption = {
  id: string;
  label: string;
};

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

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
            placeholderTextColor="#98A2B3"
            style={styles.dropdownSearch}
          />
          <ScrollView style={styles.dropdownList} nestedScrollEnabled>
            {props.options.length === 0 ? (
              <Text style={styles.emptyText}>No results</Text>
            ) : (
              props.options.map((option) => (
                <Pressable
                  key={option.id}
                  style={styles.dropdownItem}
                  onPress={() => props.onSelect(option)}
                >
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
  const keyboardInset = useAndroidKeyboardInset();
  const insets = useSafeAreaInsets();

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
        [option.label, option.approximateWeight, option.usage]
          .join(' ')
          .toLowerCase()
          .includes(sizeSearch.trim().toLowerCase()),
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
              paddingTop: Math.max(insets.top, 10),
              paddingBottom: keyboardInset > 0 ? keyboardInset + 32 : 44,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <IconSymbol name="shippingbox.fill" size={22} color="#111827" />
            </View>
            <Text style={styles.title}>Describe the shipment</Text>
            <Text style={styles.subtitle}>
              Add size, weight, timing, and handling notes before choosing the pickup location.
            </Text>
          </View>

          <View style={styles.sectionCard}>
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
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Approximate weight</Text>
                  <Text style={styles.summaryValue}>{selectedShipmentSize.approximateWeight}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Dimensions</Text>
                  <Text style={styles.summaryValue}>{selectedShipmentSize.dimensions}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Best for</Text>
                  <Text style={styles.summaryValue}>{selectedShipmentSize.usage}</Text>
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Goods Information</Text>
            <Text style={styles.label}>Goods Description</Text>
            <TextInput
              value={form.goodsDescription}
              onChangeText={(value) => {
                setForm((prev) => ({ ...prev, goodsDescription: value }));
                setErrorMessage('');
              }}
              placeholder="Examples: electronics, clothing, food items, furniture"
              placeholderTextColor="#98A2B3"
              style={[styles.input, styles.multilineInput]}
              multiline
              textAlignVertical="top"
            />

            <View style={styles.dualInputRow}>
              <View style={styles.dualInputItem}>
                <Text style={styles.label}>Approx. Weight (kg)</Text>
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
                  placeholder="Enter weight"
                  placeholderTextColor="#98A2B3"
                  style={styles.input}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.dualInputItem}>
                <Text style={styles.label}>Pieces</Text>
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
                  placeholder="Enter pieces"
                  placeholderTextColor="#98A2B3"
                  style={styles.input}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Pickup Time</Text>
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
                  Schedule later
                </Text>
              </Pressable>
            </View>

            {!form.isImmediate ? (
              <View style={styles.datetimeContainer}>
                <Pressable style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
                  <View style={styles.pickerIconWrap}>
                    <Text style={styles.pickerIconGlyph}>🗓</Text>
                  </View>
                  <Text style={styles.pickerButtonLabel}>Pickup Date</Text>
                  <Text style={styles.pickerButtonValue}>
                    {form.scheduledPickupAt.toLocaleDateString()}
                  </Text>
                </Pressable>
                <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
                  <View style={styles.pickerIconWrap}>
                    <Text style={styles.pickerIconGlyph}>🕒</Text>
                  </View>
                  <Text style={styles.pickerButtonLabel}>Pickup Time</Text>
                  <Text style={styles.pickerButtonValue}>
                    {form.scheduledPickupAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helperText}>
                We’ll start matching a driver as soon as the request is submitted.
              </Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Shipment Photos</Text>
              <Text style={styles.photoCounter}>
                {selectedPhotos.length} / {MAX_PHOTOS}
              </Text>
            </View>

            <View style={styles.actionsRow}>
              <Pressable
                style={[styles.primaryButton, styles.flexButton]}
                onPress={() => void pickFromLibrary()}
              >
                <IconSymbol name="photo.on.rectangle" size={16} color="#111827" />
                <Text style={styles.primaryButtonText}>Add Photos</Text>
              </Pressable>
              <Pressable
                style={[styles.outlineButton, styles.flexButton]}
                onPress={() => void takePhoto()}
              >
                <IconSymbol name="camera" size={16} color="#111827" />
                <Text style={styles.outlineButtonText}>Take Photo</Text>
              </Pressable>
            </View>

            {isPickingPhoto ? <ActivityIndicator color="#2563EB" style={styles.loader} /> : null}

            {selectedPhotos.length > 0 ? (
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
            ) : (
              <View style={styles.emptyPhotoState}>
                <IconSymbol name="photo" size={20} color="#98A2B3" />
                <Text style={styles.emptyPhotoText}>
                  Photos help drivers understand the shipment size and handling needs.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Special Handling</Text>
            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchLabel}>Fragile goods</Text>
                <Text style={styles.switchDescription}>Mark items that require careful handling.</Text>
              </View>
              <Pressable
                style={[styles.switchChip, form.isFragile && styles.switchChipActive]}
                onPress={() => setForm((prev) => ({ ...prev, isFragile: !prev.isFragile }))}
              >
                <Text style={[styles.switchChipText, form.isFragile && styles.switchChipTextActive]}>
                  {form.isFragile ? 'Yes' : 'No'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchLabel}>Requires refrigeration</Text>
                <Text style={styles.switchDescription}>Use this for temperature-sensitive goods.</Text>
              </View>
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
    backgroundColor: '#FAFAFA',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  topBarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  topBarSpacer: {
    width: 42,
    height: 42,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    marginBottom: 16,
  },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC548',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    fontSize: 15,
    color: '#68768A',
    marginTop: 8,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    marginTop: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    minHeight: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
  },
  dropdownValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '600',
  },
  dropdownPlaceholder: {
    color: '#98A2B3',
    fontSize: 15,
  },
  dropdownChevron: {
    color: '#98A2B3',
    fontSize: 12,
    fontWeight: '700',
  },
  dropdownPanel: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dropdownSearch: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F6',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  dropdownList: {
    maxHeight: 210,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F6',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#111827',
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: '#98A2B3',
    fontSize: 14,
  },
  summaryCard: {
    marginTop: 14,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    padding: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#CBD5E1',
    flex: 1,
  },
  summaryValue: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  input: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F8FAFC',
  },
  multilineInput: {
    minHeight: 110,
    paddingTop: 14,
    paddingBottom: 14,
  },
  dualInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dualInputItem: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  optionChip: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  optionChipActive: {
    borderColor: '#FFC548',
    backgroundColor: '#FFC548',
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#68768A',
  },
  optionChipTextActive: {
    color: '#111827',
  },
  pickerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
  },
  datetimeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  pickerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC548',
    marginBottom: 12,
  },
  pickerIconGlyph: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  pickerButtonLabel: {
    fontSize: 13,
    color: '#68768A',
    marginBottom: 4,
  },
  pickerButtonValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  helperText: {
    marginTop: 12,
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  photoCounter: {
    color: '#68768A',
    fontSize: 13,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  flexButton: {
    flex: 1,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC548',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  outlineButton: {
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 8,
  },
  outlineButtonText: {
    color: '#111827',
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
    marginTop: 14,
  },
  photoItem: {
    width: '47%',
  },
  photoPreview: {
    width: '100%',
    height: 126,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
    marginBottom: 6,
  },
  emptyPhotoState: {
    marginTop: 14,
    minHeight: 108,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    gap: 10,
  },
  emptyPhotoText: {
    textAlign: 'center',
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchCopy: {
    flex: 1,
    gap: 4,
  },
  switchLabel: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
  },
  switchDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: '#68768A',
  },
  switchChip: {
    minWidth: 74,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  switchChipActive: {
    borderColor: '#FFC548',
    backgroundColor: '#FFC548',
  },
  switchChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#68768A',
  },
  switchChipTextActive: {
    color: '#111827',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEF2F6',
    marginVertical: 16,
  },
  removePhotoButton: {
    alignSelf: 'flex-start',
  },
  removePhotoText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  continueButton: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  continueDisabled: {
    opacity: 0.5,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
});
