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

import { getCustomerRequests } from '@/lib/api';
import { formatDateOnly } from '@/localization/format';
import { useAppLanguage } from '@/localization/provider';
import type { CustomerHomeRequestSummary, CustomerRequestStatus } from '@/types/customer-request';

const serviceIcons: Record<string, SymbolViewProps['name']> = {
  VEHICLE_TRANSPORT: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  MOTORCYCLE_TRANSPORT: { ios: 'bicycle', android: 'two_wheeler', web: 'two_wheeler' },
  GOODS_TRANSPORT: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
  FURNITURE_TRANSPORT: { ios: 'sofa.fill', android: 'chair', web: 'chair' },
};

type RequestFilter = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

const completedStatuses: CustomerRequestStatus[] = ['DELIVERED', 'COMPLETED'];
const cancelledStatuses: CustomerRequestStatus[] = ['CANCELLED'];

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

function getStatusTone(status: CustomerRequestStatus): { backgroundColor: string; textColor: string } {
  if (cancelledStatuses.includes(status)) {
    return {
      backgroundColor: '#FDE8E7',
      textColor: '#C0392B',
    };
  }

  if (completedStatuses.includes(status)) {
    return {
      backgroundColor: '#E9F9EE',
      textColor: '#1E9E4A',
    };
  }

  return {
    backgroundColor: '#FFF3D6',
    textColor: '#D89A1A',
  };
}

function getStatusLabel(
  request: CustomerHomeRequestSummary,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const key = `request_status.${request.status}`;
  const translated = t(key);

  return translated === key ? request.statusLabel : translated;
}

