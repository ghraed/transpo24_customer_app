import { useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ColorValue,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { M3LoginColors } from '@/constants/theme';
import { getCustomerHome } from '@/lib/api';
import { formatDateTime, formatNumber } from '@/localization/format';
import { useAppLanguage } from '@/localization/provider';
import type { CustomerHomeRequestSummary, CustomerHomeResponse } from '@/types/customer-request';

const serviceIcons: Record<string, SymbolViewProps['name']> = {
  VEHICLE_TRANSPORT: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  MOTORCYCLE_TRANSPORT: { ios: 'bicycle', android: 'two_wheeler', web: 'two_wheeler' },
  GOODS_TRANSPORT: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
  FURNITURE_TRANSPORT: { ios: 'sofa.fill', android: 'chair', web: 'chair' },
};

function getServiceLabel(
  serviceKey: string | null | undefined,
  fallback: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (serviceKey) {
    case 'VEHICLE_TRANSPORT':
      return t('Vehicle transport');
    case 'MOTORCYCLE_TRANSPORT':
      return t('Motorcycle transport');
    case 'GOODS_TRANSPORT':
      return t('Goods transport');
    case 'FURNITURE_TRANSPORT':
      return t('Furniture transport');
    default:
      return fallback || t('Service');
  }
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

function StatusPill({ statusLabel }: { statusLabel: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{statusLabel}</Text>
    </View>
  );
}

function QuickServiceChip({
  serviceKey,
  label,
  onPress,
}: {
  serviceKey: string;
  label: string;
  onPress: () => void;
}) {
  const icon = serviceIcons[serviceKey];

  return (
    <Pressable style={styles.chip} onPress={onPress}>
      {icon ? <IconSymbol name={icon} color={M3LoginColors.primary} size={20} /> : null}
      <Text style={styles.chipLabel}>{label}</Text>
    </Pressable>
  );
}

function StatCard({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: SymbolViewProps['name'];
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconCircle}>
        <IconSymbol name={icon} color={M3LoginColors.onPrimary} size={20} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActiveRequestCard({
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
  const serviceKey = request.serviceKey ?? '';
  const icon = serviceIcons[serviceKey];

  return (
    <Pressable style={styles.activeCard} onPress={onPress}>
      <View style={styles.activeCardHeader}>
        <View style={styles.serviceBadge}>
          {icon ? <IconSymbol name={icon} color={M3LoginColors.primary} size={18} /> : null}
          <Text style={styles.serviceBadgeText}>
            {getServiceLabel(request.serviceKey, request.serviceName, t)}
          </Text>
        </View>
        <StatusPill statusLabel={request.statusLabel} />
      </View>

      <View style={styles.routeRow}>
        <IconSymbol
          name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
          color={M3LoginColors.primary}
          size={18}
        />
        <Text style={styles.routeText} numberOfLines={1}>
          {request.pickupAddress || t('Pickup not set')}
        </Text>
      </View>
      <View style={styles.routeDivider}>
        <View style={styles.dottedLine} />
        <Text style={styles.routeArrow}>{directionArrow}</Text>
        <View style={styles.dottedLine} />
      </View>
      <View style={styles.routeRow}>
        <IconSymbol
          name={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
          color={M3LoginColors.primary}
          size={18}
        />
        <Text style={styles.routeText} numberOfLines={1}>
          {request.dropoffAddress || t('Dropoff not set')}
        </Text>
      </View>

      <View style={styles.activeCardFooter}>
        <IconSymbol
          name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }}
          color={M3LoginColors.textTertiary}
          size={14}
        />
        <Text style={styles.scheduledText}>
          {formatDateTime(request.scheduledPickupAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function RecentRequestRow({
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
  const serviceKey = request.serviceKey ?? '';
  const icon = serviceIcons[serviceKey];

  return (
    <Pressable style={styles.recentRow} onPress={onPress}>
      <View style={styles.recentIconCircle}>
        {icon ? <IconSymbol name={icon} color={M3LoginColors.primary} size={22} /> : null}
      </View>
      <View style={styles.recentContent}>
        <Text style={styles.recentTitle}>
          {getServiceLabel(request.serviceKey, request.serviceName, t)}
        </Text>
        <Text style={styles.recentRoute} numberOfLines={1}>
          {request.pickupAddress || t('Pickup')} {directionArrow} {request.dropoffAddress || t('Dropoff')}
        </Text>
        <StatusPill statusLabel={request.statusLabel} />
      </View>
      <IconSymbol
        name={{
          ios: 'chevron.forward',
          android: 'chevron_right',
          web: 'chevron_right',
        }}
        color={M3LoginColors.textTertiary}
        size={18}
      />
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
  const [errorMessage, setErrorMessage] = useState('');

  const loadHome = useCallback(
    async (isRefresh: boolean): Promise<void> => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage('');

      try {
        const response = await getCustomerHome();
        setData(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : t('Unable to load home data.');
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
      router.push({ pathname: '/request-status', params: { requestId } });
    },
    [router],
  );

  const onNewRequest = useCallback((): void => {
    router.push('/choose-service');
  }, [router]);

  const onChooseServiceByKey = useCallback(
    (serviceKey: string): void => {
      router.push({ pathname: '/choose-service', params: { preselectedServiceKey: serviceKey } });
    },
    [router],
  );

  const onNotifications = useCallback((): void => {
    router.push('/notifications');
  }, [router]);

  const directionArrow = isRTL ? '←' : '→';
  const unreadCount = data?.notifications?.unreadCount ?? 0;

  const quickServices = useMemo(
    () => [
      { key: 'VEHICLE_TRANSPORT', label: t('Vehicle transport') },
      { key: 'MOTORCYCLE_TRANSPORT', label: t('Motorcycle transport') },
      { key: 'GOODS_TRANSPORT', label: t('Goods transport') },
      { key: 'FURNITURE_TRANSPORT', label: t('Furniture transport') },
    ],
    [t],
  );

  if (isLoading && !data) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={M3LoginColors.onPrimary} />
        <Text style={styles.loadingText}>{t('Loading home...')}</Text>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <View style={styles.errorIconCircle}>
          <IconSymbol
            name={{ ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' }}
            color={M3LoginColors.onPrimary}
            size={32}
          />
        </View>
        <Text style={styles.errorTitle}>{t('Unable to load home data.')}</Text>
        <Text style={styles.errorText}>{errorMessage}</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadHome(false)}>
          <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const customerName = data.customer.fullName?.trim() || t('there');
  const activeRequest = data.activeRequest;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={M3LoginColors.background} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(20, insets.top + 8) },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadHome(true)} />
        }
      >
        <View style={styles.topBar}>
          <View style={styles.welcomeBlock}>
            <Text style={styles.greeting}>{t('Hello, {{name}}', { name: customerName })}</Text>
            <Text style={styles.subGreeting}>{t('What would you like to transport today?')}</Text>
          </View>
          <Pressable style={styles.notificationButton} onPress={onNotifications}>
            <IconSymbol
              name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
              color={M3LoginColors.primary}
              size={22}
            />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <Pressable style={styles.ctaButton} onPress={onNewRequest}>
          <View style={styles.ctaIconCircle}>
            <IconSymbol
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              color={M3LoginColors.secondary}
              size={24}
            />
          </View>
          <View style={styles.ctaTextBlock}>
            <Text style={styles.ctaTitle}>{t('New Transport Request')}</Text>
            <Text style={styles.ctaSubtitle}>{t('Get quotes from drivers in minutes')}</Text>
          </View>
          <IconSymbol
            name={{
              ios: 'chevron.forward',
              android: 'chevron_right',
              web: 'chevron_right',
            }}
            color={M3LoginColors.primary}
            size={20}
          />
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Services')}</Text>
          <View style={styles.chipRow}>
            {quickServices.map((service) => (
              <QuickServiceChip
                key={service.key}
                serviceKey={service.key}
                label={service.label}
                onPress={() => onChooseServiceByKey(service.key)}
              />
            ))}
          </View>
        </View>

        {activeRequest ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Active Request')}</Text>
            <ActiveRequestCard
              request={activeRequest}
              directionArrow={directionArrow}
              onPress={() => onViewStatus(activeRequest.id)}
              t={t}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('Overview')}</Text>
          <View style={styles.statsGrid}>
            <StatCard
              value={formatNumber(data.counters.totalRequests)}
              label={t('Total')}
              icon={{ ios: 'doc.text.fill', android: 'description', web: 'description' }}
            />
            <StatCard
              value={formatNumber(data.counters.activeRequests)}
              label={t('Active')}
              icon={{ ios: 'bolt.fill', android: 'bolt', web: 'bolt' }}
            />
            <StatCard
              value={formatNumber(data.counters.completedRequests)}
              label={t('Completed')}
              icon={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }}
            />
            <StatCard
              value={formatNumber(data.counters.pendingQuotesRequests)}
              label={t('Pending Offers')}
              icon={{ ios: 'tag.fill', android: 'sell', web: 'sell' }}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('Recent Requests')}</Text>
            {data.recentRequests.length > 0 ? (
              <Pressable onPress={() => router.push('/requests')}>
                <Text style={styles.seeAllText}>{t('See all')}</Text>
              </Pressable>
            ) : null}
          </View>
          {data.recentRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <IconSymbol
                name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }}
                color={M3LoginColors.textTertiary}
                size={32}
              />
              <Text style={styles.emptyText}>
                {t('No requests yet. Start your first transport request.')}
              </Text>
              <Pressable style={styles.outlineButton} onPress={onNewRequest}>
                <Text style={styles.outlineButtonText}>{t('New Transport Request')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.recentList}>
              {data.recentRequests.map((request) => (
                <RecentRequestRow
                  key={request.id}
                  request={request}
                  directionArrow={directionArrow}
                  onPress={() => onViewStatus(request.id)}
                  t={t}
                />
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
    backgroundColor: M3LoginColors.background,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.background,
    padding: 24,
    gap: 12,
  },
  content: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 20,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  welcomeBlock: {
    flex: 1,
    gap: 4,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: M3LoginColors.textPrimary,
    letterSpacing: -0.5,
  },
  subGreeting: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
    lineHeight: 20,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: M3LoginColors.surface,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: M3LoginColors.background,
  },
  badgeText: {
    color: M3LoginColors.onPrimary,
    fontSize: 10,
    fontWeight: '700',
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  ctaIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: M3LoginColors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTextBlock: {
    flex: 1,
    gap: 2,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  ctaSubtitle: {
    fontSize: 13,
    color: M3LoginColors.textSecondary,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: M3LoginColors.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '48%',
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: M3LoginColors.surface,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: M3LoginColors.textPrimary,
  },
  activeCard: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  activeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: M3LoginColors.surfaceContainer,
  },
  serviceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: M3LoginColors.surfaceContainer,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    color: M3LoginColors.textSecondary,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  routeText: {
    flex: 1,
    fontSize: 14,
    color: M3LoginColors.textPrimary,
    fontWeight: '500',
  },
  routeDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 28,
  },
  dottedLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 0.5,
    borderColor: M3LoginColors.outlineVariant,
  },
  routeArrow: {
    fontSize: 14,
    color: M3LoginColors.textTertiary,
    fontWeight: '600',
  },
  activeCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: M3LoginColors.surfaceContainerHigh,
  },
  scheduledText: {
    fontSize: 12,
    color: M3LoginColors.textSecondary,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: M3LoginColors.surface,
    borderRadius: 16,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.primary,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: M3LoginColors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: M3LoginColors.textSecondary,
    fontWeight: '500',
  },
  recentList: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    overflow: 'hidden',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: M3LoginColors.surfaceContainerHigh,
  },
  recentIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: M3LoginColors.surfaceContainer,
  },
  recentContent: {
    flex: 1,
    gap: 4,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  recentRoute: {
    fontSize: 12,
    color: M3LoginColors.textSecondary,
  },
  emptyCard: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  emptyText: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
    textAlign: 'center',
  },
  outlineButton: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: M3LoginColors.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  outlineButtonText: {
    color: M3LoginColors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: M3LoginColors.primary,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 4,
  },
  primaryButtonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  loadingText: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: M3LoginColors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  errorText: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
    textAlign: 'center',
  },
});
