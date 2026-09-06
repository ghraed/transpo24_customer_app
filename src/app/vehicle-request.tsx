import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useAuthSession } from '@/lib/auth-token';
import { submitVehicleDraft } from '@/requests/submit-vehicle-draft';
import { getDrivingDistance } from '@/lib/places';
import { AddressEditor } from '@/requests/address-editor';
import { ScheduleEditor, scheduleLabel } from '@/requests/schedule-editor';
import { VehicleEditor } from '@/requests/vehicle-editor';
import {
  clearVehicleDraft,
  readVehicleDraft,
  retainDraftPhoto,
  writeVehicleDraft,
} from '@/requests/vehicle-draft-storage';
import {
  newVehicleDraft,
  patchVehicleDraft,
  validateVehicleDraft,
  VEHICLE_ISSUES,
  type DraftError,
  type VehicleStep,
} from '@/requests/vehicle-draft';

const STEPS: VehicleStep[] = [
  'vehicle',
  'condition',
  'pickup',
  'dropoff',
  'schedule',
  'photos',
  'review',
];
const STAGE: Record<VehicleStep, number> = {
  vehicle: 1,
  condition: 1,
  pickup: 2,
  dropoff: 3,
  schedule: 4,
  photos: 4,
  review: 5,
};

export default function VehicleRequestRoute() {
  const { serviceId } = useLocalSearchParams<{ serviceId?: string }>();
  const auth = useAuthSession();
  const { t } = useTranslation();
  if (!auth.user?.id || !serviceId)
    return (
      <SafeAreaView>
        <Text style={styles.body}>{t('vehicleRequest.startFromServices')}</Text>
      </SafeAreaView>
    );
  return (
    <VehicleRequest
      key={`${auth.user.id}-${serviceId}`}
      ownerId={auth.user.id}
      serviceId={serviceId}
      countryCode={auth.user.countryCode}
    />
  );
}

