import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { usePathname, useRootNavigationState, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import { SymbolView } from "expo-symbols";
import { useTranslation } from "react-i18next";
import { clientTheme } from "./tracking-ui";
import {
  getCustomerNotifications,
  getPickupPaymentReminders,
  getCustomerRequestStatus,
  getCustomerRequestOffers,
  markCustomerNotificationRead,
  type PickupPaymentReminder,
} from "@/lib/api";
import { previewReminder } from "@/notifications/pickup-reminders";

export function PickupPaymentReminderPopup({
  ready,
  userId,
}: {
  ready: boolean;
  userId?: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const navigation = useRootNavigationState();
  const [reminder, setReminder] = useState<
    (PickupPaymentReminder & { preview?: boolean }) | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dismissed = useRef(new Set<string>());
  const blocked = [
    "/",
    "/register",
    "/verify-phone",
    "/complete-profile",
    "/request-payment",
  ].includes(pathname);

  useEffect(() => {
    if (!ready || !navigation?.key || blocked) return;
    let active = true;
    let loading = false;
    const load = async () => {
      if (
        loading ||
        AppState.currentState === "background" ||
        AppState.currentState === "inactive"
      )
        return;
      loading = true;
      try {
        const due = await getPickupPaymentReminders();
        let next: (PickupPaymentReminder & { preview?: boolean }) | undefined =
          due.find(
            (row) =>
              Date.parse(row.deadlineAt) > Date.now() &&
              !dismissed.current.has(row.requestId),
          );
        if (__DEV__ && !next) {
          const page = await getCustomerNotifications();
          for (const item of page.items) {
            const preview = previewReminder(item);
            if (preview && !dismissed.current.has(preview.requestId)) {
              next = { ...preview, preview: true };
              break;
            }
          }
        }
        if (active) setReminder(next ?? null);
      } catch {
        /* Keep the current reminder on transient failures; Alerts can be retried. */
      } finally {
        loading = false;
      }
    };
    void load();
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        dismissed.current.clear();
        void load();
      }
    });
    const push = Notifications.addNotificationReceivedListener(() => {
      void load();
    });
    const timer = setInterval(() => {
      void load();
    }, 30000);
    return () => {
      active = false;
      appState.remove();
      push.remove();
      clearInterval(timer);
    };
  }, [ready, navigation?.key, blocked, userId]);

  useEffect(() => {
    if (!reminder) return;
    const timer = setTimeout(
      () => setReminder(null),
      Math.min(
        Math.max(0, Date.parse(reminder.deadlineAt) - Date.now()),
        2147483647,
      ),
    );
    return () => clearTimeout(timer);
  }, [reminder]);

  const dismiss = () => {
    if (!reminder || busy) return;
    dismissed.current.add(reminder.requestId);
    if (reminder.preview)
      void markCustomerNotificationRead(reminder.requestId).catch(
        () => undefined,
      );
    setReminder(null);
    setError("");
  };
  const confirm = async () => {
    if (!reminder || busy) return;
    if (reminder.preview) {
      dismiss();
      router.push("/(tabs)/notifications");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const [request, offers] = await Promise.all([
        getCustomerRequestStatus(reminder.requestId),
        getCustomerRequestOffers(reminder.requestId),
      ]);
      const offer = offers.offers.find(
        (row) =>
          (row.offerId || row.id) === reminder.offerId &&
          (row.offerStatus ?? row.status) === "ACCEPTED",
      );
      if (
        request.status !== "RESERVED" ||
        !request.reservation?.canConfirmAndPay ||
        !offer
      ) {
        setReminder(null);
        router.push({
          pathname: "/request-status",
          params: { requestId: reminder.requestId },
        });
        return;
      }
      dismissed.current.add(reminder.requestId);
      setReminder(null);
      router.push({
        pathname: "/request-payment",
        params: {
          requestId: reminder.requestId,
          offerId: reminder.offerId,
          request: JSON.stringify(request),
          offer: JSON.stringify(offer),
        },
      });
    } catch {
      setError(t("Unable to open payment. Please try again."));
    } finally {
      setBusy(false);
    }
  };
  if (!reminder || !ready || blocked) return null;
  const date = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: reminder.timeZone,
      timeZoneName: "short",
    });
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            <View style={styles.topRow}>
              <View style={styles.icon}>
                <SymbolView
                  name={{
                    ios: "calendar.badge.clock",
                    android: "event",
                    web: "event",
                  }}
                  size={28}
                  tintColor={clientTheme.reminderText}
                />
              </View>
              <Text style={styles.badge}>
                {t(reminder.preview ? "TEST REMINDER" : "ACTION REQUIRED")}
              </Text>
            </View>
            <Text accessibilityRole="header" style={styles.title}>
              {t("Your pickup is coming up")}
            </Text>
            <Text style={styles.body}>
              {t(
                "Your driver is reserved. Confirm your pickup and complete payment to keep your booking.",
              )}
            </Text>
            <View style={styles.details}>
              <Text style={styles.label}>{t("Pickup")}</Text>
              <Text style={styles.value}>{date(reminder.pickupAt)}</Text>
              {reminder.pickupAddress ? (
                <Text style={styles.body}>
                  {reminder.pickupAddress}
                  {reminder.dropoffAddress
                    ? ` → ${reminder.dropoffAddress}`
                    : ""}
                </Text>
              ) : null}
              <View style={styles.divider} />
              <View style={styles.topRow}>
                <Text style={styles.label}>{t("Total amount")}</Text>
                <Text style={styles.price}>
                  {reminder.currency} {reminder.price.toFixed(2)}
                </Text>
              </View>
            </View>
            {(reminder.customerPlatformFeeAmount ?? 0) > 0 ? (
              <Text style={styles.body}>
                {t('Includes 5% platform commission')}
              </Text>
            ) : null}
            <View style={styles.deadline}>
              <Text style={styles.deadlineTitle}>
                {t("Payment due before")} {date(reminder.deadlineAt)}
              </Text>
              <Text style={styles.deadlineBody}>
                {t(
                  "Without confirmation and payment, your reservation will be cancelled automatically.",
                )}
              </Text>
            </View>
            {reminder.preview ? (
              <Text style={styles.body}>
                {t("This is a preview. No booking or payment will be created.")}
              </Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={styles.body}>
                {error}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                void confirm();
              }}
            >
              {busy ? (
                <ActivityIndicator color={clientTheme.text} />
              ) : (
                <Text style={styles.primaryText}>
                  {t(
                    reminder.preview
                      ? "View in Alerts"
                      : "Confirm pickup and pay",
                  )}
                </Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              style={({ pressed }) => [
                styles.secondary,
                pressed && styles.pressed,
              ]}
              onPress={dismiss}
            >
              <Text style={styles.secondaryText}>{t("Remind me later")}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17,24,39,0.55)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: clientTheme.surface,
    borderRadius: 28,
    maxHeight: "90%",
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
    overflow: "hidden",
  },
  content: { padding: 24, gap: 16 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  icon: {
    backgroundColor: clientTheme.accentSoft,
    padding: 16,
    borderRadius: 20,
  },
  badge: {
    color: clientTheme.reminderText,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    flexShrink: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
    color: clientTheme.text,
  },
  body: { fontSize: 15, lineHeight: 23, color: clientTheme.textMuted },
  details: {
    padding: 18,
    gap: 8,
    backgroundColor: clientTheme.surfaceMuted,
    borderRadius: 18,
  },
  label: { fontSize: 13, color: clientTheme.textMuted, fontWeight: "600" },
  value: { fontSize: 18, fontWeight: "700", color: clientTheme.text },
  price: { fontSize: 20, fontWeight: "800", color: clientTheme.text },
  divider: {
    height: 1,
    backgroundColor: clientTheme.border,
    marginVertical: 6,
  },
  deadline: {
    backgroundColor: clientTheme.reminderSurface,
    borderRadius: 16,
    padding: 16,
    gap: 6,
    borderLeftWidth: 3,
    borderColor: clientTheme.accentStrong,
  },
  deadlineTitle: {
    color: clientTheme.reminderText,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 21,
  },
  deadlineBody: {
    color: clientTheme.reminderText,
    fontSize: 13,
    lineHeight: 20,
  },
  primary: {
    minHeight: 54,
    padding: 16,
    borderRadius: 16,
    backgroundColor: clientTheme.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: clientTheme.text, fontSize: 16, fontWeight: "800" },
  secondary: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  secondaryText: {
    color: clientTheme.textMuted,
    fontSize: 15,
    fontWeight: "600",
  },
  pressed: { opacity: 0.7 },
});
