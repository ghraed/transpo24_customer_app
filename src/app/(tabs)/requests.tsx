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
import { getCustomerRequests } from '@/lib/api';
import { isHistoryRequestStatus } from '@/lib/request-status';
import { useAppLanguage } from '@/localization/provider';
import type { CustomerHomeRequestSummary } from '@/types/customer-request';

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

function RequestCard({
  request,
  directionArrow,
  t,
}: {
  request: CustomerHomeRequestSummary;
  directionArrow: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const router = useRouter();
  const serviceKey = request.serviceKey ?? '';
  const icon = serviceIcons[serviceKey];

  return (
    <Pressable
      key={request.id}
      style={styles.card}
      onPress={() => router.push({ pathname: '/request-status', params: { requestId: request.id } })}
    >
      <View style={styles.cardHeader}>
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
          size={16}
        />
        <Text style={styles.routeText} numberOfLines={1}>
          {request.pickupAddress || t('Pickup not set')}
        </Text>
      </View>
      <View style={styles.routeConnector}>
        <View style={styles.routeLine} />
        <View style={styles.routeVehicleCircle}>
          <IconSymbol
            name={{ ios: 'arrow.down', android: 'south', web: 'arrow_downward' }}
            color={M3LoginColors.onPrimary}
            size={14}
          />
        </View>
        <View style={styles.routeLine} />
      </View>
      <View style={styles.routeRow}>
        <IconSymbol
          name={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
          color={M3LoginColors.primary}
          size={16}
        />
        <Text style={styles.routeText} numberOfLines={1}>
          {request.dropoffAddress || t('Dropoff not set')}
        </Text>
      </View>
    </Pressable>
  );
}

export default function RequestsTabScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const [requests, setRequests] = useState<CustomerHomeRequestSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadRequests = useCallback(
    async (isRefresh: boolean): Promise<void> => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setErrorMessage('');

      try {
        const response = await getCustomerRequests();
        setRequests(response);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : t('Loading requests...'));
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [t],
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadRequests(false);
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadRequests]);

  const activeRequests = requests.filter((request) => !isHistoryRequestStatus(request.status));
  const historyRequests = requests.filter((request) => isHistoryRequestStatus(request.status));
  const directionArrow = isRTL ? '←' : '→';

  const emptyState = useMemo(
    () => (
      <View style={styles.emptyCard}>
        <IconSymbol
          name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }}
          color={M3LoginColors.textTertiary}
          size={40}
        />
        <Text style={styles.emptyTitle}>{t('No requests yet')}</Text>
        <Text style={styles.emptyText}>{t('Your transport requests will appear here.')}</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.push('/choose-service')}>
          <Text style={styles.primaryButtonText}>{t('New Transport Request')}</Text>
        </Pressable>
      </View>
    ),
    [router, t],
  );

  if (isLoading && requests.length === 0) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color={M3LoginColors.onPrimary} />
        <Text style={styles.mutedText}>{t('Loading requests...')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={M3LoginColors.background} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(20, insets.top + 8) },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadRequests(true)} />
        }
      >
        <Text style={styles.title}>{t('My Requests')}</Text>

        {!!errorMessage ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIconCircle}>
              <IconSymbol
                name={{ ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' }}
                color={M3LoginColors.onPrimary}
                size={32}
              />
            </View>
            <Text style={styles.errorTitle}>{t('Unable to load requests')}</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <Pressable style={styles.primaryButton} onPress={() => void loadRequests(false)}>
              <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {requests.length === 0 ? (
          emptyState
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('Active Requests')}</Text>
              {activeRequests.length === 0 ? (
                <View style={styles.emptySectionCard}>
                  <Text style={styles.mutedText}>{t('No active requests right now.')}</Text>
                </View>
              ) : (
                activeRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    directionArrow={directionArrow}
                    t={t}
                  />
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('History Requests')}</Text>
              {historyRequests.length === 0 ? (
                <View style={styles.emptySectionCard}>
                  <Text style={styles.mutedText}>{t('No history requests yet.')}</Text>
                </View>
              ) : (
                historyRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    directionArrow={directionArrow}
                    t={t}
                  />
                ))
              )}
            </View>
          </>
        )}
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
    gap: 8,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: M3LoginColors.textPrimary,
    letterSpacing: -0.5,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  card: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    padding: 16,
    gap: 8,
  },
  cardHeader: {
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
  routeConnector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 26,
  },
  routeLine: {
    flex: 1,
    width: 2,
    backgroundColor: M3LoginColors.outlineVariant,
  },
  routeVehicleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySectionCard: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    padding: 16,
  },
  emptyCard: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  emptyText: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
    textAlign: 'center',
  },
  mutedText: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
  },
  errorCard: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
  },
  errorIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: M3LoginColors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
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
  primaryButton: {
    marginTop: 6,
    backgroundColor: M3LoginColors.primary,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