function VehicleRequest({
  ownerId,
  serviceId,
  countryCode,
}: {
  ownerId: string;
  serviceId: string;
  countryCode: string | null;
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(() => {
    try {
      return readVehicleDraft(ownerId, serviceId);
    } catch {
      return newVehicleDraft(ownerId, serviceId);
    }
  });
  const draftRef = useRef(draft);
  const scroll = useRef<ScrollView>(null);
  const [step, setStep] = useState<VehicleStep>('vehicle');
  const isAddressStep = step === 'pickup' || step === 'dropoff';
  const [editing, setEditing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState(false);
  const [distanceError, setDistanceError] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const patch = (change: Parameters<typeof patchVehicleDraft>[1]) => {
    if ('pickup' in change || 'dropoff' in change) setDistanceError(false);
    const next = patchVehicleDraft(draftRef.current, change);
    draftRef.current = next;
    setDraft(next);
    try {
      writeVehicleDraft(next);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    return next;
  };
  useEffect(() => {
    const interval = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);
  const errors = validateVehicleDraft(draft, clock);
  const stepErrors = errors.filter((issue) => issue.step === step);
  const go = (next: VehicleStep, edit = false) => {
    setStep(next);
    setEditing(edit);
    setError('');
    setShowErrors(false);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const back = () => {
    if (busyRef.current) return;
    if (editing) go('review');
    else if (step === 'vehicle') router.back();
    else go(STEPS[STEPS.indexOf(step) - 1]);
  };
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busyRef.current) return true;
      if (step === 'vehicle' && !editing) return false;
      if (editing) go('review');
      else go(STEPS[STEPS.indexOf(step) - 1]);
      return true;
    });
    return () => listener.remove();
  }, [step, editing]);
  useEffect(() => {
    if (!draft.pickup || !draft.dropoff) return;
    const controller = new AbortController();
    void getDrivingDistance(draft.pickup, draft.dropoff, controller.signal)
      .then((distanceKm) => {
        if (!controller.signal.aborted) {
          setDistanceError(false);
          patch({ distanceKm });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setDistanceError(true);
      });
    return () => controller.abort();
    // Only coordinates trigger a route calculation; other edits leave it alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.pickup?.latitude,
    draft.pickup?.longitude,
    draft.dropoff?.latitude,
    draft.dropoff?.longitude,
  ]);

  const openError = (issue: DraftError) => {
    go(issue.step, true);
    setShowErrors(true);
  };
  const next = () => {
    const actualErrors = validateVehicleDraft(draftRef.current).filter(
      (issue) => issue.step === step,
    );
    if (actualErrors.length) {
      setShowErrors(true);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    go(editing ? 'review' : STEPS[STEPS.indexOf(step) + 1]);
  };
  const addPhotos = async (camera: boolean) => {
    if (busyRef.current || draftRef.current.photos.length >= 8) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('vehicleRequest.photoPermission');
        return;
      }
      const remaining = 8 - draftRef.current.photos.length;
      const result = camera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            selectionLimit: remaining,
            quality: 0.8,
          });
      if (result.canceled) return;
      const photos = result.assets
        .slice(0, remaining)
        .map((asset, index) =>
          retainDraftPhoto(ownerId, {
            localId: `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
            uri: asset.uri,
            fileName: asset.fileName ?? undefined,
            mimeType: asset.mimeType ?? 'image/jpeg',
          }),
        );
      patch({ photos: [...draftRef.current.photos, ...photos] });
    } catch {
      setError('vehicleRequest.photoFailed');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const submit = async () => {
    if (busyRef.current) return;
    const currentErrors = validateVehicleDraft(draftRef.current);
    if (currentErrors.length) {
      setClock(Date.now());
      setShowErrors(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const submittedId = await submitVehicleDraft(draftRef.current, patch);
      try {
        clearVehicleDraft(ownerId);
      } catch {
        /* Submission succeeded; navigation must still complete. */
      }
      router.replace({
        pathname: '/request-status',
        params: { requestId: submittedId },
      });
    } catch {
      setError('vehicleRequest.submitFailed');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const edit = (target: VehicleStep) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('vehicleRequest.edit')} ${t(`vehicleRequest.step.${target}`)}`}
      onPress={() => go(target, true)}
    >
      <Text style={styles.link}>{t('vehicleRequest.edit')}</Text>
    </Pressable>
  );
  const photoGrid = (editable: boolean) => (
    <View style={styles.photos}>
      {draft.photos.map((photo) => (
        <View key={photo.localId} style={styles.photoItem}>
          <Image source={{ uri: photo.uri }} style={styles.photo} />
          {editable ? (
            <Pressable
              accessibilityLabel={t('vehicleRequest.removePhoto')}
              onPress={() =>
                patch({
                  photos: draft.photos.filter(
                    (value) => value.localId !== photo.localId,
                  ),
                  removedPhotoIds: photo.uploadedId
                    ? [...draft.removedPhotoIds, photo.uploadedId]
                    : draft.removedPhotoIds,
                })
              }
            >
              <Text style={styles.link}>{t('vehicleRequest.removePhoto')}</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
  const card = (target: VehicleStep, children: React.ReactNode) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {t(`vehicleRequest.step.${target}`)}
        </Text>
        {edit(target)}
      </View>
      {children}
    </View>
  );
  const issueList = (
    <>
      {draft.condition.issues.map((issue) => (
        <Text key={issue} style={styles.body}>{t(`vehicleRequest.issue.${issue}`)}</Text>
      ))}
    </>
  );

  return (
    <SafeAreaView
      style={[styles.screen, { direction: i18n.dir() }]}
      edges={['top', 'left', 'right']}
    >
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !busy }} />
      <View style={styles.header}>
        <Pressable disabled={busy} onPress={back}>
          <Text style={styles.link}>{t('vehicleRequest.back')}</Text>
        </Pressable>
        <Text style={styles.service}>{t('vehicleRequest.title')}</Text>
      </View>
      <View
        accessibilityLabel={t('vehicleRequest.progress', {
          current: STAGE[step],
          total: 5,
        })}
        style={styles.progress}
      >
        {[1, 2, 3, 4, 5].map((number) => (
          <View
            key={number}
            style={[styles.stage, number <= STAGE[step] && styles.activeStage]}
          >
            <Text
              style={[styles.body, number <= STAGE[step] && styles.activeStageText]}
            >
              {number}
            </Text>
          </View>
        ))}
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          ref={scroll}
          keyboardShouldPersistTaps="handled"
          style={styles.flex}
          contentContainerStyle={[styles.content, isAddressStep && styles.mapContent]}
        >
          <Text style={styles.title}>{t(`vehicleRequest.step.${step}`)}</Text>
          {storageError ? (
            <Text style={styles.error}>
              {t('vehicleRequest.storageFailed')}
            </Text>
          ) : null}
          {(showErrors || step === 'review') &&
          (step === 'review' ? errors : stepErrors).length ? (
            <View style={styles.errorCard}>
              {(step === 'review' ? errors : stepErrors).map((issue) => (
                <Pressable
                  key={issue.field}
                  accessibilityRole="button"
                  onPress={() => openError(issue)}
                >
                  <Text style={styles.error}>{t(issue.key)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View
            pointerEvents={busy ? 'none' : 'auto'}
            style={isAddressStep ? styles.flex : undefined}
          >
            {step === 'vehicle' ? (
              <VehicleEditor
                value={draft.vehicle}
                onChange={(vehicle) => patch({ vehicle })}
                errors={
                  showErrors ? stepErrors.map((issue) => issue.field) : []
                }
              />
            ) : null}
            {step === 'condition' ? (
              <View style={styles.card}>
                {(['RUNNING', 'ROLLABLE', 'NOT_ROLLABLE'] as const).map(
                  (mobility) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: draft.condition.mobility === mobility,
                      }}
                      key={mobility}
                      style={[
                        styles.option,
                        draft.condition.mobility === mobility &&
                          styles.selected,
                        showErrors &&
                          !draft.condition.mobility &&
                          styles.invalid,
                      ]}
                      onPress={() =>
                        patch({ condition: { ...draft.condition, mobility } })
                      }
                    >
                      <Text style={styles.body}>{t(`vehicleRequest.mobility.${mobility}`)}</Text>
                    </Pressable>
                  ),
                )}
                <Text style={styles.cardTitle}>
                  {t('vehicleRequest.additionalIssues')}
                </Text>
                {VEHICLE_ISSUES.map((issue) => (
                  <Pressable
                    key={issue}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: draft.condition.issues.includes(issue),
                    }}
                    style={[
                      styles.option,
                      draft.condition.issues.includes(issue) && styles.selected,
                    ]}
                    onPress={() =>
                      patch({
                        condition: {
                          ...draft.condition,
                          issues: draft.condition.issues.includes(issue)
                            ? draft.condition.issues.filter(
                                (value) => value !== issue,
                              )
                            : [...draft.condition.issues, issue],
                        },
                      })
                    }
                  >
                    <Text style={styles.body}>
                      {draft.condition.issues.includes(issue) ? '✓ ' : '○ '}
                      {t(`vehicleRequest.issue.${issue}`)}
                    </Text>
                  </Pressable>
                ))}
                <Text style={styles.cardTitle}>
                  {t('vehicleRequest.notes')}
                </Text>
                <TextInput
                  multiline
                  maxLength={500}
                  accessibilityLabel={t('vehicleRequest.notes')}
                  value={draft.condition.notes}
                  onChangeText={(notes) =>
                    patch({ condition: { ...draft.condition, notes } })
                  }
                  style={styles.notes}
                />
              </View>
            ) : null}
            {step === 'pickup' || step === 'dropoff' ? (
              <AddressEditor
                key={step}
                fillHeight
                label={t(`vehicleRequest.step.${step}`)}
                countryCode={countryCode}
                value={draft[step]}
                onChange={(address) => patch({ [step]: address })}
                invalid={showErrors && stepErrors.length > 0}
              />
            ) : null}
            {step === 'schedule' ? (
              <ScheduleEditor
                value={draft.schedule}
                onChange={(schedule) => patch({ schedule })}
                invalid={showErrors && stepErrors.length > 0}
              />
            ) : null}
            {step === 'photos' ? (
              <View style={styles.card}>
                <Text style={styles.body}>
                  {t(
                    draft.condition.issues.length ||
                      draft.condition.mobility !== 'RUNNING'
                      ? 'vehicleRequest.specialPhotos'
                      : 'vehicleRequest.optionalPhotos',
                  )}
                </Text>
                <Text style={[styles.body, { writingDirection: 'ltr' }]}>
                  {t('vehicleRequest.photoCount', {
                    count: draft.photos.length,
                    max: 8,
                  })}
                </Text>
                {photoGrid(true)}
                <View style={styles.cardHeader}>
                  <Pressable
                    disabled={draft.photos.length >= 8}
                    onPress={() => void addPhotos(true)}
                  >
                    <Text style={styles.link}>
                      {t('vehicleRequest.camera')}
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={draft.photos.length >= 8}
                    onPress={() => void addPhotos(false)}
                  >
                    <Text style={styles.link}>
                      {t('vehicleRequest.gallery')}
                    </Text>
                  </Pressable>
                </View>
                {!draft.photos.length ? (
                  <Pressable onPress={next}>
                    <Text style={styles.link}>
                      {t('vehicleRequest.withoutPhotos')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {step === 'review' ? (
              <View style={styles.section}>
                {card(
                  'vehicle',
                  <>
                    <Text style={styles.vehicleTitle}>
                      {draft.vehicle.brand} {draft.vehicle.model},{' '}
                      {draft.vehicle.year} –{' '}
                      {Number(draft.vehicle.weight).toLocaleString('de-CH')} kg
                    </Text>
                    <Text style={styles.body}>
                      {t(`vehicleRequest.body.${draft.vehicle.bodyType}`, {
                        defaultValue: draft.vehicle.bodyType,
                      })}{' '}
                      ·{' '}
                      {t(
                        `vehicleRequest.transmissionType.${draft.vehicle.transmission}`,
                        { defaultValue: draft.vehicle.transmission },
                      )}
                    </Text>
                    <View style={styles.cardHeader}>
                      <Text style={styles.body}>
                        {t(
                          `vehicleRequest.mobility.${draft.condition.mobility}`,
                          { defaultValue: t('vehicleRequest.errorCondition') },
                        )}
                      </Text>
                      {edit('condition')}
                    </View>
                    {issueList}
                    {draft.condition.notes ? (
                      <Text style={styles.body}>{draft.condition.notes}</Text>
                    ) : null}
                  </>,
                )}
                {card('pickup', <Text style={styles.body}>{draft.pickup?.address}</Text>)}
                {card('dropoff', <Text style={styles.body}>{draft.dropoff?.address}</Text>)}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {t('vehicleRequest.distance')}
                  </Text>
                  <Text style={styles.body}>
                    {draft.distanceKm !== undefined
                      ? t('vehicleRequest.kilometers', {
                          distance: draft.distanceKm.toLocaleString(
                            i18n.language,
                            { maximumFractionDigits: 1 },
                          ),
                        })
                      : t(
                          distanceError
                            ? 'vehicleRequest.distanceUnavailable'
                            : 'vehicleRequest.calculatingDistance',
                        )}
                  </Text>
                </View>
                {card(
                  'schedule',
                  <Text style={styles.body}>
                    {draft.schedule.immediate
                      ? t('vehicleRequest.immediate')
                      : scheduleLabel(draft.schedule, i18n.language)}
                  </Text>,
                )}
                {card(
                  'photos',
                  <>
                    {draft.photos.length ? (
                      photoGrid(false)
                    ) : (
                      <Text style={styles.body}>{t('vehicleRequest.noPhotos')}</Text>
                    )}
                  </>,
                )}
              </View>
            ) : null}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t(error)}
            </Text>
          ) : null}
        </ScrollView>
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            disabled={busy || (step === 'review' && errors.length > 0)}
            style={[
              styles.primary,
              (busy || (step === 'review' && errors.length > 0)) &&
                styles.disabled,
            ]}
            onPress={() => (step === 'review' ? void submit() : next())}
          >
            {busy ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.primaryText}>
                {t(
                  step === 'review'
                    ? 'vehicleRequest.submit'
                    : step === 'pickup'
                      ? 'vehicleRequest.confirmPickup'
                      : step === 'dropoff'
                        ? 'vehicleRequest.confirmDropoff'
                        : editing
                          ? 'vehicleRequest.save'
                          : 'vehicleRequest.continue',
                )}
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  body: { color: '#111827', fontSize: 14, lineHeight: 20 },
  screen: { flex: 1, backgroundColor: '#FAFAFA' },
  flex: { flex: 1 },
  mapContent: { flexGrow: 1, paddingBottom: 16 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  service: { fontSize: 18, fontWeight: '800', color: '#111827', flexShrink: 1 },
  progress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  stage: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E8EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStage: { backgroundColor: '#FFC548' },
  activeStageText: { color: '#111827', fontWeight: '700' },
  content: { padding: 20, gap: 18, paddingBottom: 32 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '800', color: '#111827' },
  section: { gap: 14 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 16,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#111827', flexShrink: 1 },
  vehicleTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  link: { color: '#111827', fontWeight: '600', paddingVertical: 10 },
  option: {
    padding: 16,
    borderWidth: 1,
    borderColor: '#D9DFE8',
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  selected: { borderColor: '#FFC548', backgroundColor: '#FFC548' },
  invalid: { borderColor: '#C0392B', borderWidth: 2 },
  notes: {
    borderWidth: 1,
    borderColor: '#D9DFE8',
    backgroundColor: '#FFF',
    padding: 16,
    minHeight: 100,
    borderRadius: 12,
    textAlignVertical: 'top',
    color: '#111827',
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoItem: { width: 120 },
  photo: { width: 120, height: 90, borderRadius: 10 },
  errorCard: {
    padding: 16,
    backgroundColor: '#FEF3F2',
    borderRadius: 12,
    gap: 10,
  },
  error: { color: '#C0392B', lineHeight: 23 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderColor: '#E5E8EF',
  },
  primary: {
    minHeight: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
  },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
