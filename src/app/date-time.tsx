import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  updateScheduleAndItemDetails,
  uploadRequestPhotos,
} from '@/lib/api';
import type {
  DateTimeRouteParams,
  ItemCondition,
  ItemType,
  LocalPhotoAsset,
  UploadedRequestPhoto,
  UpdateScheduleAndItemDetailsPayload,
} from '@/types/customer-request';

type ServiceKey =
  | 'VEHICLE_TRANSPORT'
  | 'MOTORCYCLE_TRANSPORT'
  | 'GOODS_TRANSPORT'
  | 'FURNITURE_TRANSPORT';

interface ScheduleAndItemDetailsForm {
  isImmediate: boolean;
  scheduledPickupAt?: Date;
  itemTitle: string;
  itemDescription?: string;
  itemType: ItemType;
  itemBrand?: string;
  itemModel?: string;
  itemYear?: string;
  itemCondition?: ItemCondition;
  itemWeightKg?: string;
  itemLengthCm?: string;
  itemWidthCm?: string;
  itemHeightCm?: string;
  requiresLoadingHelp: boolean;
  loadingWorkersCount?: string;
  specialInstructions?: string;
}

const MAX_PHOTOS = 8;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const ITEM_TYPE_OPTIONS: Array<{ label: string; value: ItemType }> = [
  { label: 'Vehicle', value: 'VEHICLE' },
  { label: 'Motorcycle', value: 'MOTORCYCLE' },
  { label: 'Goods', value: 'GOODS' },
  { label: 'Furniture', value: 'FURNITURE' },
  { label: 'Other', value: 'OTHER' },
];

const ITEM_CONDITION_OPTIONS: Array<{ label: string; value: ItemCondition }> = [
  { label: 'Working', value: 'WORKING' },
  { label: 'Not working', value: 'NOT_WORKING' },
  { label: 'New', value: 'NEW' },
  { label: 'Used', value: 'USED' },
  { label: 'Fragile', value: 'FRAGILE' },
  { label: 'Unknown', value: 'UNKNOWN' },
];

function defaultItemTypeFromServiceKey(rawKey: string | undefined): ItemType {
  const serviceKey = rawKey as ServiceKey | undefined;
  if (serviceKey === 'VEHICLE_TRANSPORT') return 'VEHICLE';
  if (serviceKey === 'MOTORCYCLE_TRANSPORT') return 'MOTORCYCLE';
  if (serviceKey === 'GOODS_TRANSPORT') return 'GOODS';
  if (serviceKey === 'FURNITURE_TRANSPORT') return 'FURNITURE';
  return 'OTHER';
}

function parsePositiveNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
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

