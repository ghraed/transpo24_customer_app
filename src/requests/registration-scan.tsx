import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import { extractRegistrationCard, getVehicleModels } from '@/lib/api';
import { getAuthSessionSnapshot, subscribeAuthSession } from '@/lib/auth-token';
import type { LocalPhotoAsset } from '@/types/customer-request';
import type { VehicleCatalogBrand, VehicleCatalogModel } from '@/types/vehicle';
import type {
  RegistrationExtraction,
  RegistrationFieldName,
} from '@/types/registration';
import {
  applyRegistrationReview,
  defaultScanSelection,
  exactCatalogMatch,
  invalidScanField,
  sameVehicle,
  SCAN_FORM_FIELDS,
  scanValues,
  type FormVehicle,
  type ScanFormField,
  type ScanSelection,
  type ScanValues,
} from './registration-mapping';

const labels: Record<ScanFormField, string> = {
  vin: 'vin',
  registration: 'registration',
  brand: 'brand',
  model: 'model',
  year: 'year',
  weight: 'weight',
  bodyType: 'bodyType',
  transmission: 'transmission',
};
const extractionNames: Record<ScanFormField, RegistrationFieldName> = {
  vin: 'vin',
  registration: 'swissRegistrationNumber',
  brand: 'brand',
  model: 'model',
  year: 'manufactureYear',
  weight: 'emptyWeightKg',
  bodyType: 'bodyType',
  transmission: 'transmission',
};

function ScanButton({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(title)}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, disabled && styles.disabled]}
    >
      <Text style={styles.text}>{t(title)}</Text>
    </Pressable>
  );
}

