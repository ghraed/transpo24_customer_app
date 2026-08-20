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

import { decodeVehicleVin } from '@/lib/api';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import type {
  LocalPhotoAsset,
  MotorcycleCondition,
  MotorcycleDetailsRouteParams,
  MotorcycleTransportFormData,
  MotorcycleType,
  PendingMotorcycleDetailsPayload,
} from '@/types/customer-request';
import type { DecodedVinResult } from '@/types/vehicle';
import {
  getVinValidationMessage,
  INVALID_VIN_MESSAGE,
  normalizeVinInput,
  sanitizeVin,
  VIN_DECODE_EMPTY_RESULT_MESSAGE,
  VIN_DECODE_NETWORK_ERROR_MESSAGE,
} from '@/utils/vin';
import appI18n from '@/localization/i18n';

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
      <Text style={styles.label}>{appI18n.t(props.label)}</Text>
      <Pressable style={styles.dropdownButton} onPress={props.onToggle}>
        <Text style={props.valueLabel ? styles.dropdownValue : styles.dropdownPlaceholder}>
          {props.valueLabel || appI18n.t(props.placeholder)}
        </Text>
        <Text style={styles.dropdownChevron}>{props.isOpen ? '▲' : '▼'}</Text>
      </Pressable>
      {props.isOpen ? (
        <View style={styles.dropdownPanel}>
          <TextInput
            value={props.searchText}
            onChangeText={props.onSearchChange}
            placeholder={appI18n.t("Search...")}
            placeholderTextColor="#98a2b3"
            style={styles.dropdownSearch}
          />
          <ScrollView style={styles.dropdownList} nestedScrollEnabled>
            {props.options.length === 0 ? (
              <Text style={styles.emptyText}>{appI18n.t("No results")}</Text>
            ) : (
              props.options.map((option) => (
                <Pressable key={option.id} style={styles.dropdownItem} onPress={() => props.onSelect(option)}>
                  <Text style={styles.dropdownItemText}>{appI18n.t(option.label)}</Text>
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

function formatValidationMessage(form: MotorcycleTransportFormData): string | null {
  if (form.chassisNumber.trim()) {
    const vinError = getVinValidationMessage(form.chassisNumber);
    if (vinError) {
      return vinError;
    }
  }

  if (!form.motorcycleType) {
    return appI18n.t("Please select the motorcycle type.");
  }

  if (!form.motorcycleCondition) {
    return appI18n.t("Please select the motorcycle condition.");
  }

  if (!form.isImmediate && form.scheduledPickupAt.getTime() <= Date.now()) {
    return appI18n.t("Scheduled pickup must be in the future.");
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
  const keyboardInset = useAndroidKeyboardInset();
  const insets = useSafeAreaInsets();

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
      setErrorMessage(appI18n.t("Missing selected service. Please go back and choose a service again."));
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
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const takePhoto = async (): Promise<void> => {
    setIsPickingPhoto(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== ImagePicker.PermissionStatus.GRANTED) {
        setErrorMessage(appI18n.t("Camera permission is needed to take photos."));
        return;
      }

      if (selectedPhotos.length >= MAX_PHOTOS) {
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
            paddingTop: Math.max(10, insets.top + 4),
            paddingBottom: Math.max(30, insets.bottom + 18) + keyboardInset,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.heroBlock}>
        <Text style={styles.title}>{appI18n.t("Tell us about the motorcycle")}</Text>
        <Text style={styles.subtitle}>
          {appI18n.t("Add the motorcycle details, pickup timing and photos before choosing the route.")}</Text>
      </View>

      <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{appI18n.t("Manual Motorcycle Selection")}</Text>
      <SearchableDropdown
        label={appI18n.t("Motorcycle Type")}
        placeholder={appI18n.t("Select motorcycle type")}
        options={typeOptions}
        valueLabel={appI18n.t(MOTORCYCLE_TYPE_OPTIONS.find((option) => option.value === form.motorcycleType)?.label ?? '')}
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
      </View>

      <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{appI18n.t("VIN / Chassis")}</Text>
      <Text style={styles.sectionHint}>{appI18n.t("Use VIN decode if you want us to prefill the details automatically.")}</Text>
      <Text style={styles.label}>{appI18n.t("VIN / Chassis Number (optional)")}</Text>
      <TextInput
        value={form.chassisNumber}
        onChangeText={(value) => {
          setForm((prev) => ({ ...prev, chassisNumber: normalizeVinInput(value) }));
          setDecodedVin(null);
          setVinMessage('');
          setErrorMessage('');
        }}
        placeholder={appI18n.t("Enter 17-character VIN")}
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
          <ActivityIndicator color="#111827" />
        ) : (
          <Text style={styles.secondaryButtonText}>{appI18n.t("Decode VIN")}</Text>
        )}
      </Pressable>
      {vinMessage ? <Text style={styles.infoText}>{vinMessage}</Text> : null}
      {decodedVin ? (
        <View style={styles.decodedCard}>
          <Text style={styles.decodedTitle}>{appI18n.t("Decoded VIN details")}</Text>
          {decodedVin.make ? <Text style={styles.decodedText}>{appI18n.t("Make:")} {decodedVin.make}</Text> : null}
          {decodedVin.model ? <Text style={styles.decodedText}>{appI18n.t("Model:")} {decodedVin.model}</Text> : null}
          {decodedVin.year ? <Text style={styles.decodedText}>{appI18n.t("Year:")} {decodedVin.year}</Text> : null}
          {decodedVin.trim ? <Text style={styles.decodedText}>{appI18n.t("Trim:")} {decodedVin.trim}</Text> : null}
          {decodedVin.vehicleType ? (
            <Text style={styles.decodedText}>{appI18n.t("Vehicle type:")} {decodedVin.vehicleType}</Text>
          ) : null}
          {decodedVin.bodyClass ? (
            <Text style={styles.decodedText}>{appI18n.t("Body class:")} {decodedVin.bodyClass}</Text>
          ) : null}
        </View>
      ) : null}
      </View>

      <View style={styles.sectionCard}>
      <SearchableDropdown
        label={appI18n.t("Motorcycle Condition")}
        placeholder={appI18n.t("Select motorcycle condition")}
        options={conditionOptions}
        valueLabel={appI18n.t(MOTORCYCLE_CONDITION_OPTIONS.find((option) => option.value === form.motorcycleCondition)?.label ?? '')}
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
      </View>

      <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{appI18n.t("Transport Requirements")}</Text>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{appI18n.t("Requires special wrapping")}</Text>
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
            {form.requiresSpecialWrapping ? appI18n.t('Yes') : appI18n.t('No')}
          </Text>
        </Pressable>
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{appI18n.t("Requires dedicated carrier")}</Text>
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
            {form.requiresDedicatedCarrier ? appI18n.t('Yes') : appI18n.t('No')}
          </Text>
        </Pressable>
      </View>
      </View>

      <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{appI18n.t("Date & Time")}</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.optionChip, form.isImmediate && styles.optionChipActive]}
          onPress={() => setForm((prev) => ({ ...prev, isImmediate: true }))}
        >
          <Text style={[styles.optionChipText, form.isImmediate && styles.optionChipTextActive]}>
            {appI18n.t("Immediate pickup")}</Text>
        </Pressable>
        <Pressable
          style={[styles.optionChip, !form.isImmediate && styles.optionChipActive]}
          onPress={() => setForm((prev) => ({ ...prev, isImmediate: false }))}
        >
          <Text style={[styles.optionChipText, !form.isImmediate && styles.optionChipTextActive]}>
            {appI18n.t("Schedule for later")}</Text>
        </Pressable>
      </View>

      {!form.isImmediate ? (
        <View style={styles.datetimeContainer}>
          <Pressable style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.pickerButtonLabel}>{appI18n.t("Pickup Date")}</Text>
            <Text style={styles.pickerButtonValue}>
              {form.scheduledPickupAt.toLocaleDateString()}
            </Text>
          </Pressable>
          <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.pickerButtonLabel}>{appI18n.t("Pickup Time")}</Text>
            <Text style={styles.pickerButtonValue}>
              {form.scheduledPickupAt.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </Text>
          </Pressable>
        </View>
      ) : null}
      </View>

      <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{appI18n.t("Upload Photos")}</Text>
      <Text style={styles.photoCounter}>{selectedPhotos.length} / {MAX_PHOTOS}</Text>
      <View style={styles.actionsRow}>
        <Pressable style={[styles.secondaryButton, styles.flexButton]} onPress={() => void pickFromLibrary()}>
          <Text style={styles.secondaryButtonText}>{appI18n.t("Add Photos")}</Text>
        </Pressable>
        <Pressable style={[styles.photoButton, styles.flexButton]} onPress={() => void takePhoto()}>
          <Text style={styles.photoButtonText}>{appI18n.t("Take Photo")}</Text>
        </Pressable>
      </View>
      {isPickingPhoto ? <ActivityIndicator color="#111827" style={styles.loader} /> : null}
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

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <Pressable
        style={[styles.continueButton, !canContinue && styles.continueDisabled]}
        onPress={onContinue}
        disabled={!canContinue}
      >
        <Text style={styles.continueText}>{appI18n.t("Continue to Pickup Location")}</Text>
        <IconSymbol
          name={{ ios: 'arrow.right', android: 'east', web: 'east' }}
          color="#FFFFFF"
          size={18}
        />
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
            is24Hour={true}
            locale="en_GB"
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
    marginBottom: 6,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    minHeight: 54,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
  },
  dropdownValue: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
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
    borderColor: '#D9DFE8',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  dropdownSearch: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E8EF',
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
    borderTopColor: '#EEF2F7',
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
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  infoText: {
    color: '#68768A',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  decodedCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F8E1A1',
    backgroundColor: '#FFF8E6',
    gap: 4,
  },
  decodedTitle: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  decodedText: {
    color: '#68768A',
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
    borderColor: '#D9DFE8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  optionChipActive: {
    borderColor: '#FFC548',
    backgroundColor: '#FFC548',
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  optionChipTextActive: {
    color: '#111827',
  },
  datetimeContainer: {
    marginTop: 12,
    gap: 12,
  },
  pickerButton: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  pickerButtonLabel: {
    fontSize: 13,
    color: '#98A2B3',
    marginBottom: 4,
  },
  pickerButtonValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
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
    color: '#111827',
    fontWeight: '500',
  },
  switchChip: {
    minWidth: 74,
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D9DFE8',
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
    color: '#111827',
  },
  switchChipTextActive: {
    color: '#111827',
  },
  photoCounter: {
    marginBottom: 8,
    color: '#68768A',
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFC548',
    paddingHorizontal: 14,
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  photoButton: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
  },
  photoButtonText: {
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
  },
  photoItem: {
    width: '47%',
  },
  photoPreview: {
    width: '100%',
    height: 120,
    borderRadius: 14,
    backgroundColor: '#EEF2F7',
    marginBottom: 6,
  },
  removePhotoButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#F4C7C3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removePhotoText: {
    color: '#C0392B',
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    color: '#C0392B',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 16,
    lineHeight: 20,
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
    opacity: 0.5,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
