import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ColorValue,
  ImageBackground,
  type ImageSourcePropType,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { clientTheme } from "@/components/tracking-ui";
import { getCustomerHome, getServices } from "@/lib/api";
import { formatDateOnly } from "@/localization/format";
import { useAppLanguage } from "@/localization/provider";
import type {
  CustomerHomeRequestSummary,
  CustomerHomeResponse,
} from "@/types/customer-request";
import type { Service } from "@/types/service";
import appI18n from '@/localization/i18n';

const serviceIcons: Record<string, SymbolViewProps["name"]> = {
  VEHICLE_TRANSPORT: {
    ios: "car.fill",
    android: "directions_car",
    web: "directions_car",
  },
  MOTORCYCLE_TRANSPORT: {
    ios: "bicycle",
    android: "two_wheeler",
    web: "two_wheeler",
  },
  GOODS_TRANSPORT: {
    ios: "shippingbox.fill",
    android: "inventory_2",
    web: "inventory_2",
  },
  FURNITURE_TRANSPORT: { ios: "sofa.fill", android: "chair", web: "chair" },
};

const serviceTileImages: Record<string, ImageSourcePropType> = {
  VEHICLE_TRANSPORT: require("@/assets/images/services/vehicle.jpg"),
  MOTORCYCLE_TRANSPORT: require("@/assets/images/services/motorcycle.jpg"),
  GOODS_TRANSPORT: require("@/assets/images/services/goods.jpg"),
  FURNITURE_TRANSPORT: require("@/assets/images/services/furniture.jpg"),
};

type ServiceTileTheme = {
  backgroundColor: string;
  overlayColor: string;
};

function getServiceLabel(
  serviceKey: string | null | undefined,
  fallback: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (serviceKey) {
    case "VEHICLE_TRANSPORT":
      return t("Vehicle");
    case "MOTORCYCLE_TRANSPORT":
      return t("Motorcycle & Bicycle");
    case "GOODS_TRANSPORT":
      return t("Goods");
    case "FURNITURE_TRANSPORT":
      return t("House Moving");
    default:
      return fallback || t("Service");
  }
}

function getServiceTheme(serviceKey: string): ServiceTileTheme {
  switch (serviceKey) {
    case "VEHICLE_TRANSPORT":
      return {
        backgroundColor: "#F4BD3C",
        overlayColor: "#FFD86F",
      };
    case "MOTORCYCLE_TRANSPORT":
      return {
        backgroundColor: "#0F69D8",
        overlayColor: "#3C8EF3",
      };
    case "GOODS_TRANSPORT":
      return {
        backgroundColor: "#11B85E",
        overlayColor: "#46D889",
      };
    case "FURNITURE_TRANSPORT":
      return {
        backgroundColor: "#F08948",
        overlayColor: "#FFB17E",
      };
    default:
      return {
        backgroundColor: clientTheme.accentStrong,
        overlayColor: clientTheme.accent,
      };
  }
}

function getGreeting(
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const hour = new Date().getHours();

  if (hour < 12) {
    return t("Good morning!");
  }

  if (hour < 18) {
    return t("Good afternoon!");
  }

  return t("Good evening!");
}

function compactAddress(
  address: string | null | undefined,
  fallback: string,
): string {
  if (!address?.trim()) {
    return fallback;
  }

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return appI18n.t("{{value0}}, {{value1}}", { value0: parts[0], value1: parts[1] });
  }

  return parts[0] ?? fallback;
}

function buildLocationLabel(
  data: CustomerHomeResponse,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return compactAddress(
    data.activeRequest?.pickupAddress ??
      data.recentRequests[0]?.pickupAddress ??
      data.recentRequests[0]?.dropoffAddress,
    t("Ready to book"),
  );
}

function getRequestDateLabel(
  request: CustomerHomeRequestSummary,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const value =
    request.submittedAt ?? request.createdAt ?? request.scheduledPickupAt;
  return value ? formatDateOnly(value) : t("Date pending");
}

function getRequestReference(requestId: string): string {
  const compactId = requestId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return appI18n.t("ID {{value0}}", { value0: compactId || requestId });
}

function getRouteLabel(
  request: CustomerHomeRequestSummary,
  directionArrow: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const pickup = compactAddress(request.pickupAddress, t("Pickup"));
  const dropoff = compactAddress(request.dropoffAddress, t("Dropoff"));
  return appI18n.t("{{value0}} {{value1}} {{value2}}", { value0: pickup, value1: directionArrow, value2: dropoff });
}

