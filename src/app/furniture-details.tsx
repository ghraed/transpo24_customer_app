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
  FurnitureDetailsRouteParams,
  FurnitureTransportFormData,
  LocalPhotoAsset,
  PendingFurnitureDetailsPayload,
} from '@/types/customer-request';
import { M3LoginColors } from '@/constants/theme';
import { M3Styles } from '@/lib/m3-styles';

const MAX_PHOTOS = 8;

function parsePendingFurnitureDetails(
  raw: string | undefined,
): PendingFurnitureDetailsPayload | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as PendingFurnitureDetailsPayload;
  } catch {
    return undefined;
  }
}

function parsePendingFurniturePhotoAssets(raw: string | undefined): LocalPhotoAsset[] {
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

function buildDefaultMovingDate(raw?: string): Date {
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const nextDate = new Date();
  nextDate.setHours(9, 0, 0, 0);
  if (nextDate.getTime() <= Date.now()) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  return nextDate;
}

function formatValidationMessage(
  form: FurnitureTransportFormData,
  selectedPhotos: LocalPhotoAsset[],
): string | null {
  if (selectedPhotos.length === 0) {
    return 'Please add at least one furniture photo.';
  }

  if (!form.furnitureDescription.trim()) {
    return 'Please describe the furniture to be transported.';
  }

  const itemCount = Number(form.approximateItemCount);
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    return 'Approximate item count must be at least 1.';
  }

  if (form.needsHelpers) {
    const helpersCount = Number(form.helpersCount);
    if (!Number.isInteger(helpersCount) || helpersCount < 1) {
      return 'Please add a valid number of helpers.';
    }
  }

  if (Number.isNaN(form.movingDate.getTime())) {
    return 'Please select a valid moving date.';
  }

  if (!form.isImmediate && form.movingDate.getTime() <= Date.now()) {
    return 'Scheduled pickup must be in the future.';
  }

  return null;
}

