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
  Switch,
  Text,
  TextInput,
  View,
  type ColorValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  updateScheduleAndItemDetails,
  uploadRequestPhotos,
} from '@/lib/api';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import type {
  DateTimeRouteParams,
  ItemCondition,
  ItemType,
  LocalPhotoAsset,
  UploadedRequestPhoto,
  UpdateScheduleAndItemDetailsPayload,
} from '@/types/customer-request';
import type { VehicleCondition } from '@/types/vehicle-condition';
import appI18n from '@/localization/i18n';

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

const ITEM_TYPE_OPTIONS: { label: string; value: ItemType }[] = [
  { label: 'Vehicle', value: 'VEHICLE' },
  { label: 'Motorcycle', value: 'MOTORCYCLE' },
  { label: 'Goods', value: 'GOODS' },
  { label: 'Furniture', value: 'FURNITURE' },
  { label: 'Other', value: 'OTHER' },
];

const ITEM_CONDITION_OPTIONS: { label: string; value: ItemCondition }[] = [
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

export default function DateTimeScreen() {
  const keyboardInset = useAndroidKeyboardInset();
  const router = useRouter();
  const params = useLocalSearchParams<DateTimeRouteParams>();
  const insets = useSafeAreaInsets();
  const [defaultScheduledPickupAt] = useState<Date>(() => new Date(Date.now() + 60 * 60 * 1000));
  const [currentValidationTime] = useState<number>(() => Date.now());

  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId.trim() : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey.trim() : undefined;
  const vehicleDetails = typeof params.vehicleDetails === 'string' ? params.vehicleDetails : '';
  const vehicleConditionDetails =
    typeof params.vehicleConditionDetails === 'string' ? params.vehicleConditionDetails : '';
  const parsedVehicleConditionDetails = useMemo(() => {
    if (!vehicleConditionDetails) return null;
    try {
      return JSON.parse(vehicleConditionDetails) as {
        vehicleCondition?: VehicleCondition;
        vehicleConditionNotes?: string;
      };
    } catch {
      return null;
    }
  }, [vehicleConditionDetails]);

  const [form, setForm] = useState<ScheduleAndItemDetailsForm>({
    isImmediate: false,
    scheduledPickupAt: defaultScheduledPickupAt,
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

    if (serviceKey === 'VEHICLE_TRANSPORT' && !parsedVehicleConditionDetails?.vehicleCondition) {
      errors.push('Vehicle condition is required for vehicle transport.');
    }

    if (!form.isImmediate) {
      if (!form.scheduledPickupAt) {
        errors.push('Please select pickup date and time.');
      } else if (form.scheduledPickupAt.getTime() <= currentValidationTime) {
        errors.push('Scheduled pickup must be in the future.');
      }
    }

    if (form.itemYear) {
      const year = parseInteger(form.itemYear);
      if (year === undefined || year < 1900 || year > currentYear + 1) {
        errors.push(`Item year must be between 1900 and ${currentYear + 1}.`);
      }
    }

    const numericFields: { label: string; value: string | undefined }[] = [
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
  }, [currentValidationTime, form, parsedVehicleConditionDetails?.vehicleCondition, requestId, selectedPhotos, serviceId, serviceKey]);

  const isBusy = isSavingDetails || isUploadingPhotos;
  const canContinue = validationErrors.length === 0 && !isBusy;

  const pickFromLibrary = async (): Promise<void> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
      setErrorMessage(appI18n.t("Media library permission is needed to select photos."));
      return;
    }

    const remainingSlots = MAX_PHOTOS - selectedPhotos.length;
    if (remainingSlots <= 0) {
      setErrorMessage(appI18n.t("You can upload up to {{value0}} photos.", { value0: MAX_PHOTOS }));
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
      setErrorMessage(appI18n.t("Camera permission is needed to take photos."));
      return;
    }

    const remainingSlots = MAX_PHOTOS - selectedPhotos.length;
    if (remainingSlots <= 0) {
      setErrorMessage(appI18n.t("You can upload up to {{value0}} photos.", { value0: MAX_PHOTOS }));
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
      setErrorMessage(validationErrors[0] ?? appI18n.t("Please complete required fields."));
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
      vehicleCondition: parsedVehicleConditionDetails?.vehicleCondition,
      vehicleConditionNotes: parsedVehicleConditionDetails?.vehicleConditionNotes?.trim() || undefined,
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
              : appI18n.t("Details were saved, but photo upload failed. Please retry.");
          setErrorMessage(appI18n.t("{{value0}} You can retry without losing form data.", { value0: message }));
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
          vehicleDetails,
          vehicleConditionDetails,
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
        error instanceof Error ? error.message : appI18n.t("Failed to save date and item details.");
      const normalized = message.toLowerCase();

      if (normalized.includes('pickup location must be selected')) {
        setErrorMessage(appI18n.t("Pickup location is missing. Redirecting to pickup step..."));
        setTimeout(() => {
          const route = {
            pathname: '/pickup-location',
            params: {
              serviceId,
              serviceKey: serviceKey ?? '',
              vehicleDetails,
              vehicleConditionDetails,
            },
          } as unknown as Href;
          router.push(route);
        }, 700);
        return;
      }

      if (normalized.includes('dropoff location must be selected')) {
        setErrorMessage(appI18n.t("Dropoff location is missing. Redirecting to dropoff step..."));
        setTimeout(() => {
          const route = {
            pathname: '/dropoff-location',
            params: {
              requestId,
              serviceId,
              serviceKey: serviceKey ?? '',
              vehicleDetails,
              vehicleConditionDetails,
              pickupLatitude: params.pickupLatitude ?? '',
              pickupLongitude: params.pickupLongitude ?? '',
              pickupAddress: params.pickupAddress ?? '',
              pickupPlaceId: params.pickupPlaceId ?? '',
            },
          } as unknown as Href;
          router.push(route);
        }, 700);
        return;
      }

      setErrorMessage(message);
    } finally {
      setIsSavingDetails(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(insets.top, 18),
              paddingBottom: Math.max(insets.bottom + 32, 42) + keyboardInset,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroBadge}>
              <IconSymbol name={{ ios: 'calendar', android: 'event', web: 'event' }} color="#111827" size={20} />
            </View>
            <Text style={styles.heroLabel}>{appI18n.t("Request Details")}</Text>
          </View>
          <Text style={styles.title}>{appI18n.t("Date, Item Details & Photos")}</Text>
          <Text style={styles.subtitle}>
            {appI18n.t("Tell us when, what, and show us what you want to transport.")}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{appI18n.t("Date & Time")}</Text>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.optionChip, form.isImmediate && styles.optionChipActive]}
              onPress={() => updateForm('isImmediate', true)}
            >
              <Text style={[styles.optionChipText, form.isImmediate && styles.optionChipTextActive]}>
                {appI18n.t("Immediate pickup")}</Text>
            </Pressable>
            <Pressable
              style={[styles.optionChip, !form.isImmediate && styles.optionChipActive]}
              onPress={() => updateForm('isImmediate', false)}
            >
              <Text style={[styles.optionChipText, !form.isImmediate && styles.optionChipTextActive]}>
                {appI18n.t("Schedule for later")}</Text>
            </Pressable>
          </View>

          {!form.isImmediate ? (
            <View style={styles.datetimeContainer}>
              <Pressable style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
                <View style={styles.pickerIconWrap}>
                  <Text style={styles.pickerIconGlyph}>🗓</Text>
                </View>
                <Text style={styles.pickerButtonLabel}>{appI18n.t("Pickup Date")}</Text>
                <Text style={styles.pickerButtonValue}>
                  {form.scheduledPickupAt ? form.scheduledPickupAt.toLocaleDateString() : 'Select date'}
                </Text>
              </Pressable>
              <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
                <View style={styles.pickerIconWrap}>
                  <Text style={styles.pickerIconGlyph}>🕒</Text>
                </View>
                <Text style={styles.pickerButtonLabel}>{appI18n.t("Pickup Time")}</Text>
                <Text style={styles.pickerButtonValue}>
                  {form.scheduledPickupAt
                    ? form.scheduledPickupAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
                    : 'Select time'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{appI18n.t("Item Details")}</Text>
          <TextInput
            value={form.itemTitle}
            onChangeText={(value) => updateForm('itemTitle', value)}
            placeholder={appI18n.t("BMW 320i 2020 / Sofa set / 10 moving boxes")}
            style={styles.input}
            placeholderTextColor="#98a2b3"
          />

          <Text style={styles.fieldLabel}>{appI18n.t("Item type")}</Text>
          <View style={styles.optionsWrap}>
            {ITEM_TYPE_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.optionChip, form.itemType === option.value && styles.optionChipActive]}
                onPress={() => updateForm('itemType', option.value)}
              >
                <Text style={[styles.optionChipText, form.itemType === option.value && styles.optionChipTextActive]}>
                  {appI18n.t(option.label)}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={form.itemDescription}
            onChangeText={(value) => updateForm('itemDescription', value)}
            placeholder={appI18n.t("Item description (optional)")}
            style={[styles.input, styles.textarea]}
            placeholderTextColor="#98a2b3"
            multiline
          />

          <View style={styles.row}>
            <TextInput
              value={form.itemBrand}
              onChangeText={(value) => updateForm('itemBrand', value)}
              placeholder={appI18n.t("Brand (optional)")}
              style={[styles.input, styles.halfInput]}
              placeholderTextColor="#98a2b3"
            />
            <TextInput
              value={form.itemModel}
              onChangeText={(value) => updateForm('itemModel', value)}
              placeholder={appI18n.t("Model (optional)")}
              style={[styles.input, styles.halfInput]}
              placeholderTextColor="#98a2b3"
            />
          </View>

          <TextInput
            value={form.itemYear}
            onChangeText={(value) => updateForm('itemYear', value)}
            placeholder={appI18n.t("Year (optional)")}
            style={styles.input}
            placeholderTextColor="#98a2b3"
            keyboardType="number-pad"
          />

          <Text style={styles.fieldLabel}>{appI18n.t("Condition (optional)")}</Text>
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
                  {appI18n.t(option.label)}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={form.itemWeightKg}
            onChangeText={(value) => updateForm('itemWeightKg', value)}
            placeholder={appI18n.t("Weight (kg, optional)")}
            style={styles.input}
            placeholderTextColor="#98a2b3"
            keyboardType="decimal-pad"
          />

          <View style={styles.row}>
            <TextInput
              value={form.itemLengthCm}
              onChangeText={(value) => updateForm('itemLengthCm', value)}
              placeholder={appI18n.t("Length cm")}
              style={[styles.input, styles.thirdInput]}
              placeholderTextColor="#98a2b3"
              keyboardType="decimal-pad"
            />
            <TextInput
              value={form.itemWidthCm}
              onChangeText={(value) => updateForm('itemWidthCm', value)}
              placeholder={appI18n.t("Width cm")}
              style={[styles.input, styles.thirdInput]}
              placeholderTextColor="#98a2b3"
              keyboardType="decimal-pad"
            />
            <TextInput
              value={form.itemHeightCm}
              onChangeText={(value) => updateForm('itemHeightCm', value)}
              placeholder={appI18n.t("Height cm")}
              style={[styles.input, styles.thirdInput]}
              placeholderTextColor="#98a2b3"
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{appI18n.t("Requires loading help")}</Text>
            <Switch
              value={form.requiresLoadingHelp}
              trackColor={{ false: '#E5E7EB', true: '#FFD86F' }}
              thumbColor={form.requiresLoadingHelp ? '#FFC548' : '#FFFFFF'}
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
              placeholder={appI18n.t("Loading workers count")}
              style={styles.input}
              placeholderTextColor="#98a2b3"
              keyboardType="number-pad"
            />
          ) : null}

          <TextInput
            value={form.specialInstructions}
            onChangeText={(value) => updateForm('specialInstructions', value)}
            placeholder={appI18n.t("Special instructions (optional)")}
            style={[styles.input, styles.textarea]}
            placeholderTextColor="#98a2b3"
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{appI18n.t("Upload Photos")}</Text>
          <Text style={styles.helperText}>
            {appI18n.t("Add clear photos to help drivers give accurate quotes.")}</Text>
          <Text style={styles.photoCounter}>{selectedPhotos.length} / {MAX_PHOTOS}</Text>

          <View style={styles.row}>
            <Pressable style={[styles.actionButton, styles.halfInput]} onPress={() => void pickFromLibrary()}>
              <IconSymbol name={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }} color="#111827" size={16} />
              <Text style={styles.actionButtonText}>{appI18n.t("Add Photos")}</Text>
            </Pressable>
            <Pressable style={[styles.actionButtonSecondary, styles.halfInput]} onPress={() => void takePhoto()}>
              <IconSymbol name={{ ios: 'camera', android: 'photo_camera', web: 'photo_camera' }} color="#111827" size={16} />
              <Text style={styles.actionButtonSecondaryText}>{appI18n.t("Take Photo")}</Text>
            </Pressable>
          </View>

          <View style={styles.photoGrid}>
            {selectedPhotos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoItem}>
                <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
                <Pressable style={styles.removePhotoButton} onPress={() => removePhoto(index)}>
                  <Text style={styles.removePhotoText}>{appI18n.t("Remove")}</Text>
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

        {isSavingDetails ? <Text style={styles.progressText}>{appI18n.t("Saving details...")}</Text> : null}
        {isUploadingPhotos ? <Text style={styles.progressText}>{appI18n.t("Uploading photos...")}</Text> : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </ScrollView>

      {showDatePicker ? (
        <DateTimePicker
          value={form.scheduledPickupAt ?? defaultScheduledPickupAt}
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
          value={form.scheduledPickupAt ?? defaultScheduledPickupAt}
          mode="time"
          is24Hour={true}
          locale="en_GB"
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

      <View style={styles.footerBar}>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          disabled={!canContinue}
          onPress={() => void onContinue()}
        >
          {isBusy ? <ActivityIndicator color="#111827" /> : <Text style={styles.continueText}>{appI18n.t("Continue")}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  content: {
    paddingHorizontal: 20,
    gap: 12,
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
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: '#68768A',
    lineHeight: 22,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EF',
    borderRadius: 24,
    padding: 18,
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionChip: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  optionChipActive: {
    borderColor: '#FFC548',
    backgroundColor: '#FFC548',
  },
  optionChipText: {
    color: '#68768A',
    fontSize: 13,
    fontWeight: '700',
  },
  optionChipTextActive: {
    color: '#111827',
  },
  datetimeContainer: {
    flexDirection: 'row',
    gap: 12,
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
    fontSize: 12,
    color: '#68768A',
  },
  pickerButtonValue: {
    marginTop: 4,
    fontSize: 15,
    color: '#111827',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    minHeight: 56,
    paddingHorizontal: 14,
    color: '#111827',
    fontSize: 14,
  },
  textarea: {
    minHeight: 96,
    height: 96,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  thirdInput: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
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
    fontWeight: '700',
  },
  helperText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#68768A',
  },
  photoCounter: {
    fontSize: 13,
    fontWeight: '700',
    color: '#68768A',
  },
  actionButton: {
    backgroundColor: '#FFC548',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 14,
  },
  actionButtonSecondaryText: {
    color: '#111827',
    fontWeight: '800',
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
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
  removePhotoButton: {
    marginTop: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 4,
  },
  removePhotoText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
  },
  validationCard: {
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  validationText: {
    color: '#B42318',
    fontSize: 13,
  },
  progressText: {
    fontSize: 13,
    color: '#D89A1A',
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
  },
  footerBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#FAFAFA',
  },
  continueButton: {
    height: 56,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
});