export function RegistrationScan({
  value,
  brands,
  onApply,
}: {
  value: FormVehicle;
  brands: VehicleCatalogBrand[];
  onApply: (value: FormVehicle) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<LocalPhotoAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [result, setResult] = useState<RegistrationExtraction | null>(null);
  const [values, setValues] = useState<ScanValues | null>(null);
  const [selected, setSelected] = useState<ScanSelection | null>(null);
  const [catalogModels, setCatalogModels] = useState<{
    brandId: string;
    items: VehicleCatalogModel[];
  } | null>(null);
  const [manualApproved, setManualApproved] = useState(false);
  const [expandedChoice, setExpandedChoice] = useState<ScanFormField | null>(
    null,
  );
  const current = useRef(value);
  useLayoutEffect(() => {
    current.current = value;
  }, [value]);
  const baseline = useRef(value);
  const original = useRef<ScanValues | null>(null);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownedFiles = useRef(new Set<string>());
  const busyRef = useRef(false);
  const imageRef = useRef(images);
  const cleanupFile = (uri: string) => {
    if (!ownedFiles.current.delete(uri)) return;
    if (Platform.OS !== 'web') {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        /* Cache expiration is safe. */
      }
    } else if (uri.startsWith('blob:')) URL.revokeObjectURL(uri);
  };
  const cleanup = () => {
    for (const uri of [...ownedFiles.current]) cleanupFile(uri);
  };
  const invalidate = () => {
    epoch.current++;
    if (scanTimer.current !== null) clearTimeout(scanTimer.current);
    scanTimer.current = null;
    controller.current?.abort();
    controller.current = null;
  };
  const close = () => {
    invalidate();
    cleanup();
    imageRef.current = [];
    setImages([]);
    setOpen(false);
    setResult(null);
    setValues(null);
    setSelected(null);
    busyRef.current = false;
    setBusy(false);
    setProgress(null);
    setError('');
    setPermissionDenied(false);
    setManualApproved(false);
  };
  useEffect(() => {
    const owner = getAuthSessionSnapshot().user?.id;
    const unsubscribe = subscribeAuthSession(() => {
      if (getAuthSessionSnapshot().user?.id !== owner) close();
    });
    return () => {
      unsubscribe();
      invalidate();
      cleanup();
    };
    // Only mount/unmount and account identity changes own this ephemeral session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveBrand = values && selected?.brand ? values.brand : value.brand;
  const matchedBrandId = exactCatalogMatch(brands, effectiveBrand)?.id;
  const modelsLoading =
    !!result && !!matchedBrandId && catalogModels?.brandId !== matchedBrandId;
  const models =
    catalogModels?.brandId === matchedBrandId
      ? (catalogModels?.items ?? [])
      : [];
  useEffect(() => {
    let active = true;
    if (!result || !matchedBrandId) return;
    void getVehicleModels(matchedBrandId)
      .then((next) => {
        if (active) setCatalogModels({ brandId: matchedBrandId, items: next });
      })
      .catch(() => {
        if (active) {
          setCatalogModels({ brandId: matchedBrandId, items: [] });
          setError('vehicleRequest.scan.catalogReview');
        }
      });
    return () => {
      active = false;
    };
  }, [matchedBrandId, result]);

  const changeImages = (next: LocalPhotoAsset[]) => {
    invalidate();
    setResult(null);
    setValues(null);
    setSelected(null);
    setError('');
    setProgress(null);
    busyRef.current = false;
    setBusy(false);
    imageRef.current = next;
    setImages(next);
  };
  const prepare = async (
    uri: string,
    rotation = 0,
  ): Promise<LocalPhotoAsset> => {
    const context = ImageManipulator.manipulate(uri);
    try {
      if (rotation) context.rotate(rotation);
      const decoded = await context.renderAsync();
      try {
        if (decoded.width < 64 || decoded.height < 64)
          throw new Error('vehicleRequest.scan.invalidImage');
        if (Math.max(decoded.width, decoded.height) > 4000) {
          context.resize(
            decoded.width >= decoded.height
              ? { width: 4000 }
              : { height: 4000 },
          );
        }
        const normalized = await context.renderAsync();
        try {
          const saved = await normalized.saveAsync({
            format: SaveFormat.JPEG,
            compress: 0.95,
            base64: false,
          });
          ownedFiles.current.add(saved.uri);
          const size =
            Platform.OS === 'web'
              ? (await (await fetch(saved.uri)).blob()).size
              : new File(saved.uri).size;
          if (size > 8 * 1024 * 1024) {
            cleanupFile(saved.uri);
            throw new Error('vehicleRequest.scan.tooLarge');
          }
          return {
            uri: saved.uri,
            mimeType: 'image/jpeg',
            fileName: 'registration-card.jpg',
          };
        } finally {
          normalized.release();
        }
      } finally {
        decoded.release();
      }
    } finally {
      context.release();
    }
  };
  const choose = async (camera: boolean, replaceIndex?: number) => {
    if (
      busyRef.current ||
      (replaceIndex === undefined && imageRef.current.length >= 2)
    )
      return;
    invalidate();
    const id = epoch.current;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setPermissionDenied(false);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          if (id === epoch.current) {
            setPermissionDenied(true);
            setError('vehicleRequest.scan.permission');
          }
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: false,
        allowsMultipleSelection: false,
        quality: 1,
        exif: false,
        base64: false,
      };
      const picked = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (picked.canceled || id !== epoch.current) return;
      const asset = picked.assets[0];
      if (Platform.OS !== 'web' && asset.uri.startsWith(Paths.cache.uri))
        ownedFiles.current.add(asset.uri);
      const prepared = await prepare(asset.uri);
      if (asset.uri !== prepared.uri) cleanupFile(asset.uri);
      if (id !== epoch.current) {
        cleanupFile(prepared.uri);
        return;
      }
      const next = [...imageRef.current];
      if (replaceIndex === undefined) next.push(prepared);
      else {
        cleanupFile(next[replaceIndex].uri);
        next[replaceIndex] = prepared;
      }
      changeImages(next);
    } catch (e) {
      if (id === epoch.current)
        setError(
          e instanceof Error && e.message.startsWith('vehicleRequest.scan.')
            ? e.message
            : 'vehicleRequest.scan.invalidImage',
        );
    } finally {
      if (id === epoch.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const rotate = async (index: number) => {
    if (busyRef.current) return;
    invalidate();
    const id = epoch.current;
    busyRef.current = true;
    setBusy(true);
    try {
      const prepared = await prepare(imageRef.current[index].uri, 90);
      if (id !== epoch.current) {
        cleanupFile(prepared.uri);
        return;
      }
      const next = [...imageRef.current];
      cleanupFile(next[index].uri);
      next[index] = prepared;
      changeImages(next);
    } catch {
      if (id === epoch.current) setError('vehicleRequest.scan.invalidImage');
    } finally {
      if (id === epoch.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  };
  const scan = async () => {
    if (busyRef.current || !imageRef.current.length) return;
    invalidate();
    const id = epoch.current;
    const abort = new AbortController();
    controller.current = abort;
    busyRef.current = true;
    setBusy(true);
    setProgress(0);
    setError('');
    try {
      const timeout = new Promise<never>((_, reject) => {
        scanTimer.current = setTimeout(() => {
          reject({ code: 'REGISTRATION_TIMEOUT' });
          abort.abort();
        }, 90000);
      });
      const extracted = await Promise.race([
        extractRegistrationCard(imageRef.current, {
          signal: abort.signal,
          onProgress: (n) => {
            if (id === epoch.current && !abort.signal.aborted) setProgress(n);
          },
        }),
        timeout,
      ]);
      if (id !== epoch.current) return;
      if (
        extracted.status === 'wrong_document' ||
        extracted.status === 'unreadable'
      ) {
        setError(`vehicleRequest.scan.${extracted.status}`);
        return;
      }
      const next = scanValues(extracted);
      if (!SCAN_FORM_FIELDS.some((name) => next[name].trim())) {
        setError('vehicleRequest.scan.noDetails');
        return;
      }
      baseline.current = { ...current.current };
      original.current = next;
      setValues(next);
      setSelected(defaultScanSelection(current.current, next));
      setManualApproved(false);
      setResult(extracted);
    } catch (e) {
      if (id === epoch.current) {
        const code = (e as { code?: string }).code;
        const known = [
          'REGISTRATION_INVALID_UPLOAD',
          'REGISTRATION_CONFIGURATION',
          'REGISTRATION_TIMEOUT',
          'REGISTRATION_RATE_LIMIT',
          'REGISTRATION_UNAVAILABLE',
          'REGISTRATION_INVALID_OUTPUT',
          'REGISTRATION_AUTH_REQUIRED',
        ];
        setError(
          `vehicleRequest.scan.${known.includes(code ?? '') ? code : 'REGISTRATION_UNAVAILABLE'}`,
        );
      }
    } finally {
      if (id === epoch.current) {
        if (scanTimer.current !== null) clearTimeout(scanTimer.current);
        scanTimer.current = null;
        controller.current = null;
        busyRef.current = false;
        setBusy(false);
        setProgress(null);
      }
    }
  };
  const confirm = () => {
    if (!values || !selected || !original.current || modelsLoading) return;
    if (!sameVehicle(baseline.current, current.current)) {
      baseline.current = { ...current.current };
      setSelected(defaultScanSelection(current.current, values));
      setManualApproved(false);
      setError('vehicleRequest.scan.editsChanged');
      return;
    }
    try {
      const next = applyRegistrationReview(
        current.current,
        values,
        selected,
        brands,
        models,
        manualApproved,
        original.current,
      );
      onApply(next);
      close();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'vehicleRequest.scan.invalidValue',
      );
    }
  };
  return (
    <View style={styles.card}>
      {
        <ScanButton
          title={'vehicleRequest.scan.title'}
          onPress={() => {
            setOpen(true);
            setError('');
          }}
        />
      }
      <Text style={styles.text}>{t('vehicleRequest.scan.intro')}</Text>
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={[styles.screen, { direction: i18n.dir() }]}>
          <View style={styles.row}>
            <Text style={styles.heading}>
              {t(
                result
                  ? 'vehicleRequest.scan.review'
                  : 'vehicleRequest.scan.title',
              )}
            </Text>
            {<ScanButton title={'vehicleRequest.close'} onPress={close} />}
          </View>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.feedbackError}>
              {t(error)}
            </Text>
          ) : null}
          {result ? (
            <Text accessibilityLiveRegion="polite" style={styles.feedbackSuccess}>
              {t(result.status === 'partial'
                ? 'vehicleRequest.scan.partialSuccess'
                : 'vehicleRequest.scan.success')}
            </Text>
          ) : null}
          {busy ? (
            <View accessibilityLiveRegion="polite" style={styles.feedbackProgress}>
              <ActivityIndicator color="#111827" />
              <Text style={styles.text}>
                {t(
                  progress === null
                    ? 'vehicleRequest.scan.preparing'
                    : progress >= 1
                      ? 'vehicleRequest.scan.processing'
                      : 'vehicleRequest.scan.uploading',
                  { progress: Math.round((progress ?? 0) * 100) },
                )}
              </Text>
            </View>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {permissionDenied ? (
              <ScanButton
                title={'vehicleRequest.scan.settings'}
                onPress={() => {
                  void Linking.openSettings();
                }}
              />
            ) : null}
            {!result ? (
              <>
                <Text style={styles.text}>
                  {t('vehicleRequest.scan.disclosure')}
                </Text>
                <Text style={styles.text}>
                  {t('vehicleRequest.scan.instructions')}
                </Text>
                {images.map((photo, index) => (
                  <View key={photo.uri} style={styles.card}>
                    <Text style={styles.label}>
                      {t(
                        index === 0
                          ? 'vehicleRequest.scan.front'
                          : 'vehicleRequest.scan.back',
                      )}
                    </Text>
                    <Image
                      accessibilityLabel={t('vehicleRequest.scan.preview')}
                      source={{ uri: photo.uri }}
                      style={styles.preview}
                      resizeMode="contain"
                    />
                    <View style={styles.row}>
                      {
                        <ScanButton
                          title={'vehicleRequest.scan.retake'}
                          onPress={() => {
                            void choose(true, index);
                          }}
                          disabled={busy}
                        />
                      }
                      {
                        <ScanButton
                          title={'vehicleRequest.scan.replace'}
                          onPress={() => {
                            void choose(false, index);
                          }}
                          disabled={busy}
                        />
                      }
                    </View>
                    <View style={styles.row}>
                      {
                        <ScanButton
                          title={'vehicleRequest.scan.rotate'}
                          onPress={() => {
                            void rotate(index);
                          }}
                          disabled={busy}
                        />
                      }
                      {
                        <ScanButton
                          title={'vehicleRequest.scan.remove'}
                          onPress={() => {
                            cleanupFile(photo.uri);
                            changeImages(
                              imageRef.current.filter((_, i) => i !== index),
                            );
                          }}
                          disabled={busy}
                        />
                      }
                    </View>
                  </View>
                ))}
                {images.length < 2 ? (
                  <View style={styles.row}>
                    {
                      <ScanButton
                        title={'vehicleRequest.scan.camera'}
                        onPress={() => {
                          void choose(true);
                        }}
                        disabled={busy}
                      />
                    }
                    {
                      <ScanButton
                        title={'vehicleRequest.scan.gallery'}
                        onPress={() => {
                          void choose(false);
                        }}
                        disabled={busy}
                      />
                    }
                  </View>
                ) : null}
                {
                  <ScanButton
                    title={'vehicleRequest.scan.extract'}
                    onPress={() => {
                      void scan();
                    }}
                    disabled={busy || !images.length}
                  />
                }
                {
                  <ScanButton
                    title={'vehicleRequest.scan.manual'}
                    onPress={close}
                  />
                }
              </>
            ) : values && selected ? (
              <>
                <Text style={styles.text}>
                  {t('vehicleRequest.scan.reviewNotice')}
                </Text>
                {result.warnings.map((warning, index) => (
                  <Text key={index} style={styles.error}>
                    {t('vehicleRequest.scan.warning', {
                      field: warning.field
                        ? t(
                            `vehicleRequest.${labels[SCAN_FORM_FIELDS.find((name) => extractionNames[name] === warning.field)!]}`,
                          )
                        : '',
                    })}
                  </Text>
                ))}
                {SCAN_FORM_FIELDS.map((name) => (
                  <View key={name} style={styles.card}>
                    <Text style={styles.label}>
                      {t(`vehicleRequest.${labels[name]}`)}
                    </Text>
                    {value[name] ? (
                      <Text style={styles.text}>
                        {t('vehicleRequest.scan.currentValue', {
                          value: value[name],
                        })}
                      </Text>
                    ) : null}
                    <Text style={styles.text}>
                      {t(
                        `vehicleRequest.scan.status.${result.fields[extractionNames[name]].status}`,
                      )}
                    </Text>
                    {result.fields[extractionNames[name]].evidence.map(
                      (e, index) => (
                        <Text key={index} style={styles.evidence}>
                          {e.label}: {e.printedValue}
                          {e.unit ? ` ${e.unit}` : ''}
                        </Text>
                      ),
                    )}
                    {name === 'bodyType' || name === 'transmission' ? (
                      <>
                        {
                          <ScanButton
                            title={`vehicleRequest.${labels[name]}`}
                            onPress={() =>
                              setExpandedChoice(
                                expandedChoice === name ? null : name,
                              )
                            }
                          />
                        }
                        <Text style={styles.text}>
                          {values[name]
                            ? t(
                                name === 'bodyType'
                                  ? `vehicleRequest.body.${values[name]}`
                                  : `vehicleRequest.transmissionType.${values[name]}`,
                              )
                            : t('vehicleRequest.select')}
                        </Text>
                        {expandedChoice === name
                          ? (name === 'bodyType'
                              ? [
                                  'SEDAN',
                                  'HATCHBACK',
                                  'ESTATE',
                                  'SUV',
                                  'VAN',
                                  'PICKUP',
                                  'COUPE',
                                  'CONVERTIBLE',
                                  'OTHER',
                                ]
                              : ['MANUAL', 'AUTOMATIC', 'OTHER']
                            ).map((option) => (
                              <Pressable
                                key={option}
                                accessibilityRole="radio"
                                accessibilityState={{
                                  selected: values[name] === option,
                                }}
                                onPress={() => {
                                  setValues({ ...values, [name]: option });
                                  setExpandedChoice(null);
                                }}
                                style={styles.button}
                              >
                                <Text style={styles.text}>
                                  {t(
                                    name === 'bodyType'
                                      ? `vehicleRequest.body.${option}`
                                      : `vehicleRequest.transmissionType.${option}`,
                                  )}
                                </Text>
                              </Pressable>
                            ))
                          : null}
                      </>
                    ) : (
                      <TextInput
                        testID={`scan-${name}`}
                        accessibilityLabel={t(`vehicleRequest.${labels[name]}`)}
                        style={styles.input}
                        value={values[name]}
                        placeholderTextColor="#98A2B3"
                        maxLength={120}
                        onChangeText={(text) => {
                          const normalized =
                            name === 'vin'
                              ? text.replace(/\s/g, '').toUpperCase()
                              : name === 'registration'
                                ? text.replace(/[\s.]/g, '')
                                : name === 'weight'
                                  ? text.replace(',', '.')
                                  : text;
                          setValues({ ...values, [name]: normalized });
                          setManualApproved(false);
                        }}
                      />
                    )}
                    {name === 'brand' || name === 'model'
                      ? (name === 'brand' ? brands : models)
                          .filter((option) =>
                            option.name
                              .toLocaleLowerCase()
                              .includes(values[name].toLocaleLowerCase()),
                          )
                          .slice(0, 8)
                          .map((option) => (
                            <Pressable
                              accessibilityRole="radio"
                              accessibilityState={{
                                selected: option.name === values[name],
                              }}
                              key={option.id}
                              style={styles.button}
                              onPress={() => {
                                setValues({ ...values, [name]: option.name });
                                setManualApproved(false);
                              }}
                            >
                              <Text style={styles.text}>{option.name}</Text>
                            </Pressable>
                          ))
                      : null}
                    <Pressable
                      testID={`scan-apply-${name}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: selected[name],
                        disabled: invalidScanField(name, values[name]),
                      }}
                      disabled={invalidScanField(name, values[name])}
                      style={styles.button}
                      onPress={() =>
                        setSelected({ ...selected, [name]: !selected[name] })
                      }
                    >
                      <Text style={styles.text}>
                        {selected[name] ? '☑ ' : '☐ '}
                        {t(
                          value[name]
                            ? 'vehicleRequest.scan.replaceValue'
                            : 'vehicleRequest.scan.applyValue',
                        )}
                      </Text>
                    </Pressable>
                  </View>
                ))}
                {modelsLoading ? <ActivityIndicator color="#111827" /> : null}
                <Pressable
                  testID="scan-manual-approval"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: manualApproved }}
                  onPress={() => setManualApproved(!manualApproved)}
                  style={styles.button}
                >
                  <Text style={styles.text}>
                    {manualApproved ? '☑ ' : '☐ '}
                    {t('vehicleRequest.scan.manualApproval')}
                  </Text>
                </Pressable>
                {
                  <ScanButton
                    title={'vehicleRequest.scan.confirm'}
                    onPress={confirm}
                    disabled={
                      modelsLoading ||
                      !SCAN_FORM_FIELDS.some((name) => selected[name])
                    }
                  />
                }
                {
                  <ScanButton
                    title={'vehicleRequest.scan.rescan'}
                    onPress={() => {
                      invalidate();
                      setResult(null);
                      setValues(null);
                      setSelected(null);
                      setError('');
                    }}
                  />
                }
                {
                  <ScanButton
                    title={'vehicleRequest.scan.manual'}
                    onPress={close}
                  />
                }
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFF', padding: 16 },
  content: { gap: 16, paddingBottom: 24 },
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  heading: { color: '#111827', fontSize: 20, fontWeight: '700', flexShrink: 1 },
  label: { color: '#111827', fontSize: 14, fontWeight: '600' },
  text: { color: '#111827', fontSize: 14, lineHeight: 21 },
  evidence: { color: '#475467', fontSize: 13, lineHeight: 20 },
  error: { color: '#B42318', fontSize: 14, lineHeight: 21 },
  feedbackError: {
    color: '#B42318', backgroundColor: '#FEF3F2', padding: 12,
    borderRadius: 12, marginVertical: 8, fontSize: 14, lineHeight: 21,
  },
  feedbackSuccess: {
    color: '#067647', backgroundColor: '#ECFDF3', padding: 12,
    borderRadius: 12, marginVertical: 8, fontSize: 14, lineHeight: 21,
  },
  feedbackProgress: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12,
  },
  button: {
    backgroundColor: '#FFC548',
    borderRadius: 14,
    padding: 14,
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  preview: { width: '100%', height: 220 },
  input: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    padding: 14,
    color: '#111827',
    borderRadius: 14,
    minHeight: 50,
  },
});
