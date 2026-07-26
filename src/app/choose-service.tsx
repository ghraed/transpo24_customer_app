import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getServices } from '@/lib/api';
import { useAppLanguage } from '@/localization/provider';
import type { Service } from '@/types/service';

const serviceIcons: Record<Service['key'], SymbolViewProps['name']> = {
  VEHICLE_TRANSPORT: { ios: 'car.fill', android: 'directions_car', web: 'directions_car' },
  MOTORCYCLE_TRANSPORT: { ios: 'bicycle', android: 'two_wheeler', web: 'two_wheeler' },
  GOODS_TRANSPORT: { ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' },
  FURNITURE_TRANSPORT: { ios: 'sofa.fill', android: 'chair', web: 'chair' },
};

type ServiceTheme = {
  backgroundColor: string;
  overlayColor: string;
  iconBadgeColor: string;
};

function getServiceCopy(
  service: Service,
  t: (key: string, options?: Record<string, unknown>) => string,
): { title: string; description: string } {
  switch (service.key) {
    case 'VEHICLE_TRANSPORT':
      return {
        title: t('Vehicle'),
        description: t('Cars, SUVs, vans and trucks.'),
      };
    case 'MOTORCYCLE_TRANSPORT':
      return {
        title: t('Motorcycle'),
        description: t('Bikes, scooters and motorbikes.'),
      };
    case 'GOODS_TRANSPORT':
      return {
        title: t('Goods'),
        description: t('Parcels, cargo and business goods.'),
      };
    case 'FURNITURE_TRANSPORT':
      return {
        title: t('Furniture'),
        description: t('Home, office and bulky items.'),
      };
    default:
      return {
        title: service.nameEn,
        description: service.descriptionEn,
      };
  }
}

function getServiceTheme(key: Service['key']): ServiceTheme {
  switch (key) {
    case 'VEHICLE_TRANSPORT':
      return {
        backgroundColor: '#F4BD3C',
        overlayColor: '#FFD86F',
        iconBadgeColor: 'rgba(255,255,255,0.18)',
      };
    case 'MOTORCYCLE_TRANSPORT':
      return {
        backgroundColor: '#0F69D8',
        overlayColor: '#3C8EF3',
        iconBadgeColor: 'rgba(255,255,255,0.16)',
      };
    case 'GOODS_TRANSPORT':
      return {
        backgroundColor: '#11B85E',
        overlayColor: '#46D889',
        iconBadgeColor: 'rgba(255,255,255,0.16)',
      };
    case 'FURNITURE_TRANSPORT':
      return {
        backgroundColor: '#F08948',
        overlayColor: '#FFB17E',
        iconBadgeColor: 'rgba(255,255,255,0.16)',
      };
    default:
      return {
        backgroundColor: '#111827',
        overlayColor: '#364152',
        iconBadgeColor: 'rgba(255,255,255,0.14)',
      };
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

export default function ChooseServiceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isRTL } = useAppLanguage();
  const insets = useSafeAreaInsets();
  const { preselectedServiceKey } = useLocalSearchParams<{ preselectedServiceKey?: string }>();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadServices = useCallback(async () => {
    setError('');
    setIsLoading(true);

    try {
      const list = await getServices();
      setServices(list);

      if (list.length === 0) {
        setSelectedService(null);
      } else if (preselectedServiceKey) {
        const preselected = list.find((service) => service.key === preselectedServiceKey) ?? null;
        setSelectedService(preselected ?? list[0] ?? null);
      } else {
        setSelectedService((previous) =>
          previous ? list.find((service) => service.id === previous.id) ?? list[0] ?? null : null,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Couldn't load services"));
    } finally {
      setIsLoading(false);
    }
  }, [preselectedServiceKey, t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadServices();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadServices]);

  const canContinue = useMemo(() => selectedService !== null, [selectedService]);

  const onContinue = useCallback(() => {
    if (!selectedService) {
      return;
    }

    const isVehicleService = selectedService.key === 'VEHICLE_TRANSPORT';
    const isMotorcycleService = selectedService.key === 'MOTORCYCLE_TRANSPORT';
    const isGoodsService = selectedService.key === 'GOODS_TRANSPORT';
    const isFurnitureService = selectedService.key === 'FURNITURE_TRANSPORT';

    router.push({
      pathname: isVehicleService
        ? '/vehicle-details'
        : isMotorcycleService
          ? '/motorcycle-details'
          : isGoodsService
            ? '/goods-details'
            : isFurnitureService
              ? '/furniture-details'
              : '/pickup-location',
      params: { serviceId: selectedService.id, serviceKey: selectedService.key },
    });
  }, [router, selectedService]);

  const onBack = useCallback(() => {
    router.back();
  }, [router]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.supportingText}>{t('Loading services...')}</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t("Couldn't load services")}</Text>
        <Text style={styles.supportingText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadServices()}>
          <Text style={styles.retryText}>{t('Retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (services.length === 0) {
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.errorTitle}>{t('No services available')}</Text>
        <Text style={styles.supportingText}>{t('Please try again in a moment.')}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadServices()}>
          <Text style={styles.retryText}>{t('Refresh')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />

      <View
        style={[
          styles.screenContent,
          {
            paddingTop: Math.max(10, insets.top + 4),
            paddingBottom: Math.max(18, insets.bottom + 14),
          },
        ]}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.topBarButton} onPress={onBack}>
            <IconSymbol
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
              color="#111827"
              size={24}
            />
          </Pressable>
          <View style={styles.topBarTitleWrap}>
            <Text style={styles.topBarTitle}>{t('Choose Service')}</Text>
          </View>
          <View style={styles.topBarButton} />
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.heroTitle}>{t('What do you need to transport?')}</Text>
          <Text style={styles.heroSubtitle}>
            {t('Pick the transport type that best matches your order.')}
          </Text>
        </View>

        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = selectedService?.id === item.id;
            const serviceCopy = getServiceCopy(item, t);
            const theme = getServiceTheme(item.key);
            const serviceIcon = serviceIcons[item.key];

            return (
              <Pressable
                style={[
                  styles.serviceCard,
                  { backgroundColor: theme.backgroundColor },
                  isSelected ? styles.serviceCardSelected : null,
                ]}
                onPress={() => setSelectedService(item)}
              >
                <View style={[styles.serviceGlow, { backgroundColor: theme.overlayColor, top: -30, right: -4 }]} />
                <View
                  style={[
                    styles.serviceGlow,
                    {
                      backgroundColor: theme.overlayColor,
                      left: -18,
                      bottom: -42,
                      opacity: 0.38,
                    },
                  ]}
                />

                <View style={styles.serviceHeader}>
                  <View style={[styles.serviceIconBadge, { backgroundColor: theme.iconBadgeColor }]}>
                    {serviceIcon ? <IconSymbol name={serviceIcon} color="#FFFFFF" size={26} /> : null}
                  </View>
                  {isSelected ? (
                    <View style={styles.selectedBadge}>
                      <IconSymbol
                        name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                        color="#111827"
                        size={18}
                      />
                    </View>
                  ) : null}
                </View>

                <Text style={styles.serviceTitle}>{serviceCopy.title}</Text>
                <Text style={styles.serviceDescription}>{serviceCopy.description}</Text>
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          onPress={onContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueText}>{t('Continue')}</Text>
          <IconSymbol
            name={{
              ios: isRTL ? 'arrow.left' : 'arrow.right',
              android: isRTL ? 'west' : 'east',
              web: isRTL ? 'west' : 'east',
            }}
            color="#FFFFFF"
            size={18}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 18,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  heroBlock: {
    gap: 8,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '800',
    color: '#111827',
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#68768A',
  },
  listContent: {
    gap: 12,
    paddingBottom: 12,
  },
  serviceCard: {
    minHeight: 150,
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
  },
  serviceCardSelected: {
    transform: [{ scale: 0.99 }],
  },
  serviceGlow: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 999,
    opacity: 0.58,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  serviceIconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  serviceDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.9)',
  },
  continueButton: {
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
  },
  continueButtonDisabled: {
    opacity: 0.45,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#FAFAFA',
    gap: 10,
  },
  supportingText: {
    color: '#68768A',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: '#111827',
    borderRadius: 14,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