function getStatusTone(status: CustomerHomeRequestSummary["status"]): {
  backgroundColor: string;
  textColor: string;
} {
  switch (status) {
    case "DELIVERED":
    case "COMPLETED":
      return {
        backgroundColor: "#E9F9EE",
        textColor: "#1E9E4A",
      };
    case "CANCELLED":
      return {
        backgroundColor: "#FDE8E7",
        textColor: "#C0392B",
      };
    default:
      return {
        backgroundColor: "#FFF3D6",
        textColor: "#D89A1A",
      };
  }
}

function getStatusLabel(
  request: CustomerHomeRequestSummary,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const key = `request_status.${request.status}`;
  const translated = t(key);

  return translated === key ? request.statusLabel : translated;
}

function IconSymbol({
  name,
  color,
  size = 20,
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

function StatusBadge({
  status,
  label,
}: {
  status: CustomerHomeRequestSummary["status"];
  label: string;
}) {
  const tone = getStatusTone(status);

  return (
    <View
      style={[styles.statusBadge, { backgroundColor: tone.backgroundColor }]}
    >
      <Text
        style={[styles.statusBadgeText, { color: tone.textColor }]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}

function ServiceTile({
  serviceKey,
  label,
  onPress,
}: {
  serviceKey: string;
  label: string;
  onPress: () => void;
}) {
  const theme = getServiceTheme(serviceKey);
  const image = serviceTileImages[serviceKey];

  return (
    <Pressable style={styles.serviceTileButton} onPress={onPress}>
      <View
        style={[styles.serviceTile, { backgroundColor: theme.backgroundColor }]}
      >
        {image ? (
          <ImageBackground
            source={image}
            style={styles.serviceTileImage}
            resizeMode="cover"
          />
        ) : (
          <>
            <View
              style={[
                styles.serviceGlow,
                { backgroundColor: theme.overlayColor, top: -22, right: 10 },
              ]}
            />
            <View
              style={[
                styles.serviceGlow,
                {
                  backgroundColor: theme.overlayColor,
                  bottom: -34,
                  left: -26,
                  opacity: 0.4,
                },
              ]}
            />
          </>
        )}
      </View>
      <Text style={styles.serviceTileTitle} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActiveOrderCard({
  request,
  directionArrow,
  onPress,
  t,
}: {
  request: CustomerHomeRequestSummary;
  directionArrow: string;
  onPress: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const icon = serviceIcons[request.serviceKey ?? ""];

  return (
    <Pressable style={styles.activeOrderCard} onPress={onPress}>
      <View style={styles.activeOrderRow}>
        <View style={styles.activeOrderIdentity}>
          <View style={styles.activeOrderIcon}>
            {icon ? (
              <IconSymbol
                name={icon}
                color={clientTheme.accentStrong}
                size={20}
              />
            ) : null}
          </View>
          <View style={styles.activeOrderTextBlock}>
            <Text style={styles.activeOrderTitle}>
              {getServiceLabel(request.serviceKey, request.serviceName, t)}
            </Text>
            <Text style={styles.activeOrderRoute} numberOfLines={2}>
              {getRouteLabel(request, directionArrow, t)}
            </Text>
          </View>
        </View>
        <StatusBadge status={request.status} label={getStatusLabel(request, t)} />
      </View>

      <View style={styles.activeOrderDivider} />

      <View style={styles.activeOrderMeta}>
        <Text style={styles.activeOrderMetaText}>
          {getRequestReference(request.id)}
        </Text>
        <Text style={styles.activeOrderMetaText}>
          {getRequestDateLabel(request, t)}
        </Text>
      </View>
    </Pressable>
  );
}

function EmptyActiveOrder({
  onPress,
  t,
}: {
  onPress: () => void;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.activeOrderCard}>
      <View style={styles.emptyOrderHeader}>
        <View style={styles.emptyOrderIcon}>
          <IconSymbol
            name={{
              ios: "shippingbox.fill",
              android: "inventory_2",
              web: "inventory_2",
            }}
            color={clientTheme.accentStrong}
            size={20}
          />
        </View>
        <View style={styles.emptyOrderTextBlock}>
          <Text style={styles.activeOrderTitle}>{t("No active order")}</Text>
          <Text style={styles.activeOrderRoute}>
            {t("Create a new request to start transporting.")}
          </Text>
        </View>
      </View>
    </View>
  );
}

function RecentActivityRow({
  request,
  directionArrow,
  onPress,
  t,
}: {
  request: CustomerHomeRequestSummary;
  directionArrow: string;
  onPress: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const icon = serviceIcons[request.serviceKey ?? ""];
  const tone = getStatusTone(request.status);

  return (
    <Pressable style={styles.recentRow} onPress={onPress}>
      <View style={styles.recentIcon}>
        {icon ? (
          <IconSymbol name={icon} color={clientTheme.accentStrong} size={18} />
        ) : null}
      </View>
      <View style={styles.recentContent}>
        <Text style={styles.recentTitle}>
          {getServiceLabel(request.serviceKey, request.serviceName, t)}
        </Text>
        <Text style={styles.recentSubtitle} numberOfLines={1}>
          {getRouteLabel(request, directionArrow, t)}
        </Text>
      </View>
      <View style={styles.recentMeta}>
        <Text style={styles.recentDate}>{getRequestDateLabel(request, t)}</Text>
        <Text style={[styles.recentStatus, { color: tone.textColor }]}>
          {getStatusLabel(request, t)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HomeTabScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<CustomerHomeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [servicesByKey, setServicesByKey] = useState<Record<string, Service>>({});

  const loadHome = useCallback(
    async (isRefresh: boolean): Promise<void> => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage("");

      try {
        const [response, services] = await Promise.all([
          getCustomerHome(),
          getServices().catch(() => []),
        ]);
        setData(response);
        setServicesByKey(
          Object.fromEntries(services.map((service) => [service.key, service])),
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("Unable to load home data.");
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadHome(false);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadHome]);

  const onViewStatus = useCallback(
    (requestId: string): void => {
      router.push({ pathname: "/request-status", params: { requestId } });
    },
    [router],
  );

  const onNewRequest = useCallback((): void => {
    router.push("/choose-service");
  }, [router]);

  const onChooseServiceByKey = useCallback(
    async (serviceKey: string): Promise<void> => {
      const service = servicesByKey[serviceKey];
      if (!service) {
        setErrorMessage(t("Unable to load services"));
        return;
      }

      const detailRoutes: Record<
        string,
        | "/vehicle-details"
        | "/motorcycle-details"
        | "/goods-details"
        | "/furniture-details"
      > = {
        VEHICLE_TRANSPORT: "/vehicle-details",
        MOTORCYCLE_TRANSPORT: "/motorcycle-details",
        GOODS_TRANSPORT: "/goods-details",
        FURNITURE_TRANSPORT: "/furniture-details",
      };
      const detailRoute = detailRoutes[serviceKey];

      if (!detailRoute) {
        setErrorMessage(t("Unable to load services"));
        return;
      }

      router.push({
        pathname: detailRoute,
        params: { serviceId: service.id, serviceKey },
      });
    },
    [router, servicesByKey, t],
  );

  const onNotifications = useCallback((): void => {
    router.push("/notifications");
  }, [router]);

  const directionArrow = isRTL ? "←" : "→";

  const quickServices = useMemo(
    () => [
      {
        key: "VEHICLE_TRANSPORT",
        label: getServiceLabel("VEHICLE_TRANSPORT", null, t),
      },
      {
        key: "MOTORCYCLE_TRANSPORT",
        label: getServiceLabel("MOTORCYCLE_TRANSPORT", null, t),
      },
      {
        key: "GOODS_TRANSPORT",
        label: getServiceLabel("GOODS_TRANSPORT", null, t),
      },
      {
        key: "FURNITURE_TRANSPORT",
        label: getServiceLabel("FURNITURE_TRANSPORT", null, t),
      },
    ],
    [t],
  );

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={clientTheme.accentStrong} />
        <Text style={styles.supportingText}>{t("Loading home...")}</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <View style={styles.errorIconCircle}>
          <IconSymbol
            name={{
              ios: "exclamationmark.triangle.fill",
              android: "error",
              web: "error",
            }}
            color={clientTheme.accentStrong}
            size={30}
          />
        </View>
        <Text style={styles.errorTitle}>{t("Unable to load home data.")}</Text>
        <Text style={styles.supportingText}>{errorMessage}</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => void loadHome(false)}
        >
          <Text style={styles.primaryButtonText}>{t("Retry")}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const unreadCount = data.notifications?.unreadCount ?? 0;
  const locationLabel = buildLocationLabel(data, t);
  const activeRequest = data.activeRequest;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={clientTheme.background}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(12, insets.top + 4),
            paddingBottom: Math.max(28, insets.bottom + 18),
          },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void loadHome(true)}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View style={styles.locationWrap}>
            <IconSymbol
              name={{
                ios: "mappin.circle.fill",
                android: "location_on",
                web: "location_on",
              }}
              color={clientTheme.accentStrong}
              size={18}
            />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>

          <Pressable
            style={styles.notificationButton}
            onPress={onNotifications}
          >
            <IconSymbol
              name={{
                ios: "bell",
                android: "notifications_none",
                web: "notifications_none",
              }}
              color={clientTheme.text}
              size={22}
            />
            {unreadCount > 0 ? <View style={styles.notificationDot} /> : null}
          </Pressable>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.heroTitle}>
            {getGreeting(t)} <Text>{"\uD83D\uDC4B"}</Text>
          </Text>
          <Text style={styles.heroSubtitle}>
            {t("What do you need to transport?")}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.servicesScroller}
        >
          {quickServices.map((service) => (
            <ServiceTile
              key={service.key}
              serviceKey={service.key}
              label={service.label}
              onPress={() => void onChooseServiceByKey(service.key)}
            />
          ))}
        </ScrollView>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("Active Order")}</Text>
            <Pressable onPress={() => router.push("/requests")}>
              <Text style={styles.seeAllText}>{t("See All")}</Text>
            </Pressable>
          </View>

          {activeRequest ? (
            <ActiveOrderCard
              request={activeRequest}
              directionArrow={directionArrow}
              onPress={() => onViewStatus(activeRequest.id)}
              t={t}
            />
          ) : (
            <EmptyActiveOrder onPress={onNewRequest} t={t} />
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("Recent Activity")}</Text>
            {data.recentRequests.length > 0 ? (
              <Pressable onPress={() => router.push("/requests")}>
                <Text style={styles.seeAllText}>{t("See All")}</Text>
              </Pressable>
            ) : null}
          </View>

          {data.recentRequests.length === 0 ? (
            <View style={styles.emptyRecentCard}>
              <Text style={styles.supportingText}>
                {t("Your recent transport requests will appear here.")}
              </Text>
            </View>
          ) : (
            <View style={styles.recentList}>
              {data.recentRequests.map((request, index) => (
                <View key={request.id}>
                  <RecentActivityRow
                    request={request}
                    directionArrow={directionArrow}
                    onPress={() => onViewStatus(request.id)}
                    t={t}
                  />
                  {index < data.recentRequests.length - 1 ? (
                    <View style={styles.rowDivider} />
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clientTheme.background,
  },
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: clientTheme.background,
    padding: 24,
    gap: 12,
  },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  locationWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: clientTheme.textMuted,
  },
  notificationButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#FF5A5F",
  },
  heroBlock: {
    gap: 8,
  },
  heroTitle: {
    fontSize: 19,
    lineHeight: 28,
    fontWeight: "800",
    color: clientTheme.text,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: clientTheme.textMuted,
  },
  servicesScroller: {
    paddingRight: 20,
    gap: 12,
  },
  serviceTileButton: {
    width: 156,
    gap: 8,
  },
  serviceTile: {
    height: 132,
    borderRadius: 22,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  serviceGlow: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 999,
    opacity: 0.55,
  },
  serviceTileImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  serviceTileTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: clientTheme.text,
    textAlign: "center",
  },
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: clientTheme.text,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: "600",
    color: clientTheme.accentStrong,
  },
  activeOrderCard: {
    backgroundColor: clientTheme.surface,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: clientTheme.border,
    shadowColor: "#111827",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    gap: 14,
  },
  activeOrderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  activeOrderIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  activeOrderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: clientTheme.accentSoft,
  },
  activeOrderTextBlock: {
    flex: 1,
    gap: 4,
  },
  activeOrderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: clientTheme.text,
  },
  activeOrderRoute: {
    fontSize: 14,
    lineHeight: 20,
    color: clientTheme.textMuted,
  },
  statusBadge: {
    maxWidth: 92,
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  activeOrderDivider: {
    height: 1,
    backgroundColor: clientTheme.border,
  },
  activeOrderMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  activeOrderMetaText: {
    fontSize: 13,
    color: clientTheme.textMuted,
  },
  emptyOrderHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyOrderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: clientTheme.surfaceMuted,
  },
  emptyOrderTextBlock: {
    flex: 1,
    gap: 4,
  },
  inlineActionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: clientTheme.accent,
  },
  inlineActionButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: clientTheme.text,
  },
  recentList: {
    backgroundColor: clientTheme.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: clientTheme.border,
    overflow: "hidden",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  recentIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: clientTheme.surfaceMuted,
  },
  recentContent: {
    flex: 1,
    gap: 4,
  },
  recentTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: clientTheme.text,
  },
  recentSubtitle: {
    fontSize: 14,
    color: clientTheme.textMuted,
  },
  recentMeta: {
    alignItems: "flex-end",
    gap: 4,
  },
  recentDate: {
    fontSize: 13,
    color: clientTheme.text,
    fontWeight: "700",
  },
  recentStatus: {
    fontSize: 13,
    fontWeight: "600",
  },
  rowDivider: {
    height: 1,
    backgroundColor: clientTheme.border,
    marginLeft: 66,
  },
  emptyRecentCard: {
    backgroundColor: clientTheme.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: clientTheme.border,
  },
  primaryButton: {
    backgroundColor: clientTheme.accent,
    borderRadius: 14,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: clientTheme.text,
    fontWeight: "700",
    fontSize: 15,
  },
  supportingText: {
    fontSize: 14,
    lineHeight: 20,
    color: clientTheme.textMuted,
    textAlign: "center",
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: clientTheme.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: clientTheme.text,
  },
});