export default function DateTimeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<DateTimeRouteParams>();

  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey.trim() : undefined;

  const [form, setForm] = useState<ScheduleAndItemDetailsForm>({
    isImmediate: false,
    scheduledPickupAt: new Date(Date.now() + 60 * 60 * 1000),
    itemTitle: '',
    itemDescription: '',
    itemType: defaultItemTypeFromServiceKey(serviceKey),
    itemBrand: '',
    itemModel: '',
    itemYear: '',
    itemCondition: undefined,
    itemWeightKg: '',
    itemLengthCm: '',
    itemWidthCm: '',
    itemHeightCm: '',
    requiresLoadingHelp: false,
    loadingWorkersCount: '',
    specialInstructions: '',
  });
  const [selectedPhotos, setSelectedPhotos] = useState<LocalPhotoAsset[]>([]);
  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedRequestPhoto[]>([]);
  const [showDatePicker, setShowDatePicker] = useState<boolean>(false);
  const [showTimePicker, setShowTimePicker] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSavingDetails, setIsSavingDetails] = useState<boolean>(false);
  const [isUploadingPhotos, setIsUploadingPhotos] = useState<boolean>(false);

  const updateForm = <K extends keyof ScheduleAndItemDetailsForm>(
    key: K,
    value: ScheduleAndItemDetailsForm[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    const now = Date.now();
    const currentYear = new Date().getFullYear();

    if (!requestId) {
      errors.push('Missing request. Please return to previous steps.');
    }

    if (!serviceId) {
      errors.push('Missing service. Please return to choose service.');
    }

    if (!form.itemTitle.trim()) {
      errors.push('Item title is required.');
    }

    if (!form.isImmediate) {
      if (!form.scheduledPickupAt) {
        errors.push('Please select pickup date and time.');
      } else if (form.scheduledPickupAt.getTime() <= now) {
        errors.push('Scheduled pickup must be in the future.');
      }
    }

    if (form.itemYear) {
      const year = parseInteger(form.itemYear);
      if (year === undefined || year < 1900 || year > currentYear + 1) {
        errors.push(`Item year must be between 1900 and ${currentYear + 1}.`);
      }
    }

    const numericFields: Array<{ label: string; value: string | undefined }> = [
      { label: 'Weight (kg)', value: form.itemWeightKg },
      { label: 'Length (cm)', value: form.itemLengthCm },
      { label: 'Width (cm)', value: form.itemWidthCm },
      { label: 'Height (cm)', value: form.itemHeightCm },
    ];
    numericFields.forEach((field) => {
      if (!field.value) return;
      const parsed = parsePositiveNumber(field.value);
      if (parsed === undefined || parsed <= 0) {
        errors.push(`${field.label} must be a positive number.`);
      }
    });

    if (form.requiresLoadingHelp) {
      const workers = parseInteger(form.loadingWorkersCount);
      if (workers === undefined || workers <= 0) {
        errors.push('Loading workers count must be a positive number.');
      }
    }

    if (selectedPhotos.length > MAX_PHOTOS) {
      errors.push(`You can select up to ${MAX_PHOTOS} photos.`);
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

    return errors;
  }, [form, requestId, selectedPhotos, serviceId]);

  const isBusy = isSavingDetails || isUploadingPhotos;
  const canContinue = validationErrors.length === 0 && !isBusy;

  const pickFromLibrary = async (): Promise<void> => {
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
  };

  const takePhoto = async (): Promise<void> => {
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
  };

  const removePhoto = (index: number): void => {
    setSelectedPhotos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const onContinue = async (): Promise<void> => {
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors[0] ?? 'Please complete required fields.');
      return;
    }

    const payload: UpdateScheduleAndItemDetailsPayload = {
      isImmediate: form.isImmediate,
      scheduledPickupAt:
        form.isImmediate || !form.scheduledPickupAt ? undefined : form.scheduledPickupAt.toISOString(),
      itemTitle: form.itemTitle.trim(),
      itemDescription: form.itemDescription?.trim() || undefined,
      itemType: form.itemType,
      itemBrand: form.itemBrand?.trim() || undefined,
      itemModel: form.itemModel?.trim() || undefined,
      itemYear: parseInteger(form.itemYear),
      itemCondition: form.itemCondition,
      itemWeightKg: parsePositiveNumber(form.itemWeightKg),
      itemLengthCm: parsePositiveNumber(form.itemLengthCm),
      itemWidthCm: parsePositiveNumber(form.itemWidthCm),
      itemHeightCm: parsePositiveNumber(form.itemHeightCm),
      requiresLoadingHelp: form.requiresLoadingHelp,
      loadingWorkersCount: form.requiresLoadingHelp
        ? parseInteger(form.loadingWorkersCount)
        : undefined,
      specialInstructions: form.specialInstructions?.trim() || undefined,
    };

    setErrorMessage('');
    setIsSavingDetails(true);

    try {
      const updatedRequest = await updateScheduleAndItemDetails(requestId, payload);
      let uploaded: UploadedRequestPhoto[] = uploadedPhotos;

      if (selectedPhotos.length > 0) {
        setIsUploadingPhotos(true);
        try {
          const uploadResponse = await uploadRequestPhotos(requestId, selectedPhotos);
          uploaded = uploadResponse.photos;
          setUploadedPhotos(uploadResponse.photos);
          setSelectedPhotos([]);
        } catch (uploadError) {
          const message =
            uploadError instanceof Error
              ? uploadError.message
              : 'Details were saved, but photo upload failed. Please retry.';
          setErrorMessage(`${message} You can retry without losing form data.`);
          return;
        } finally {
          setIsUploadingPhotos(false);
        }
      }

      const nextRoute = {
        pathname: '/submit-request',
        params: {
          requestId: updatedRequest.id,
          serviceId: updatedRequest.serviceId,
          serviceKey: serviceKey ?? '',
          pickupLatitude: params.pickupLatitude ?? '',
          pickupLongitude: params.pickupLongitude ?? '',
          pickupAddress: params.pickupAddress ?? '',
          pickupPlaceId: params.pickupPlaceId ?? '',
          dropoffLatitude: params.dropoffLatitude ?? '',
          dropoffLongitude: params.dropoffLongitude ?? '',
          dropoffAddress: params.dropoffAddress ?? '',
          dropoffPlaceId: params.dropoffPlaceId ?? '',
          isImmediate: String(payload.isImmediate),
          scheduledPickupAt: payload.scheduledPickupAt ?? '',
          itemTitle: payload.itemTitle,
          itemType: payload.itemType,
          itemDetails: JSON.stringify({
            title: payload.itemTitle,
            description: payload.itemDescription ?? null,
            type: payload.itemType,
            brand: payload.itemBrand ?? null,
            model: payload.itemModel ?? null,
            year: payload.itemYear ?? null,
            condition: payload.itemCondition ?? null,
            weightKg: payload.itemWeightKg ?? null,
            dimensions: {
              lengthCm: payload.itemLengthCm ?? null,
              widthCm: payload.itemWidthCm ?? null,
              heightCm: payload.itemHeightCm ?? null,
            },
            requiresLoadingHelp: payload.requiresLoadingHelp,
            loadingWorkersCount: payload.loadingWorkersCount ?? null,
            specialInstructions: payload.specialInstructions ?? null,
          }),
          uploadedPhotos: JSON.stringify(uploaded),
        },
      } as unknown as Href;
      router.push(nextRoute);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save date and item details.';
      const normalized = message.toLowerCase();

      if (normalized.includes('pickup location must be selected')) {
        setErrorMessage('Pickup location is missing. Redirecting to pickup step...');
        setTimeout(() => {
          const route = {
            pathname: '/pickup-location',
            params: { serviceId, serviceKey: serviceKey ?? '' },
          } as unknown as Href;
          router.replace(route);
        }, 700);
        return;
      }

      if (normalized.includes('dropoff location must be selected')) {
        setErrorMessage('Dropoff location is missing. Redirecting to dropoff step...');
        setTimeout(() => {
          const route = {
            pathname: '/dropoff-location',
            params: {
              requestId,
              serviceId,
              serviceKey: serviceKey ?? '',
              pickupLatitude: params.pickupLatitude ?? '',
              pickupLongitude: params.pickupLongitude ?? '',
              pickupAddress: params.pickupAddress ?? '',
              pickupPlaceId: params.pickupPlaceId ?? '',
            },
          } as unknown as Href;
          router.replace(route);
        }, 700);
        return;
      }

      setErrorMessage(message);
    } finally {
      setIsSavingDetails(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Date, Item Details & Photos</Text>
          <Text style={styles.subtitle}>
            Tell us when, what, and show us what you want to transport.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Date & Time</Text>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.optionChip, form.isImmediate && styles.optionChipActive]}
              onPress={() => updateForm('isImmediate', true)}
            >
              <Text style={[styles.optionChipText, form.isImmediate && styles.optionChipTextActive]}>
                Immediate pickup
              </Text>
            </Pressable>
            <Pressable
              style={[styles.optionChip, !form.isImmediate && styles.optionChipActive]}
              onPress={() => updateForm('isImmediate', false)}
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
                  {form.scheduledPickupAt ? form.scheduledPickupAt.toLocaleDateString() : 'Select date'}
                </Text>
              </Pressable>
              <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.pickerButtonLabel}>Pickup Time</Text>
                <Text style={styles.pickerButtonValue}>
                  {form.scheduledPickupAt
                    ? form.scheduledPickupAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Select time'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Item Details</Text>
          <TextInput
            value={form.itemTitle}
            onChangeText={(value) => updateForm('itemTitle', value)}
            placeholder="BMW 320i 2020 / Sofa set / 10 moving boxes"
            style={styles.input}
            placeholderTextColor="#98a2b3"
          />

          <Text style={styles.fieldLabel}>Item type</Text>
          <View style={styles.optionsWrap}>
            {ITEM_TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.optionChip, form.itemType === option.value && styles.optionChipActive]}
                onPress={() => updateForm('itemType', option.value)}
              >
                <Text style={[styles.optionChipText, form.itemType === option.value && styles.optionChipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={form.itemDescription}
            onChangeText={(value) => updateForm('itemDescription', value)}
            placeholder="Item description (optional)"
            style={[styles.input, styles.textarea]}
            placeholderTextColor="#98a2b3"
            multiline
          />

          <View style={styles.row}>
            <TextInput
              value={form.itemBrand}
              onChangeText={(value) => updateForm('itemBrand', value)}
              placeholder="Brand (optional)"
              style={[styles.input, styles.halfInput]}
              placeholderTextColor="#98a2b3"
            />
            <TextInput
              value={form.itemModel}
              onChangeText={(value) => updateForm('itemModel', value)}
              placeholder="Model (optional)"
              style={[styles.input, styles.halfInput]}
              placeholderTextColor="#98a2b3"
            />
          </View>

          <TextInput
            value={form.itemYear}
            onChangeText={(value) => updateForm('itemYear', value)}
            placeholder="Year (optional)"
            style={styles.input}
            placeholderTextColor="#98a2b3"
            keyboardType="number-pad"
          />

          <Text style={styles.fieldLabel}>Condition (optional)</Text>
          <View style={styles.optionsWrap}>
            {ITEM_CONDITION_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.optionChip, form.itemCondition === option.value && styles.optionChipActive]}
                onPress={() => updateForm('itemCondition', option.value)}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    form.itemCondition === option.value && styles.optionChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={form.itemWeightKg}
            onChangeText={(value) => updateForm('itemWeightKg', value)}
            placeholder="Weight (kg, optional)"
            style={styles.input}
            placeholderTextColor="#98a2b3"
            keyboardType="decimal-pad"
          />

          <View style={styles.row}>
            <TextInput
              value={form.itemLengthCm}
              onChangeText={(value) => updateForm('itemLengthCm', value)}
              placeholder="Length cm"
              style={[styles.input, styles.thirdInput]}
              placeholderTextColor="#98a2b3"
              keyboardType="decimal-pad"
            />
            <TextInput
              value={form.itemWidthCm}
              onChangeText={(value) => updateForm('itemWidthCm', value)}
              placeholder="Width cm"
              style={[styles.input, styles.thirdInput]}
              placeholderTextColor="#98a2b3"
              keyboardType="decimal-pad"
            />
            <TextInput
              value={form.itemHeightCm}
              onChangeText={(value) => updateForm('itemHeightCm', value)}
              placeholder="Height cm"
              style={[styles.input, styles.thirdInput]}
              placeholderTextColor="#98a2b3"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Requires loading help</Text>
            <Switch
              value={form.requiresLoadingHelp}
              onValueChange={(value) => {
                updateForm('requiresLoadingHelp', value);
                if (!value) updateForm('loadingWorkersCount', '');
              }}
            />
          </View>

          {form.requiresLoadingHelp ? (
            <TextInput
              value={form.loadingWorkersCount}
              onChangeText={(value) => updateForm('loadingWorkersCount', value)}
              placeholder="Loading workers count"
              style={styles.input}
              placeholderTextColor="#98a2b3"
              keyboardType="number-pad"
            />
          ) : null}

          <TextInput
            value={form.specialInstructions}
            onChangeText={(value) => updateForm('specialInstructions', value)}
            placeholder="Special instructions (optional)"
            style={[styles.input, styles.textarea]}
            placeholderTextColor="#98a2b3"
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Photos</Text>
          <Text style={styles.helperText}>
            Add clear photos to help drivers give accurate quotes.
          </Text>
          <Text style={styles.photoCounter}>{selectedPhotos.length} / {MAX_PHOTOS}</Text>

          <View style={styles.row}>
            <Pressable style={[styles.actionButton, styles.halfInput]} onPress={() => void pickFromLibrary()}>
              <Text style={styles.actionButtonText}>Add Photos</Text>
            </Pressable>
            <Pressable style={[styles.actionButtonSecondary, styles.halfInput]} onPress={() => void takePhoto()}>
              <Text style={styles.actionButtonSecondaryText}>Take Photo</Text>
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

        {validationErrors.length > 0 ? (
          <View style={styles.validationCard}>
            {validationErrors.map((error) => (
              <Text key={error} style={styles.validationText}>
                {error}
              </Text>
            ))}
          </View>
        ) : null}

        {isSavingDetails ? <Text style={styles.progressText}>Saving details...</Text> : null}
        {isUploadingPhotos ? <Text style={styles.progressText}>Uploading photos...</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </ScrollView>

      <Pressable
        style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
        disabled={!canContinue}
        onPress={() => void onContinue()}
      >
        {isBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.continueText}>Continue</Text>}
      </Pressable>

      {showDatePicker ? (
        <DateTimePicker
          value={form.scheduledPickupAt ?? new Date(Date.now() + 60 * 60 * 1000)}
          mode="date"
          minimumDate={new Date()}
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (!selectedDate) return;
            const base = form.scheduledPickupAt ?? new Date();
            const next = new Date(selectedDate);
            next.setHours(base.getHours(), base.getMinutes(), 0, 0);
            updateForm('scheduledPickupAt', next);
          }}
        />
      ) : null}

      {showTimePicker ? (
        <DateTimePicker
          value={form.scheduledPickupAt ?? new Date(Date.now() + 60 * 60 * 1000)}
          mode="time"
          onChange={(_, selectedDate) => {
            setShowTimePicker(false);
            if (!selectedDate) return;
            const base = form.scheduledPickupAt ?? new Date();
            const next = new Date(base);
            next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
            updateForm('scheduledPickupAt', next);
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f9fc',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  content: {
    paddingBottom: 18,
    gap: 12,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 15,
    color: '#475467',
  },
  section: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e7ec',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#101828',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
  },
  optionChipActive: {
    borderColor: '#1a73e8',
    backgroundColor: '#eef5ff',
  },
  optionChipText: {
    color: '#344054',
    fontSize: 13,
    fontWeight: '600',
  },
  optionChipTextActive: {
    color: '#0b57d0',
  },
  datetimeContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  pickerButtonLabel: {
    fontSize: 12,
    color: '#667085',
  },
  pickerButtonValue: {
    marginTop: 2,
    fontSize: 14,
    color: '#101828',
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    height: 46,
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 14,
  },
  textarea: {
    minHeight: 88,
    height: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  thirdInput: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#344054',
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#667085',
  },
  photoCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475467',
  },
  actionButton: {
    backgroundColor: '#1a73e8',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#1a73e8',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  actionButtonSecondaryText: {
    color: '#1a73e8',
    fontWeight: '700',
    fontSize: 14,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoItem: {
    width: '31%',
    minWidth: 100,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
  },
  removePhotoButton: {
    marginTop: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    paddingVertical: 4,
  },
  removePhotoText: {
    fontSize: 12,
    color: '#b42318',
    fontWeight: '600',
  },
  validationCard: {
    borderWidth: 1,
    borderColor: '#fecdca',
    backgroundColor: '#fef3f2',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  validationText: {
    color: '#b42318',
    fontSize: 12,
  },
  progressText: {
    fontSize: 13,
    color: '#0b57d0',
    fontWeight: '600',
  },
  errorText: {
    color: '#b42318',
    fontSize: 13,
  },
  continueButton: {
    marginTop: 8,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