export default function FurnitureDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<FurnitureDetailsRouteParams>();

  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey.trim() : '';
  const pendingFurnitureDetails = parsePendingFurnitureDetails(
    typeof params.pendingFurnitureDetails === 'string' ? params.pendingFurnitureDetails : undefined,
  );
  const pendingFurniturePhotoAssets = parsePendingFurniturePhotoAssets(
    typeof params.pendingFurniturePhotoAssets === 'string'
      ? params.pendingFurniturePhotoAssets
      : undefined,
  );

  const [form, setForm] = useState<FurnitureTransportFormData>(() => ({
    furnitureDescription: pendingFurnitureDetails?.furnitureDescription ?? '',
    approximateItemCount:
      typeof pendingFurnitureDetails?.approximateItemCount === 'number'
        ? String(pendingFurnitureDetails.approximateItemCount)
        : '1',
    needsHelpers: pendingFurnitureDetails?.needsHelpers ?? false,
    helpersCount:
      typeof pendingFurnitureDetails?.helpersCount === 'number'
        ? String(pendingFurnitureDetails.helpersCount)
        : '',
    isImmediate: pendingFurnitureDetails?.isImmediate ?? false,
    movingDate: buildDefaultMovingDate(pendingFurnitureDetails?.movingDate),
    customerCanHelpLoading: pendingFurnitureDetails?.customerCanHelpLoading ?? false,
  }));
  const [selectedPhotos, setSelectedPhotos] = useState<LocalPhotoAsset[]>(
    pendingFurniturePhotoAssets,
  );
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isPickingPhoto, setIsPickingPhoto] = useState<boolean>(false);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [minimumMovingDate] = useState<Date>(() => new Date(Date.now() + 60 * 1000));

  const validationMessage = useMemo(
    () => formatValidationMessage(form, selectedPhotos),
    [form, selectedPhotos],
  );
  const canContinue = serviceId.length > 0;

  const onContinue = (): void => {
    if (!canContinue) {
      setErrorMessage('Missing selected service. Please go back and choose a service again.');
      return;
    }

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    const approximateItemCount = Number(form.approximateItemCount);

    setErrorMessage('');

    router.push({
      pathname: '/pickup-location',
      params: {
        serviceId,
        serviceKey,
        pendingFurnitureDetails: JSON.stringify({
          furnitureDescription: form.furnitureDescription.trim(),
          approximateItemCount,
          needsHelpers: form.needsHelpers,
          helpersCount: form.needsHelpers ? Number(form.helpersCount) : undefined,
          isImmediate: form.isImmediate,
          scheduledPickupAt:
            form.isImmediate || !form.movingDate ? undefined : form.movingDate.toISOString(),
          movingDate: form.movingDate.toISOString(),
          customerCanHelpLoading: form.customerCanHelpLoading,
        }),
        pendingFurniturePhotoAssets: JSON.stringify(selectedPhotos),
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
        <Text style={styles.title}>Furniture Details</Text>
        <Text style={styles.subtitle}>
          Add furniture photos, description, helpers, and moving date before choosing pickup location.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Upload Photos</Text>
      <Text style={styles.photoCounter}>{selectedPhotos.length} / {MAX_PHOTOS}</Text>
      <View style={styles.actionsRow}>
        <Pressable
          style={[styles.secondaryButton, styles.flexButton]}
          onPress={() => void pickFromLibrary()}
        >
          <Text style={styles.secondaryButtonText}>Add Photos</Text>
        </Pressable>
        <Pressable
          style={[styles.photoButton, styles.flexButton]}
          onPress={() => void takePhoto()}
        >
          <Text style={styles.photoButtonText}>Take Photo</Text>
        </Pressable>
      </View>
      <Text style={styles.helperText}>
        Add clear furniture photos so drivers can suggest the right helpers and equipment.
      </Text>
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

      <Text style={styles.sectionTitle}>Furniture Details</Text>
      <Text style={styles.label}>Furniture Description</Text>
      <TextInput
        value={form.furnitureDescription}
        onChangeText={(value) => {
          setForm((prev) => ({ ...prev, furnitureDescription: value }));
          setErrorMessage('');
        }}
        placeholder="Examples: sofas, refrigerator, bed, cabinets"
        placeholderTextColor="#98a2b3"
        style={[styles.input, styles.multilineInput]}
        multiline
        textAlignVertical="top"
      />

      <Text style={styles.label}>Approximate Number of Items</Text>
      <TextInput
        value={form.approximateItemCount}
        onChangeText={(value) => {
          setForm((prev) => ({ ...prev, approximateItemCount: value }));
          setErrorMessage('');
        }}
        placeholder="Enter item count"
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
              {form.movingDate.toLocaleDateString()}
            </Text>
          </Pressable>
          <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.pickerButtonLabel}>Pickup Time</Text>
            <Text style={styles.pickerButtonValue}>
              {form.movingDate.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Text style={styles.sectionTitle}>Helpers & Loading</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>I need helper</Text>
        <Pressable
          style={[styles.switchChip, form.needsHelpers && styles.switchChipActive]}
          onPress={() =>
            setForm((prev) => ({
              ...prev,
              needsHelpers: !prev.needsHelpers,
              helpersCount: prev.needsHelpers ? '' : prev.helpersCount,
            }))
          }
        >
          <Text style={[styles.switchChipText, form.needsHelpers && styles.switchChipTextActive]}>
            {form.needsHelpers ? 'Yes' : 'No'}
          </Text>
        </Pressable>
      </View>
      {form.needsHelpers ? (
        <TextInput
          value={form.helpersCount}
          onChangeText={(value) => {
            setForm((prev) => ({ ...prev, helpersCount: value }));
            setErrorMessage('');
          }}
          placeholder="Number of helpers"
          placeholderTextColor="#98a2b3"
          style={styles.input}
          keyboardType="number-pad"
        />
      ) : null}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>I can help with loading</Text>
        <Pressable
          style={[styles.switchChip, form.customerCanHelpLoading && styles.switchChipActive]}
          onPress={() =>
            setForm((prev) => ({
              ...prev,
              customerCanHelpLoading: !prev.customerCanHelpLoading,
            }))
          }
        >
          <Text
            style={[
              styles.switchChipText,
              form.customerCanHelpLoading && styles.switchChipTextActive,
            ]}
          >
            {form.customerCanHelpLoading ? 'Yes' : 'No'}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.helperText}>
        Drivers can still suggest the final helper count after reviewing the photos.
      </Text>

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
          value={form.movingDate}
          mode="date"
          minimumDate={minimumMovingDate}
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (!selectedDate) return;
            const next = new Date(selectedDate);
            next.setHours(
              form.movingDate.getHours(),
              form.movingDate.getMinutes(),
              0,
              0,
            );
            if (next.getTime() <= minimumMovingDate.getTime()) {
              next.setTime(minimumMovingDate.getTime());
            }
            setForm((prev) => ({ ...prev, movingDate: next }));
          }}
        />
      ) : null}

      {showTimePicker ? (
        <DateTimePicker
          value={form.movingDate}
          mode="time"
          onChange={(_, selectedDate) => {
            setShowTimePicker(false);
            if (!selectedDate) return;
            const next = new Date(form.movingDate);
            next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
            if (next.getTime() <= minimumMovingDate.getTime()) {
              next.setTime(minimumMovingDate.getTime());
            }
            setForm((prev) => ({ ...prev, movingDate: next }));
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
  pickerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: M3LoginColors.surface,
  },
  datetimeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
    color: '#FFFFFF',
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
    marginBottom: 8,
  },
  flexButton: {
    flex: 1,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.surface,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: M3LoginColors.primary,
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
    backgroundColor: M3LoginColors.surfaceContainer,
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