function compactAddress(address: string | null | undefined, fallback: string): string {
  if (!address?.trim()) {
    return fallback;
  }

  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`;
  }

  return parts[0] ?? fallback;
}

function getReference(requestId: string): string {
  const compactId = requestId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `TRP-${compactId || requestId}`;
}

function getRequestDate(request: CustomerHomeRequestSummary, t: (key: string) => string): string {
  const value = request.submittedAt ?? request.createdAt ?? request.scheduledPickupAt;
  return value ? formatDateOnly(value) : t('Date pending');
}

function getFooterStatusCopy(
  request: CustomerHomeRequestSummary,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (cancelledStatuses.includes(request.status)) {
    return t('Request cancelled');
  }

  if (completedStatuses.includes(request.status)) {
    return t('Transport completed');
  }

  return getStatusLabel(request, t);
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

function FilterChip({
  title,
  active,
  onPress,
}: {
  title: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.filterChip, active ? styles.filterChipActive : null]} onPress={onPress}>
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{title}</Text>
    </Pressable>
  );
}

function OrderCard({
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
  const icon = serviceIcons[request.serviceKey ?? ''];
  const tone = getStatusTone(request.status);
  const pickup = compactAddress(request.pickupAddress, t('Pickup'));
  const dropoff = compactAddress(request.dropoffAddress, t('Dropoff'));

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardIdentity}>
          <View style={styles.cardIcon}>
            {icon ? <IconSymbol name={icon} color="#111827" size={18} /> : null}
          </View>
          <View style={styles.cardIdentityText}>
            <Text style={styles.cardTitle}>{getServiceLabel(request.serviceKey, request.serviceName, t)}</Text>
            <Text style={styles.cardReference}>{getReference(request.id)}</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: tone.backgroundColor }]}>
          <Text style={[styles.statusBadgeText, { color: tone.textColor }]} numberOfLines={2}>
            {getStatusLabel(request, t)}
          </Text>
        </View>
      </View>

      <Text style={styles.cardRoute} numberOfLines={2}>
        {pickup} {directionArrow} {dropoff}
      </Text>

      <View style={styles.cardDivider} />

      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterLeft}>{getFooterStatusCopy(request, t)}</Text>
        <Text style={styles.cardFooterRight}>{getRequestDate(request, t)}</Text>
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
  const [activeFilter, setActiveFilter] = useState<RequestFilter>('ACTIVE');

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

  const directionArrow = isRTL ? '←' : '→';

  const filteredRequests = useMemo(() => {
    switch (activeFilter) {
      case 'COMPLETED':
        return requests.filter((request) => completedStatuses.includes(request.status));
      case 'CANCELLED':
        return requests.filter((request) => cancelledStatuses.includes(request.status));
      case 'ACTIVE':
      default:
        return requests.filter(
          (request) =>
            !completedStatuses.includes(request.status) && !cancelledStatuses.includes(request.status),
        );
    }
  }, [activeFilter, requests]);

  if (isLoading && requests.length === 0) {
    return (
      <SafeAreaView style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.supportingText}>{t('Loading requests...')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(12, insets.top + 4),
            paddingBottom: Math.max(28, insets.bottom + 18),
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void loadRequests(true)} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('My Orders')}</Text>

        <View style={styles.filtersRow}>
          <FilterChip title={t('Active')} active={activeFilter === 'ACTIVE'} onPress={() => setActiveFilter('ACTIVE')} />
          <FilterChip
            title={t('Completed')}
            active={activeFilter === 'COMPLETED'}
            onPress={() => setActiveFilter('COMPLETED')}
          />
          <FilterChip
            title={t('Cancelled')}
            active={activeFilter === 'CANCELLED'}
            onPress={() => setActiveFilter('CANCELLED')}
          />
        </View>

        {!!errorMessage ? (
          <View style={styles.errorCard}>
            <View style={styles.errorIconCircle}>
              <IconSymbol
                name={{ ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' }}
                color="#111827"
                size={28}
              />
            </View>
            <Text style={styles.errorTitle}>{t('Unable to load requests')}</Text>
            <Text style={styles.supportingText}>{errorMessage}</Text>
            <Pressable style={styles.primaryButton} onPress={() => void loadRequests(false)}>
              <Text style={styles.primaryButtonText}>{t('Retry')}</Text>
            </Pressable>
          </View>
        ) : null}

        {!errorMessage && filteredRequests.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {activeFilter === 'ACTIVE'
                ? t('No active orders')
                : activeFilter === 'COMPLETED'
                  ? t('No completed orders')
                  : t('No cancelled orders')}
            </Text>
            <Text style={styles.supportingText}>
              {activeFilter === 'ACTIVE'
                ? t('Your current transport requests will appear here.')
                : t('Orders in this section will appear here.')}
            </Text>
            {activeFilter === 'ACTIVE' ? (
              <Pressable style={styles.primaryButton} onPress={() => router.push('/choose-service')}>
                <Text style={styles.primaryButtonText}>{t('New request')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {!errorMessage && filteredRequests.length > 0 ? (
          <View style={styles.list}>
            {filteredRequests.map((request) => (
              <OrderCard
                key={request.id}
                request={request}
                directionArrow={directionArrow}
                onPress={() => router.push({ pathname: '/request-status', params: { requestId: request.id } })}
                t={t}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
    padding: 24,
    gap: 10,
  },
  content: {
    paddingHorizontal: 20,
    gap: 14,
  },
  title: {
    fontSize: 18,
    lineHeight: 28,
    fontWeight: '800',
    color: '#111827',
  },
  filtersRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterChip: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9DFE8',
  },
  filterChipActive: {
    backgroundColor: '#FFC548',
    borderColor: '#FFC548',
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  filterChipTextActive: {
    fontWeight: '700',
  },
  list: {
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#111827',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIdentityText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  cardReference: {
    fontSize: 12,
    fontWeight: '600',
    color: '#76869B',
  },
  statusBadge: {
    maxWidth: 92,
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardRoute: {
    fontSize: 14,
    lineHeight: 22,
    color: '#627287',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#E9EDF3',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardFooterLeft: {
    flex: 1,
    fontSize: 13,
    color: '#A0ACBC',
  },
  cardFooterRight: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    alignItems: 'center',
    gap: 10,
  },
  errorIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#FFF3D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  supportingText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#627287',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 4,
    backgroundColor: '#111827',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
