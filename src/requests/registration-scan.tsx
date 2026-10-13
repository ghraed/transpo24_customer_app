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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import Svg, { Path, Rect } from 'react-native-svg';
import { extractRegistrationCard, getVehicleModels } from '@/lib/api';
import { getAuthSessionSnapshot, subscribeAuthSession } from '@/lib/auth-token';
import type { LocalPhotoAsset } from '@/types/customer-request';
import type { VehicleCatalogBrand } from '@/types/vehicle';
import {
  REGISTRATION_SCAN_TIMEOUT_MS,
  REGISTRATION_IMAGE_MAX_DIMENSION,
  REGISTRATION_IMAGE_QUALITY,
  REGISTRATION_CATALOG_TIMEOUT_MS,
} from './registration-limits';
import {
  applyRegistrationExtraction,
  exactCatalogMatch,
  invalidScanField,
  SCAN_FORM_FIELDS,
  scanValues,
  type FormVehicle,
} from './registration-mapping';

const scanColors = {
  ink: '#111827',
  muted: '#566174',
  surface: '#FFFFFF',
  background: '#F6F7F9',
  border: '#E5E8EF',
  accent: '#FFC548',
  accentSoft: '#FFF7E2',
  accentBorder: '#F1DCA7',
  success: '#067647',
  successSurface: '#ECFDF3',
  error: '#B42318',
  errorSurface: '#FEF3F2',
};

const iconPaths = {
  scan: 'M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3M7 9h10M7 13h10M7 17h6',
  camera: 'M8 6l1.5-3h5L16 6h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4m8 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  gallery: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M3 17l6-6 4 4 3-3 5 5M8 7h.01',
  rotate: 'M3 10a9 9 0 1 1 2 8M3 4v6h6',
  remove: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  close: 'M6 6l12 12M6 18L18 6',
  info: 'M12 11v6m0-10h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  check: 'M5 12l4 4L19 6',
};
type ScanIconName = keyof typeof iconPaths;

