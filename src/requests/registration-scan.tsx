import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import { extractRegistrationCard, getVehicleModels } from "@/lib/api";
import type { ScanPhase } from "@/lib/registration-job-api";
import { getAuthSessionSnapshot, subscribeAuthSession } from "@/lib/auth-token";
import type { LocalPhotoAsset } from "@/types/customer-request";
import type { VehicleCatalogBrand } from "@/types/vehicle";
import {
  applyRegistrationExtraction,
  exactCatalogMatch,
  invalidScanField,
  SCAN_FORM_FIELDS,
  scanValues,
  type FormVehicle,
} from "./registration-mapping";

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
  const [phase, setPhase] = useState<ScanPhase | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState(false);
  const cancelPromptRef = useRef(false);
  const cancellationDecision = useRef<((keep: boolean) => void) | null>(null);
  const remoteCancel = useRef<(() => Promise<void>) | null>(null);
  const [error, setError] = useState("");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [appliedStatus, setAppliedStatus] = useState<
    "extracted" | "partial" | null
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
    if (Platform.OS !== "web") {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        /* Cache expiration is safe. */
      }
    } else if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
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
    void remoteCancel.current?.();
    remoteCancel.current = null;
    cancelPromptRef.current = false;
    setCancelPrompt(false);
    cancellationDecision.current?.(false);
    cancellationDecision.current = null;
    invalidate();
    cleanup();
    imageRef.current = [];
    setImages([]);
    setOpen(false);
    busyRef.current = false;
    setBusy(false);
    setProgress(null);
    setPhase(null);
    setError("");
    setPermissionDenied(false);
    setAppliedStatus(null);
  };
  const requestClose = () => {
    if (controller.current) {
      cancelPromptRef.current = true;
      setCancelPrompt(true);
    } else close();
  };
  const keepWaiting = () => {
    cancelPromptRef.current = false;
    setCancelPrompt(false);
    cancellationDecision.current?.(true);
    cancellationDecision.current = null;
  };
  useEffect(() => {
    const owner = getAuthSessionSnapshot().user?.id;
    const unsubscribe = subscribeAuthSession(() => {
      if (getAuthSessionSnapshot().user?.id !== owner) close();
    });
    return () => {
      unsubscribe();
      void remoteCancel.current?.();
      remoteCancel.current = null;
      cancellationDecision.current?.(false);
      invalidate();
      cleanup();
    };
    // Only mount/unmount and account identity changes own this ephemeral session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeImages = (next: LocalPhotoAsset[]) => {
    invalidate();
    setError("");
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
          throw new Error("vehicleRequest.scan.invalidImage");
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
            Platform.OS === "web"
              ? (await (await fetch(saved.uri)).blob()).size
              : new File(saved.uri).size;
          if (size > 8 * 1024 * 1024) {
            cleanupFile(saved.uri);
            throw new Error("vehicleRequest.scan.tooLarge");
          }
          return {
            uri: saved.uri,
            mimeType: "image/jpeg",
            fileName: "registration-card.jpg",
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
    setError("");
    setPermissionDenied(false);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          if (id === epoch.current) {
            setPermissionDenied(true);
            setError("vehicleRequest.scan.permission");
          }
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
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
      if (Platform.OS !== "web" && asset.uri.startsWith(Paths.cache.uri))
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
          e instanceof Error && e.message.startsWith("vehicleRequest.scan.")
            ? e.message
            : "vehicleRequest.scan.invalidImage",
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
      if (id === epoch.current) setError("vehicleRequest.scan.invalidImage");
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
    setPhase(null);
    setError("");
    try {
      const timeout = new Promise<never>((_, reject) => {
        scanTimer.current = setTimeout(() => {
          reject({ code: "REGISTRATION_TIMEOUT" });
          abort.abort();
        }, 300000);
      });
      const waitForDecision = async () => {
        if (!cancelPromptRef.current) return true;
        return Promise.race([
          new Promise<boolean>((resolve) => {
            cancellationDecision.current = resolve;
          }),
          timeout,
        ]);
      };
      const extracted = await Promise.race([
        extractRegistrationCard(imageRef.current, {
          signal: abort.signal,
          onProgress: (n) => {
            if (id === epoch.current && !abort.signal.aborted) setProgress(n);
          },
          onStatus: (status) => {
            if (id === epoch.current && !abort.signal.aborted) setPhase(status);
          },
          onAccepted: (cancel) => {
            if (id === epoch.current && !abort.signal.aborted)
              remoteCancel.current = cancel;
            else void cancel();
          },
        }),
        timeout,
      ]);
      if (id !== epoch.current) return;
      if (
        !(await waitForDecision()) ||
        id !== epoch.current ||
        abort.signal.aborted
      )
        return;
      if (
        extracted.status === "wrong_document" ||
        extracted.status === "unreadable"
      ) {
        setError(`vehicleRequest.scan.${extracted.status}`);
        return;
      }
      const next = scanValues(extracted, brands);
      if (
        !SCAN_FORM_FIELDS.some((name) => !invalidScanField(name, next[name]))
      ) {
        setError("vehicleRequest.scan.noDetails");
        return;
      }
      const brand = exactCatalogMatch(
        brands,
        next.brand || current.current.brand,
      );
      const models = brand
        ? await Promise.race([
            getVehicleModels(brand.id).catch(() => []),
            timeout,
          ])
        : [];
      if (id !== epoch.current || abort.signal.aborted) return;
      if (
        !(await waitForDecision()) ||
        id !== epoch.current ||
        abort.signal.aborted
      )
        return;
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
          "REGISTRATION_INVALID_UPLOAD",
          "REGISTRATION_CONFIGURATION",
          "REGISTRATION_TIMEOUT",
          "REGISTRATION_RATE_LIMIT",
          "REGISTRATION_UNAVAILABLE",
          "REGISTRATION_INVALID_OUTPUT",
          "REGISTRATION_AUTH_REQUIRED",
          "REGISTRATION_QUEUE_FULL",
          "REGISTRATION_ALREADY_PENDING",
          "REGISTRATION_CANCELLED",
        ];
        setError(
          `vehicleRequest.scan.${known.includes(code ?? "") ? code : "REGISTRATION_UNAVAILABLE"}`,
        );
      }
    } finally {
      if (id === epoch.current) {
        void remoteCancel.current?.();
        remoteCancel.current = null;
        if (scanTimer.current !== null) clearTimeout(scanTimer.current);
        scanTimer.current = null;
        controller.current = null;
        busyRef.current = false;
        setBusy(false);
        setProgress(null);
        setPhase(null);
        cancelPromptRef.current = false;
        setCancelPrompt(false);
        cancellationDecision.current = null;
      }
    }
  };
  return (
    <View style={styles.card}>
      {
        <ScanButton
          title={"vehicleRequest.scan.title"}
          onPress={() => {
            setOpen(true);
            setError("");
          }}
        />
      }
      <Text style={styles.text}>{t("vehicleRequest.scan.intro")}</Text>
      {appliedStatus ? (
        <Text accessibilityLiveRegion="polite" style={styles.feedbackSuccess}>
          {t(
            appliedStatus === "partial"
              ? "vehicleRequest.scan.partialSuccess"
              : "vehicleRequest.scan.success",
          )}
        </Text>
      ) : null}
      <Modal visible={open} animationType="slide" onRequestClose={requestClose}>
        <SafeAreaView style={[styles.screen, { direction: i18n.dir() }]}>
          <View style={styles.row}>
            <Text style={styles.heading}>{t("vehicleRequest.scan.title")}</Text>
            {
              <ScanButton
                title={"vehicleRequest.close"}
                onPress={requestClose}
              />
            }
          </View>
          {cancelPrompt ? (
            <View accessibilityViewIsModal style={styles.card}>
              <Text
                accessibilityRole="header"
                accessibilityLiveRegion="polite"
                style={styles.heading}
              >
                {t("vehicleRequest.scan.cancelQuestion")}
              </Text>
              <ScanButton
                title="vehicleRequest.scan.keepWaiting"
                onPress={keepWaiting}
              />
              <ScanButton title="vehicleRequest.scan.cancel" onPress={close} />
            </View>
          ) : null}
          {error ? (
            <Text accessibilityLiveRegion="polite" style={styles.feedbackError}>
              {t(error)}
            </Text>
          ) : null}
          {busy ? (
            <View style={styles.feedbackProgress}>
              <ActivityIndicator color="#111827" />
              <Text accessibilityLiveRegion="polite" style={styles.text}>
                {t(
                  phase === "queued"
                    ? "vehicleRequest.scan.queued"
                    : phase === "processing"
                      ? "vehicleRequest.scan.processing"
                      : progress === null
                        ? "vehicleRequest.scan.preparing"
                        : progress >= 1
                          ? "vehicleRequest.scan.accepting"
                          : "vehicleRequest.scan.uploading",
                  { progress: Math.round((progress ?? 0) * 100) },
                )}
              </Text>
            </View>
          ) : null}
          {busy && progress !== null && !cancelPrompt ? (
            <ScanButton
              title="vehicleRequest.scan.cancel"
              onPress={requestClose}
            />
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            {permissionDenied ? (
              <ScanButton
                title={"vehicleRequest.scan.settings"}
                onPress={() => {
                  void Linking.openSettings();
                }}
              />
            ) : null}
            {
              <>
                <Text style={styles.text}>
                  {t("vehicleRequest.scan.disclosure")}
                </Text>
                <Text style={styles.text}>
                  {t("vehicleRequest.scan.instructions")}
                </Text>
                {images.map((photo, index) => (
                  <View key={photo.uri} style={styles.card}>
                    <Text style={styles.label}>
                      {t(
                        index === 0
                          ? "vehicleRequest.scan.front"
                          : "vehicleRequest.scan.back",
                      )}
                    </Text>
                    <Image
                      accessibilityLabel={t("vehicleRequest.scan.preview")}
                      source={{ uri: photo.uri }}
                      style={styles.preview}
                      resizeMode="contain"
                    />
                    <View style={styles.row}>
                      {
                        <ScanButton
                          title={"vehicleRequest.scan.retake"}
                          onPress={() => {
                            void choose(true, index);
                          }}
                          disabled={busy}
                        />
                      }
                      {
                        <ScanButton
                          title={"vehicleRequest.scan.replace"}
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
                          title={"vehicleRequest.scan.rotate"}
                          onPress={() => {
                            void rotate(index);
                          }}
                          disabled={busy}
                        />
                      }
                      {
                        <ScanButton
                          title={"vehicleRequest.scan.remove"}
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
                        title={"vehicleRequest.scan.camera"}
                        onPress={() => {
                          void choose(true);
                        }}
                        disabled={busy}
                      />
                    }
                    {
                      <ScanButton
                        title={"vehicleRequest.scan.gallery"}
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
                    title={"vehicleRequest.scan.extract"}
                    onPress={() => {
                      void scan();
                    }}
                    disabled={busy || !images.length}
                  />
                }
                {
                  <ScanButton
                    title={"vehicleRequest.scan.manual"}
                    onPress={requestClose}
                  />
                }
              </>
            }
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFF", padding: 16 },
  content: { gap: 16, paddingBottom: 24 },
  card: {
    backgroundColor: "#FFF",
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E8EF",
    gap: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    justifyContent: "space-between",
  },
  heading: { color: "#111827", fontSize: 20, fontWeight: "700", flexShrink: 1 },
  label: { color: "#111827", fontSize: 14, fontWeight: "600" },
  text: { color: "#111827", fontSize: 14, lineHeight: 21 },
  feedbackError: {
    color: "#B42318",
    backgroundColor: "#FEF3F2",
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
    fontSize: 14,
    lineHeight: 21,
  },
  feedbackSuccess: {
    color: "#067647",
    backgroundColor: "#ECFDF3",
    padding: 12,
    borderRadius: 12,
    marginVertical: 8,
    fontSize: 14,
    lineHeight: 21,
  },
  feedbackProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
  },
  button: {
    backgroundColor: "#FFC548",
    borderRadius: 14,
    padding: 14,
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  preview: { width: "100%", height: 220 },
});
