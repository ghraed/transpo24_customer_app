import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import {
  deleteCustomerAccountSession,
  switchCustomerAccountOnDevice,
} from "@/lib/auth-token";
import { getCustomerHome } from "@/lib/api";
import { getCountryLabel } from "@/lib/country-currency";
import {
  LANGUAGE_CONFIGS,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from "@/localization/languages";
import { useAppLanguage } from "@/localization/provider";
import { registerCustomerPushNotifications } from "@/notifications/registerPushNotifications";
import type { CustomerHomeProfile } from "@/types/customer-request";

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps["name"];
  color: ColorValue;
  size?: number;
}) {
  return (
    <SymbolView
      name={name}
      tintColor={color}
      size={size}
      resizeMode="scaleAspectFit"
    />
  );
}

export default function ProfileTabScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language, isChangingLanguage, setLanguage } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<CustomerHomeProfile | null>(null);
  const [pushStatus, setPushStatus] = useState("");
  const [isRegisteringPush, setIsRegisteringPush] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<AppLanguage | null>(
    null,
  );

  const selectedLanguage = LANGUAGE_CONFIGS[language];
  const pendingLanguageConfig = pendingLanguage
    ? LANGUAGE_CONFIGS[pendingLanguage]
    : null;

  const profileInitials = useMemo(() => {
    const name = profile?.fullName?.trim();
    if (!name) {
      return "CU";
    }

    const parts = name.split(/\s+/).filter(Boolean);
    return (
      parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "CU"
    );
  }, [profile?.fullName]);

  const loadProfile = useCallback(async (): Promise<void> => {
    try {
      const response = await getCustomerHome();
      setProfile(response.customer);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadProfile();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadProfile]);

  const onLogout = async (): Promise<void> => {
    await switchCustomerAccountOnDevice();
    router.replace("/");
  };

  const onDeleteAccount = (): void => {
    if (isDeletingAccount) return;
    Alert.alert(
      t("Delete account?"),
      t("This permanently deletes your account, signs you out on all devices, and cannot be undone."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Delete account"),
          style: "destructive",
          onPress: () => {
            setIsDeletingAccount(true);
            void deleteCustomerAccountSession()
              .then(() => router.replace("/"))
              .catch((error) => {
                Alert.alert(
                  t("Unable to delete account"),
                  error instanceof Error ? error.message : t("Please try again."),
                );
              })
              .finally(() => setIsDeletingAccount(false));
          },
        },
      ],
    );
  };

  const onRegisterPush = useCallback(async (): Promise<void> => {
    if (isRegisteringPush) {
      return;
    }

    setIsRegisteringPush(true);
    setPushStatus("");

    try {
      const token = await registerCustomerPushNotifications();
      setPushStatus(
        t("Push registered: {{token}}...", { token: token.slice(0, 24) }),
      );
    } catch (error) {
      setPushStatus(
        error instanceof Error
          ? error.message
          : t("Failed to register push notifications."),
      );
    } finally {
      setIsRegisteringPush(false);
    }
  }, [isRegisteringPush, t]);

  const requestLanguageChange = (nextLanguage: AppLanguage): void => {
    setIsLanguageOpen(false);
    setPendingLanguage(nextLanguage);
  };

  const confirmLanguageChange = async (): Promise<void> => {
    if (
      !pendingLanguage ||
      pendingLanguage === language ||
      isChangingLanguage
    ) {
      setPendingLanguage(null);
      return;
    }

    await setLanguage(pendingLanguage);
    setPendingLanguage(null);
  };

  const closeLanguageModal = (): void => {
    if (isChangingLanguage) {
      return;
    }

    setPendingLanguage(null);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: 16,
            paddingBottom: Math.max(insets.bottom + 108, 132),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{profileInitials}</Text>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>
              {profile?.fullName || t("Customer")}
            </Text>
            {/*<Text style={styles.heroMeta}>{profile?.email || t('No email')}</Text>*/}
            <Text style={styles.heroMeta}>
              {profile?.phone || t("No phone number")}
            </Text>
            {profile?.countryCode ? (
              <Text style={styles.heroMeta}>
                {getCountryLabel(profile.countryCode)}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderIcon}>
              <IconSymbol
                name={{ ios: "globe", android: "language", web: "language" }}
                color="#111827"
                size={18}
              />
            </View>
            <Text style={styles.sectionTitle}>{t("Language")}</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            {t("Choose the app language before confirming the switch.")}
          </Text>

          <Pressable
            style={styles.dropdownTrigger}
            onPress={() => setIsLanguageOpen((prev) => !prev)}
            disabled={isChangingLanguage}
          >
            <View style={styles.dropdownContent}>
              <View style={styles.dropdownLeadingIcon}>
                <IconSymbol
                  name={{ ios: "globe", android: "language", web: "language" }}
                  color="#111827"
                  size={18}
                />
              </View>
              <Text style={styles.dropdownLabel}>{t("Current language")}</Text>
              <Text style={styles.dropdownValue}>
                {selectedLanguage.nativeLabel}
              </Text>
              <Text style={styles.dropdownMeta}>{t(selectedLanguage.label)}</Text>
            </View>
            <View style={styles.dropdownIconWrap}>
              <IconSymbol
                name={
                  isLanguageOpen
                    ? {
                        ios: "chevron.up",
                        android: "keyboard_arrow_up",
                        web: "keyboard_arrow_up",
                      }
                    : {
                        ios: "chevron.down",
                        android: "keyboard_arrow_down",
                        web: "keyboard_arrow_down",
                      }
                }
                color="#111827"
                size={16}
              />
            </View>
          </Pressable>

          {isLanguageOpen ? (
            <View style={styles.dropdownPanel}>
              {SUPPORTED_LANGUAGES.map((code) => {
                const config = LANGUAGE_CONFIGS[code];
                const isSelected = language === code;

                return (
                  <Pressable
                    key={code}
                    style={[
                      styles.languageOption,
                      isSelected && styles.languageOptionSelected,
                    ]}
                    onPress={() => requestLanguageChange(code)}
                    disabled={isChangingLanguage}
                  >
                    <View style={styles.languageInfo}>
                      <Text style={styles.languageName}>
                        {config.nativeLabel}
                      </Text>
                      <Text style={styles.languageMeta}>{t(config.label)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.languageCode,
                        isSelected && styles.languageCodeSelected,
                      ]}
                    >
                      {isSelected ? t("Current") : code.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionHeaderIcon}>
              <IconSymbol
                name={{
                  ios: "person.crop.circle",
                  android: "account_circle",
                  web: "account_circle",
                }}
                color="#111827"
                size={18}
              />
            </View>
            <Text style={styles.sectionTitle}>{t("Account")}</Text>
          </View>

          <Pressable
            style={styles.actionRow}
            onPress={() => router.push("/edit-profile")}
          >
            <View style={styles.actionIconWrap}>
              <IconSymbol
                name={{
                  ios: "person.crop.circle",
                  android: "account_circle",
                  web: "account_circle",
                }}
                color="#111827"
                size={18}
              />
            </View>
            <Text style={styles.actionText}>{t("Edit Profile")}</Text>
          </Pressable>

          <Pressable style={styles.actionRow}>
            <View style={styles.actionIconWrap}>
              <IconSymbol
                name={{
                  ios: "gearshape",
                  android: "settings",
                  web: "settings",
                }}
                color="#111827"
                size={18}
              />
            </View>
            <Text style={styles.actionText}>{t("Settings")}</Text>
          </Pressable>

          <Pressable
            style={styles.actionRow}
            onPress={() => router.push("/wallet")}
          >
            <View style={styles.actionIconWrap}>
              <IconSymbol
                name={{
                  ios: "wallet.bifold.fill",
                  android: "account_balance_wallet",
                  web: "account_balance_wallet",
                }}
                color="#111827"
                size={18}
              />
            </View>
            <Text style={styles.actionText}>{t("Wallet")}</Text>
          </Pressable>

          <Pressable
            style={styles.actionRow}
            onPress={() => void onRegisterPush()}
          >
            <View style={styles.actionIconWrap}>
              <IconSymbol
                name={{
                  ios: "bell.badge.fill",
                  android: "notifications",
                  web: "notifications",
                }}
                color="#111827"
                size={18}
              />
            </View>
            <Text style={styles.actionText}>
              {isRegisteringPush
                ? t("Registering Push...")
                : t("Register Push Notifications")}
            </Text>
          </Pressable>

          {pushStatus ? (
            <Text style={styles.statusText}>{pushStatus}</Text>
          ) : null}

          <Pressable
            style={[styles.actionRow, styles.deleteAccountRow]}
            onPress={onDeleteAccount}
            disabled={isDeletingAccount}
          >
            <Text style={styles.deleteAccountText}>
              {isDeletingAccount ? t("Deleting account...") : t("Delete account")}
            </Text>
          </Pressable>
        </View>

        <Pressable style={styles.logoutButton} onPress={() => void onLogout()}>
          <Text style={styles.logoutButtonText}>{t("Logout")}</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={pendingLanguage !== null}
        transparent
        animationType="fade"
        onRequestClose={closeLanguageModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t("Confirm language change")}
            </Text>
            <Text style={styles.modalBody}>
              {pendingLanguageConfig
                ? t("Switch app language to {{language}}?", {
                    language: pendingLanguageConfig.nativeLabel,
                  })
                : t("Switch app language?")}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalSecondaryButton}
                onPress={closeLanguageModal}
                disabled={isChangingLanguage}
              >
                <Text style={styles.modalSecondaryText}>{t("Cancel")}</Text>
              </Pressable>
              <Pressable
                style={styles.modalPrimaryButton}
                onPress={() => void confirmLanguageChange()}
                disabled={isChangingLanguage}
              >
                {isChangingLanguage ? (
                  <ActivityIndicator color="#111827" />
                ) : (
                  <Text style={styles.modalPrimaryText}>{t("Confirm")}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FAFAFA",
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E8EF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFC548",
  },
  avatarText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
  },
  heroCopy: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
  },
  heroMeta: {
    fontSize: 14,
    color: "#68768A",
  },
  sectionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5E8EF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFC548",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: "#68768A",
    marginTop: 6,
    marginBottom: 14,
  },
  dropdownTrigger: {
    minHeight: 62,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  dropdownContent: {
    flex: 1,
    paddingLeft: 44,
  },
  dropdownLeadingIcon: {
    position: "absolute",
    left: 0,
    top: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFC548",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#98A2B3",
    marginBottom: 4,
  },
  dropdownValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  dropdownMeta: {
    fontSize: 13,
    color: "#68768A",
    marginTop: 2,
  },
  dropdownIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFC548",
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownPanel: {
    marginTop: 12,
    gap: 10,
  },
  languageOption: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  languageOptionSelected: {
    backgroundColor: "#FFF7E1",
    borderColor: "#FFC548",
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  languageMeta: {
    fontSize: 12,
    color: "#68768A",
    marginTop: 2,
  },
  languageCode: {
    fontSize: 12,
    fontWeight: "800",
    color: "#98A2B3",
  },
  languageCodeSelected: {
    color: "#D89A1A",
  },
  actionRow: {
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
  actionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFC548",
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  deleteAccountRow: {
    justifyContent: "center",
    borderColor: "#F5C2C7",
    backgroundColor: "#FFF7F7",
  },
  deleteAccountText: {
    color: "#C82424",
    fontSize: 15,
    fontWeight: "800",
  },
  statusText: {
    marginTop: 12,
    color: "#68768A",
    fontSize: 13,
    lineHeight: 18,
  },
  logoutButton: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E8EF",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  modalBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: "#68768A",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  modalSecondaryText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FFC548",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFC548",
  },
  modalPrimaryText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
});