function ScanIcon({ name, size = 20, color = scanColors.ink }: {
  name: ScanIconName;
  size?: number;
  color?: string;
}) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
        <Path d={iconPaths[name]} fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function DocumentIllustration() {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.illustration}>
      <Svg width={128} height={92} viewBox="0 0 128 92" accessible={false}>
        <Rect x={20} y={16} width={88} height={60} rx={9} fill={scanColors.surface} stroke={scanColors.accentBorder} strokeWidth={1.5} />
        <Rect x={32} y={30} width={22} height={28} rx={4} fill={scanColors.accentSoft} />
        <Path d="M65 32h29M65 41h22M65 53h29M32 66h62" fill="none" stroke={scanColors.muted} strokeWidth={2} strokeLinecap="round" />
        <Path d="M16 25V12h13m70 0h13v13M16 67v13h13m70 0h13V67" fill="none" stroke={scanColors.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M12 46h104" stroke={scanColors.accent} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function ScanButton({
  title,
  label = title,
  onPress,
  disabled = false,
  variant = 'secondary',
  icon,
}: {
  title: string;
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: ScanIconName;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(title)}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        (variant === 'quiet' || variant === 'danger') && styles.buttonQuiet,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? <ScanIcon name={icon} color={variant === 'danger' ? scanColors.error : scanColors.ink} /> : null}
      <Text style={[styles.buttonText, variant === 'danger' && styles.dangerText]}>{t(label)}</Text>
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
  const [appliedStatus, setAppliedStatus] = useState<
    'extracted' | 'partial' | null
  >(null);
  const current = useRef(value);
  useLayoutEffect(() => {
    current.current = value;
  }, [value]);
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
    busyRef.current = false;
    setBusy(false);
    setProgress(null);
    setError('');
    setPermissionDenied(false);
    setAppliedStatus(null);
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

  const changeImages = (next: LocalPhotoAsset[]) => {
    invalidate();
    setError('');
    setProgress(null);
    busyRef.current = false;
    setBusy(false);
    imageRef.current = next;
    setImages(next);
    setAppliedStatus(null);
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
        if (Math.max(decoded.width, decoded.height) > REGISTRATION_IMAGE_MAX_DIMENSION) {
          context.resize(
            decoded.width >= decoded.height
              ? { width: REGISTRATION_IMAGE_MAX_DIMENSION }
              : { height: REGISTRATION_IMAGE_MAX_DIMENSION },
          );
        }
        const normalized = await context.renderAsync();
        try {
          const saved = await normalized.saveAsync({
            format: SaveFormat.JPEG,
            compress: REGISTRATION_IMAGE_QUALITY,
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
    const beforeScan = { ...current.current };
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
        }, REGISTRATION_SCAN_TIMEOUT_MS);
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
      const next = scanValues(extracted, brands);
      if (
        !SCAN_FORM_FIELDS.some((name) => !invalidScanField(name, next[name]))
      ) {
        setError('vehicleRequest.scan.noDetails');
        return;
      }
      const brand = exactCatalogMatch(
        brands,
        next.brand || current.current.brand,
      );
      let catalogTimer: ReturnType<typeof setTimeout> | undefined;
      const models = await (brand
        ? Promise.race([
            getVehicleModels(brand.id).catch(() => []),
            new Promise<[]>((resolve) => {
              catalogTimer = setTimeout(() => resolve([]), REGISTRATION_CATALOG_TIMEOUT_MS);
            }),
            timeout,
          ])
        : Promise.resolve([])).finally(() => {
          if (catalogTimer !== undefined) clearTimeout(catalogTimer);
        });
      if (id !== epoch.current || abort.signal.aborted) return;
      onApply(
        applyRegistrationExtraction(
          current.current,
          next,
          brands,
          models,
          beforeScan,
        ),
      );
      close();
      setAppliedStatus(extracted.status);
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
  return (
    <View style={[styles.card, { direction: i18n.dir() }]}>
      <View style={styles.cardHeader}>
        <View style={styles.iconTile}><ScanIcon name="scan" size={26} /></View>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.cardTitle}>{t('vehicleRequest.scan.title')}</Text>
          <Text style={styles.text}>{t('vehicleRequest.scan.intro')}</Text>
        </View>
      </View>
      <ScanButton
        title="vehicleRequest.scan.title"
        label="vehicleRequest.scan.start"
        variant="primary"
        icon="camera"
        onPress={() => {
          setOpen(true);
          setError('');
        }}
      />
      {appliedStatus ? (
        <View style={styles.successRow}>
          <ScanIcon name="check" color={scanColors.success} />
          <Text accessibilityLiveRegion="polite" style={styles.feedbackSuccess}>
            {t(appliedStatus === 'partial' ? 'vehicleRequest.scan.partialSuccess' : 'vehicleRequest.scan.success')}
          </Text>
        </View>
      ) : null}
      <Modal visible={open} animationType="slide" onRequestClose={close}>
        <SafeAreaView style={[styles.screen, { direction: i18n.dir() }]}>
          <View style={styles.modalHeader}>
            <View style={styles.headerCopy}>
              <Text accessibilityRole="header" style={styles.heading}>{t('vehicleRequest.scan.title')}</Text>
              <Text style={styles.text}>{t('vehicleRequest.scan.intro')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('vehicleRequest.close')}
              onPress={close}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <ScanIcon name="close" />
            </Pressable>
          </View>
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.feedbackError}>{t(error)}</Text>
          ) : null}
          {busy ? (
            <View accessibilityLiveRegion="polite" style={styles.feedbackProgress}>
              <ActivityIndicator color={scanColors.ink} />
              <Text style={[styles.text, styles.flexText]}>
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
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {permissionDenied ? (
              <ScanButton title="vehicleRequest.scan.settings" onPress={() => { void Linking.openSettings(); }} />
            ) : null}
            {!images.length ? (
              <View style={styles.captureCard}>
                <DocumentIllustration />
                <Text accessibilityRole="header" style={styles.captureTitle}>{t('vehicleRequest.scan.addPhoto')}</Text>
                <Text style={styles.captureInstructions}>{t('vehicleRequest.scan.instructions')}</Text>
              </View>
            ) : (
              <View style={styles.tipRow}>
                <ScanIcon name="info" color={scanColors.muted} />
                <Text style={[styles.text, styles.flexText]}>{t('vehicleRequest.scan.instructions')}</Text>
              </View>
            )}
            {images.map((photo, index) => (
              <View key={photo.uri} style={styles.photoCard}>
                <View style={styles.photoHeader}>
                  <View style={styles.photoNumber}><Text style={styles.photoNumberText}>{index + 1}</Text></View>
                  <Text style={styles.label}>
                    {t(index === 0 ? 'vehicleRequest.scan.front' : 'vehicleRequest.scan.back')}
                  </Text>
                </View>
                <Image
                  accessible
                  accessibilityLabel={t('vehicleRequest.scan.preview')}
                  source={{ uri: photo.uri }}
                  style={styles.preview}
                  resizeMode="contain"
                />
                <View style={styles.photoControls}>
                  <View style={styles.row}>
                    <ScanButton title="vehicleRequest.scan.retake" icon="camera" onPress={() => { void choose(true, index); }} disabled={busy} />
                    <ScanButton title="vehicleRequest.scan.replace" icon="gallery" onPress={() => { void choose(false, index); }} disabled={busy} />
                  </View>
                  <View style={styles.row}>
                    <ScanButton title="vehicleRequest.scan.rotate" variant="quiet" icon="rotate" onPress={() => { void rotate(index); }} disabled={busy} />
                    <ScanButton
                      title="vehicleRequest.scan.remove"
                      variant="danger"
                      icon="remove"
                      onPress={() => {
                        cleanupFile(photo.uri);
                        changeImages(imageRef.current.filter((_, i) => i !== index));
                      }}
                      disabled={busy}
                    />
                  </View>
                </View>
              </View>
            ))}
            {images.length < 2 ? (
              <View style={styles.sourceActions}>
                {images.length ? <Text style={styles.label}>{t('vehicleRequest.scan.back')}</Text> : null}
                <View style={styles.row}>
                  <ScanButton title="vehicleRequest.scan.camera" variant={images.length ? 'secondary' : 'primary'} icon="camera" onPress={() => { void choose(true); }} disabled={busy} />
                  <ScanButton title="vehicleRequest.scan.gallery" icon="gallery" onPress={() => { void choose(false); }} disabled={busy} />
                </View>
              </View>
            ) : null}
            <View style={styles.disclosure}>
              <ScanIcon name="info" color={scanColors.muted} size={18} />
              <Text style={[styles.disclosureText, styles.flexText]}>{t('vehicleRequest.scan.disclosure')}</Text>
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <ScanButton
              title="vehicleRequest.scan.extract"
              label={error ? 'vehicleRequest.scan.retry' : 'vehicleRequest.scan.extract'}
              variant="primary"
              icon="scan"
              onPress={() => { void scan(); }}
              disabled={busy || !images.length}
            />
            <ScanButton title="vehicleRequest.scan.manual" variant="quiet" onPress={close} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: scanColors.background },
  scroll: { flex: 1 },
  content: { gap: 20, padding: 20, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: {
    backgroundColor: scanColors.surface,
    padding: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: scanColors.accentBorder,
    gap: 20,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  headerCopy: { flex: 1, gap: 6 },
  iconTile: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: scanColors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { color: scanColors.ink, fontSize: 18, lineHeight: 25, fontWeight: '700', textAlign: 'auto' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 16,
    padding: 20, borderBottomWidth: 1, borderColor: scanColors.border,
    backgroundColor: scanColors.surface,
  },
  closeButton: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: scanColors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: 10 },
  heading: { color: scanColors.ink, fontSize: 22, lineHeight: 29, fontWeight: '700', textAlign: 'auto' },
  label: { color: scanColors.ink, fontSize: 14, lineHeight: 21, fontWeight: '600', flexShrink: 1, textAlign: 'auto' },
  text: { color: scanColors.muted, fontSize: 14, lineHeight: 21, textAlign: 'auto' },
  flexText: { flex: 1 },
  captureCard: {
    backgroundColor: scanColors.surface,
    borderWidth: 1, borderColor: scanColors.border, borderRadius: 22,
    padding: 24, gap: 12, alignItems: 'center',
  },
  illustration: { backgroundColor: scanColors.accentSoft, borderRadius: 24, padding: 12, marginBottom: 4 },
  captureTitle: { color: scanColors.ink, fontSize: 18, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  captureInstructions: { color: scanColors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  photoCard: { backgroundColor: scanColors.surface, borderRadius: 20, borderWidth: 1, borderColor: scanColors.border, overflow: 'hidden' },
  photoHeader: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 16 },
  photoNumber: { width: 28, height: 28, borderRadius: 9, backgroundColor: scanColors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  photoNumberText: { color: scanColors.ink, fontSize: 13, fontWeight: '700' },
  photoControls: { gap: 4, padding: 12 },
  sourceActions: { gap: 12 },
  disclosure: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 16, borderRadius: 16, backgroundColor: scanColors.border },
  disclosureText: { color: scanColors.muted, fontSize: 13, lineHeight: 20, textAlign: 'auto' },
  footer: { gap: 4, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, backgroundColor: scanColors.surface, borderTopWidth: 1, borderColor: scanColors.border },
  feedbackError: {
    color: scanColors.error, backgroundColor: scanColors.errorSurface,
    padding: 12, borderRadius: 12, marginHorizontal: 20, marginTop: 12,
    fontSize: 14, lineHeight: 21, textAlign: 'auto',
  },
  successRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: scanColors.successSurface, padding: 12, borderRadius: 12 },
  feedbackSuccess: { flex: 1, color: scanColors.success, fontSize: 14, lineHeight: 21, textAlign: 'auto' },
  feedbackProgress: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, marginHorizontal: 20, marginTop: 12, borderRadius: 14, backgroundColor: scanColors.accentSoft },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: scanColors.surface, borderWidth: 1, borderColor: scanColors.border,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 48,
    flexGrow: 1, flexShrink: 1, flexBasis: 'auto', maxWidth: '100%',
  },
  buttonPrimary: { backgroundColor: scanColors.accent, borderColor: scanColors.accent },
  buttonQuiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  buttonText: { color: scanColors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  dangerText: { color: scanColors.error },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
  preview: { width: '100%', height: 220, backgroundColor: scanColors.background },
});
