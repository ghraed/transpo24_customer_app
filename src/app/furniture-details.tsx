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
  FurnitureDetailsRouteParams,
  FurnitureTransportFormData,
  LocalPhotoAsset,
  PendingFurnitureDetailsPayload,
} from '@/types/customer-request';
import appI18n from '@/localization/i18n';

const MAX_PHOTOS = 8;

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
    return appI18n.t("Please add at least one furniture photo.");
  }

  if (!form.furnitureDescription.trim()) {
    return appI18n.t("Please describe the furniture to be transported.");
  }

  const itemCount = Number(form.approximateItemCount);
  if (!Number.isInteger(itemCount) || itemCount < 1) {
    return appI18n.t("Approximate item count must be at least 1.");
  }

  if (form.needsHelpers) {
    const helpersCount = Number(form.helpersCount);
    if (!Number.isInteger(helpersCount) || helpersCount < 1) {
      return appI18n.t("Please add a valid number of helpers.");
    }
  }

  if (Number.isNaN(form.movingDate.getTime())) {
    return appI18n.t("Please select a valid moving date.");
  }

  if (!form.isImmediate && form.movingDate.getTime() <= Date.now()) {
    return appI18n.t("Scheduled pickup must be in the future.");
  }

  return null;
}

export default function FurnitureDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<FurnitureDetailsRouteParams>();
  const keyboardInset = useAndroidKeyboardInset();
  const insets = useSafeAreaInsets();

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
      setErrorMessage(appI18n.t("Missing selected service. Please go back and choose a service again."));
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
              paddingTop: Math.max(insets.top, 10),
              paddingBottom: keyboardInset > 0 ? keyboardInset + 32 : 44,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <IconSymbol name="bed.double.fill" size={22} color="#111827" />
            </View>
            <Text style={styles.title}>{appI18n.t("Prepare your furniture move")}</Text>
            <Text style={styles.subtitle}>
              {appI18n.t("Add photos, item details, helper needs, and moving time before choosing the pickup location.")}</Text>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{appI18n.t("Furniture Photos")}</Text>
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
                <Text style={styles.primaryButtonText}>{appI18n.t("Add Photos")}</Text>
              </Pressable>
              <Pressable
                style={[styles.outlineButton, styles.flexButton]}
                onPress={() => void takePhoto()}
              >
                <IconSymbol name="camera" size={16} color="#111827" />
                <Text style={styles.outlineButtonText}>{appI18n.t("Take Photo")}</Text>
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              {appI18n.t("Add clear furniture photos so drivers can suggest the right helpers and equipment.")}</Text>

            {isPickingPhoto ? <ActivityIndicator color="#2563EB" style={styles.loader} /> : null}

            {selectedPhotos.length > 0 ? (
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
            ) : (
              <View style={styles.emptyPhotoState}>
                <IconSymbol name="photo" size={20} color="#98A2B3" />
                <Text style={styles.emptyPhotoText}>
                  {appI18n.t("Upload at least one photo so drivers can estimate handling and loading support.")}</Text>
              </View>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{appI18n.t("Furniture Information")}</Text>
            <Text style={styles.label}>{appI18n.t("Furniture Description")}</Text>
            <TextInput
              value={form.furnitureDescription}
              onChangeText={(value) => {
                setForm((prev) => ({ ...prev, furnitureDescription: value }));
                setErrorMessage('');
              }}
              placeholder={appI18n.t("Examples: sofas, refrigerator, bed, cabinets")}
              placeholderTextColor="#98A2B3"
              style={[styles.input, styles.multilineInput]}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>{appI18n.t("Approximate Number of Items")}</Text>
            <TextInput
              value={form.approximateItemCount}
              onChangeText={(value) => {
                setForm((prev) => ({ ...prev, approximateItemCount: value }));
                setErrorMessage('');
              }}
              placeholder={appI18n.t("Enter item count")}
              placeholderTextColor="#98A2B3"
              style={styles.input}
              keyboardType="number-pad"
            />
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{appI18n.t("Pickup Time")}</Text>
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
                  {appI18n.t("Schedule later")}</Text>
              </Pressable>
            </View>

            {!form.isImmediate ? (
              <View style={styles.datetimeContainer}>
                <Pressable style={styles.pickerButton} onPress={() => setShowDatePicker(true)}>
                  <View style={styles.pickerIconWrap}>
                    <Text style={styles.pickerIconGlyph}>🗓</Text>
                  </View>
                  <Text style={styles.pickerButtonLabel}>{appI18n.t("Pickup Date")}</Text>
                  <Text style={styles.pickerButtonValue}>{form.movingDate.toLocaleDateString()}</Text>
                </Pressable>
                <Pressable style={styles.pickerButton} onPress={() => setShowTimePicker(true)}>
                  <View style={styles.pickerIconWrap}>
                    <Text style={styles.pickerIconGlyph}>🕒</Text>
                  </View>
                  <Text style={styles.pickerButtonLabel}>{appI18n.t("Pickup Time")}</Text>
                  <Text style={styles.pickerButtonValue}>
                    {form.movingDate.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helperText}>
                {appI18n.t("We’ll start matching a driver as soon as the request is submitted.")}</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{appI18n.t("Helpers & Loading")}</Text>

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchLabel}>{appI18n.t("I need helper")}</Text>
                <Text style={styles.switchDescription}>
                  {appI18n.t("Add helpers if the furniture requires extra loading support.")}</Text>
              </View>
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
                  {form.needsHelpers ? appI18n.t('Yes') : appI18n.t('No')}
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
                placeholder={appI18n.t("Number of helpers")}
                placeholderTextColor="#98A2B3"
                style={[styles.input, styles.helperInput]}
                keyboardType="number-pad"
              />
            ) : null}

            <View style={styles.divider} />

            <View style={styles.switchRow}>
              <View style={styles.switchCopy}>
                <Text style={styles.switchLabel}>{appI18n.t("I can help with loading")}</Text>
                <Text style={styles.switchDescription}>
                  {appI18n.t("Let drivers know if you can assist with carrying or loading items.")}</Text>
              </View>
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
                  {form.customerCanHelpLoading ? appI18n.t('Yes') : appI18n.t('No')}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.helperText}>
              {appI18n.t("Drivers can still suggest the final helper count after reviewing the photos.")}</Text>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable
            style={[styles.continueButton, !canContinue && styles.continueDisabled]}
            onPress={onContinue}
            disabled={!canContinue}
          >
            <Text style={styles.continueText}>{appI18n.t("Continue to Pickup Location")}</Text>
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
                next.setHours(form.movingDate.getHours(), form.movingDate.getMinutes(), 0, 0);
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
              is24Hour={true}
              locale="en_GB"
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
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
  helperText: {
    marginTop: 12,
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
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
  removePhotoButton: {
    alignSelf: 'flex-start',
  },
  removePhotoText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    marginTop: 14,
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
  helperInput: {
    marginTop: 14,
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
  datetimeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
    fontSize: 13,
    color: '#68768A',
    marginBottom: 4,
  },
  pickerButtonValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
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
