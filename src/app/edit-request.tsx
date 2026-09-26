import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { getCustomerRequestStatus, getRequestForEdit, getServices, submitRequestEdit } from "@/lib/api";
import { getApiBaseUrl } from "@/config/backend";
import { getAccessToken, useAuthSession } from "@/lib/auth-token";
import { connectSocket, onOfferNew } from "@/services/socketService";
import { AddressEditor } from "@/requests/address-editor";
import { ScheduleEditor } from "@/requests/schedule-editor";
import {
  getServiceEditFields,
  prepareRequestForEdit,
  editRequestPayload,
  type EditableRequest,
  type EditField,
} from "@/requests/edit-request";
import { VEHICLE_ISSUES } from "@/requests/vehicle-draft";
import type { Service } from "@/types/service";
import type { LocalPhotoAsset } from "@/types/customer-request";

export default function EditRequestScreen() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { user } = useAuthSession();
  const [draft, setDraft] = useState<EditableRequest>();
  const [services, setServices] = useState<Service[]>([]);
  const [photos, setPhotos] = useState<LocalPhotoAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultPickupAt] = useState(() =>
    new Date(Date.now() + 3600000).toISOString(),
  );
  const [busy, setBusy] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const lockEditing = useCallback(() => {
    lockedRef.current = true;
    setLocked(true);
    setConfirmVisible(false);
    setError(t("editRequest.locked"));
  }, [t]);
  const saving = useRef(false);
  const service = services.find((value) => value.id === draft?.serviceId);
  useEffect(() => {
    let active = true;
    let checking = false;
    const checkEditable = async () => {
      if (checking || lockedRef.current) return;
      checking = true;
      try {
        const status = await getCustomerRequestStatus(requestId);
        if (active && status.canEdit === false) lockEditing();
      } catch {
        // A connection failure does not establish that the request is locked.
      } finally {
        checking = false;
      }
    };
    let unsubscribe: (() => void) | undefined;
    try {
      const token = getAccessToken();
      if (token) {
        connectSocket(token);
        unsubscribe = onOfferNew(payload => {
          if (payload.requestId === requestId) lockEditing();
        });
      }
    } catch {
      // Periodic checks also cover unavailable realtime connections.
    }
    void checkEditable();
    const timer = setInterval(() => void checkEditable(), 10000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void checkEditable();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
      unsubscribe?.();
    };
  }, [requestId, lockEditing]);
  useEffect(() => {
    let active = true;
    Promise.all([getRequestForEdit(requestId), getServices()])
      .then(([request, available]) => {
        if (active) {
          const requestService = available.find(
            (value) => value.id === request.serviceId,
          );
          setDraft(prepareRequestForEdit(request, requestService?.key));
          setServices(available);
        }
      })
      .catch((reason) => {
        if (active && reason?.code === 'REQUEST_EDIT_LOCKED') {
          lockEditing();
          return;
        }
        if (active)
          setError(
            reason instanceof Error ? reason.message : t("editRequest.failed"),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestId, t, lockEditing]);
  const patch = (values: Partial<EditableRequest>) =>
    setDraft((current) => (current ? { ...current, ...values } : current));
  const label = (value: string) =>
    /^(XS|S|M|L|XL|XXL)$/.test(value)
      ? value
      : t(
          (
            {
              RUNNING: "Running vehicle",
              NEEDS_JUMP_START: "Needs jump-start",
              NEEDS_WINCH: "Needs winch",
              NEEDS_CRANE: "Needs crane",
              MISSING_WHEELS: "Missing wheels",
            } as Record<string, string>
          )[value] ??
            value
              .replace(/_/g, " ")
              .toLowerCase()
              .replace(/^./, (c) => c.toUpperCase()),
        );
  const field = (entry: EditField) => {
    const value = draft?.[entry.key];
    return (
      <View key={entry.key} style={styles.field}>
        <Text style={styles.label}>{t(entry.label)}</Text>
        {entry.kind === "boolean" ? (
          <Switch
            accessibilityLabel={t(entry.label)}
            value={Boolean(value)}
            onValueChange={(next) => patch({ [entry.key]: next })}
          />
        ) : entry.kind === "choice" ? (
          <View style={styles.choices}>
            {entry.options?.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === option }}
                style={[styles.choice, value === option && styles.selected]}
                onPress={() =>
                  patch({ [entry.key]: value === option ? null : option })
                }
              >
                <Text>
                  {entry.key === "vehicleMobility"
                    ? t(`vehicleRequest.mobility.${option}`)
                    : label(option)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <TextInput
            accessibilityLabel={t(entry.label)}
            style={styles.input}
            value={value == null ? "" : String(value)}
            onChangeText={(next) => patch({ [entry.key]: next })}
            keyboardType={entry.kind === "number" ? "decimal-pad" : "default"}
            multiline={entry.kind === "text"}
          />
        )}
      </View>
    );
  };
  const addPhotos = async () => {
    if (!draft || saving.current || lockedRef.current) return;
    const remaining = 8 - draft.retainedPhotoIds.length - photos.length;
    if (remaining <= 0) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
      });
      if (!result.canceled) {
        const selected = result.assets.slice(0, remaining);
        if (
          selected.some(
            (asset) =>
              (asset.fileSize ?? 0) > 5 * 1024 * 1024 ||
              !["image/jpeg", "image/png", "image/webp"].includes(
                asset.mimeType ?? "image/jpeg",
              ),
          )
        )
          throw new Error(t("editRequest.photoError"));
        setPhotos((current) => [
          ...current,
          ...selected.map((asset) => ({
            uri: asset.uri,
            fileName: asset.fileName ?? undefined,
            mimeType: asset.mimeType ?? "image/jpeg",
          })),
        ]);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("editRequest.failed"),
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const submit = async () => {
    if (!draft || saving.current || lockedRef.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      if (!draft.pickupLocation || !draft.dropoffLocation)
        throw new Error(t("editRequest.locationsRequired"));
      if (
        !draft.isImmediate &&
        (!draft.scheduledPickupAt ||
          Date.parse(draft.scheduledPickupAt) <= Date.now())
      )
        throw new Error(t("vehicleRequest.errorSchedule"));
      await submitRequestEdit(requestId, editRequestPayload(draft), photos);
      router.replace({
        pathname: "/request-status",
        params: { requestId, refreshTs: String(Date.now()) },
      });
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'REQUEST_EDIT_LOCKED') {
        lockEditing();
        return;
      }
      setError(
        reason instanceof Error ? t(reason.message) : t("editRequest.failed"),
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={[styles.screen, { direction: i18n.dir() }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.card} accessibilityViewIsModal>
            <Text style={styles.title}>{t("editRequest.confirmTitle")}</Text>
            <Text>{t("editRequest.confirmMessage")}</Text>
            <View style={styles.choices}>
              <Pressable
                accessibilityRole="button"
                style={styles.choice}
                onPress={() => setConfirmVisible(false)}
              >
                <Text>{t("Cancel")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.submit}
                onPress={() => {
                  setConfirmVisible(false);
                  void submit();
                }}
              >
                <Text style={styles.label}>{t("Confirm")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <Stack.Screen
        options={{
          title: t("editRequest.title"),
          headerShown: false,
          gestureEnabled: !busy,
        }}
      />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Back")}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, (pressed || busy) && styles.backButtonDimmed]}
        >
          <SymbolView
            name={i18n.dir() === "rtl"
              ? { ios: "chevron.right", android: "arrow_forward", web: "arrow_forward" }
              : { ios: "chevron.left", android: "arrow_back", web: "arrow_back" }}
            tintColor="#111827"
            size={24}
            resizeMode="scaleAspectFit"
          />
        </Pressable>
        <Text accessibilityRole="header" style={styles.headerTitle}>{t("editRequest.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {draft && !locked ? (
              <View
                // Keep the native parent stable when pointerEvents changes during saving.
                collapsable={false}
                pointerEvents={busy ? "none" : "auto"}
                style={styles.content}
              >
                <Text>{t("editRequest.hint")}</Text>
                <View style={styles.card}>
                  <Text style={styles.title}>{t("Service")}</Text>
                  <Text>
                    {service
                      ? t(service.nameEn, {
                          defaultValue:
                            i18n.language === "ar"
                              ? service.nameAr
                              : service.nameEn,
                        })
                      : ""}
                  </Text>
                  <Text>{t("editRequest.serviceLocked")}</Text>
                </View>
                <AddressEditor
                  value={draft.pickupLocation}
                  onChange={(value) => patch({ pickupLocation: value })}
                  countryCode={user?.countryCode}
                  label={t("Pickup")}
                  invalid={!draft.pickupLocation}
                />
                <AddressEditor
                  value={draft.dropoffLocation}
                  onChange={(value) => patch({ dropoffLocation: value })}
                  countryCode={user?.countryCode}
                  label={t("Dropoff")}
                  invalid={!draft.dropoffLocation}
                  locationKind="dropoff"
                  pickupLocation={draft.pickupLocation}
                />
                <ScheduleEditor
                  value={{
                    immediate: draft.isImmediate,
                    at: draft.scheduledPickupAt ?? defaultPickupAt,
                  }}
                  onChange={(value) =>
                    patch({
                      isImmediate: value.immediate,
                      scheduledPickupAt: value.at,
                    })
                  }
                  invalid={false}
                />
                <View style={styles.card}>
                  <Text style={styles.title}>{t("Service details")}</Text>
                  {getServiceEditFields(service?.key ?? "", draft).map(field)}
                  {service?.key === "VEHICLE_TRANSPORT" ? (
                    <View style={styles.field}>
                      <Text style={styles.label}>{t("Vehicle issues")}</Text>
                      <View style={styles.choices}>
                        {VEHICLE_ISSUES.map((issue) => {
                          const issues = Array.isArray(draft.vehicleIssues)
                            ? (draft.vehicleIssues as string[])
                            : [];
                          return (
                            <Pressable
                              key={issue}
                              accessibilityRole="checkbox"
                              accessibilityState={{
                                checked: issues.includes(issue),
                              }}
                              style={[
                                styles.choice,
                                issues.includes(issue) && styles.selected,
                              ]}
                              onPress={() =>
                                patch({
                                  vehicleIssues: issues.includes(issue)
                                    ? issues.filter((value) => value !== issue)
                                    : [...issues, issue],
                                })
                              }
                            >
                              <Text>{t(`vehicleRequest.issue.${issue}`)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
                <View style={styles.card}>
                  <Text style={styles.title}>{t("Photos")}</Text>
                  <View style={styles.choices}>
                    {draft.photos
                      .filter((photo) =>
                        draft.retainedPhotoIds.includes(photo.id),
                      )
                      .map((photo) => (
                        <View key={photo.id}>
                          <Image
                            style={styles.photo}
                            source={{
                              uri: photo.url.startsWith("/")
                                ? `${getApiBaseUrl().replace(/\/api\/?$/, "")}${photo.url}`
                                : photo.url,
                            }}
                          />
                          <Pressable
                            accessibilityRole="button"
                            style={styles.choice}
                            onPress={() =>
                              patch({
                                retainedPhotoIds: draft.retainedPhotoIds.filter(
                                  (id) => id !== photo.id,
                                ),
                              })
                            }
                          >
                            <Text>{t("Remove")}</Text>
                          </Pressable>
                        </View>
                      ))}
                    {photos.map((photo, index) => (
                      <View key={`${photo.uri}-${index}`}>
                        <Image
                          style={styles.photo}
                          source={{ uri: photo.uri }}
                        />
                        <Pressable
                          accessibilityRole="button"
                          style={styles.choice}
                          onPress={() =>
                            setPhotos((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Text>{t("Remove")}</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.choice}
                    disabled={
                      draft.retainedPhotoIds.length + photos.length >= 8
                    }
                    onPress={() => void addPhotos()}
                  >
                    <Text>{t("Add photos")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {error || locked ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {locked ? t('editRequest.locked') : error}
              </Text>
            ) : null}
            {draft && !locked ? (
              <Pressable
                accessibilityRole="button"
                style={styles.submit}
                disabled={busy}
                onPress={() => setConfirmVisible(true)}
              >
                {busy ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={styles.label}>{t("editRequest.submit")}</Text>
                )}
              </Pressable>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  confirmOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  screen: { flex: 1, backgroundColor: "#FAFAFA" },
  flex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FAFAFA" },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  backButtonDimmed: { opacity: 0.5 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#111827" },
  headerSpacer: { width: 44 },
  content: { padding: 12, gap: 16 },
  card: { backgroundColor: "#FFF", borderRadius: 16, padding: 16, gap: 16 },
  title: { fontSize: 18, fontWeight: "700", color: "#111827" },
  label: { fontWeight: "600", color: "#111827" },
  field: { gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#D9DFE8",
    padding: 12,
    borderRadius: 10,
    minHeight: 48,
    color: "#111827",
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    padding: 12,
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#D9DFE8",
    borderRadius: 10,
    justifyContent: "center",
  },
  selected: { backgroundColor: "#FFF1CC", borderColor: "#E0A800" },
  photo: { width: 110, height: 100, borderRadius: 8 },
  submit: {
    padding: 18,
    alignItems: "center",
    backgroundColor: "#FFC548",
    borderRadius: 14,
  },
  error: { color: "#B42318" },
});
