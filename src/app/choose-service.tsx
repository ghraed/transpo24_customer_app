import { M3LoginColors } from '@/constants/theme';
import { getServices } from '@/lib/api';
import type { Service } from '@/types/service';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
const serviceIcons: Record<Service['key'], string> = { VEHICLE_TRANSPORT: '🚗', MOTORCYCLE_TRANSPORT: '🏍️', GOODS_TRANSPORT: '📦', FURNITURE_TRANSPORT: '🚚' };
export default function ChooseServiceScreen() {
  const router = useRouter();
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const loadServices = useCallback(async () => {
    setError(''); setIsLoading(true);
    try { const list = await getServices(); setServices(list); if (list.length === 0) setSelectedService(null); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load services.'); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadServices();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadServices]);
  const canContinue = useMemo(() => selectedService !== null, [selectedService]);
  const onContinue = useCallback(() => {
    if (!selectedService) return;
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
  if (isLoading) return <View style={styles.centerContainer}><ActivityIndicator size="large" color="#1a73e8" /><Text style={styles.stateText}>Loading services...</Text></View>;
  if (error) return <View style={styles.centerContainer}><Text style={styles.errorTitle}>Couldn&apos;t load services</Text><Text style={styles.stateText}>{error}</Text><Pressable style={styles.retryButton} onPress={() => void loadServices()}><Text style={styles.retryText}>Retry</Text></Pressable></View>;
  if (services.length === 0) return <View style={styles.centerContainer}><Text style={styles.errorTitle}>No services available</Text><Text style={styles.stateText}>Please try again in a moment.</Text><Pressable style={styles.retryButton} onPress={() => void loadServices()}><Text style={styles.retryText}>Refresh</Text></Pressable></View>;
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Choose Service</Text>
        <Text style={styles.subtitle}>What do you want to transport?</Text>
      </View>
      <FlatList data={services} keyExtractor={(item) => item.id} contentContainerStyle={styles.listContent} renderItem={({ item }) => {
        const isSelected = selectedService?.id === item.id;
        return <Pressable style={[styles.card, isSelected && styles.cardSelected]} onPress={() => setSelectedService(item)}><View style={styles.cardTop}><Text style={styles.icon}>{serviceIcons[item.key] ?? '📦'}</Text><Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>{item.nameEn}</Text></View><Text style={isSelected && styles.cardTitleSelected}>{item.descriptionEn}</Text></Pressable>;
      }} />
      <Pressable style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]} onPress={onContinue} disabled={!canContinue}><Text style={styles.continueText}>Continue</Text></Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: M3LoginColors.background, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  header: { marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: M3LoginColors.textPrimary },
  subtitle: { fontSize: 15, color: M3LoginColors.textSecondary, marginTop: 4 },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    backgroundColor: M3LoginColors.surface,
  },
  backButtonText: { color: M3LoginColors.textPrimary, fontWeight: '600', fontSize: 14 },
  listContent: { paddingBottom: 16, gap: 10 },
  card: {
    backgroundColor: M3LoginColors.surface,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardSelected: {
    borderColor: M3LoginColors.primary,
    backgroundColor: M3LoginColors.primaryContainer,
    shadowColor: M3LoginColors.primary,
    shadowOpacity: 0.15,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 },
  icon: { fontSize: 28 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: M3LoginColors.textPrimary },
  cardTitleSelected: { color: M3LoginColors.onPrimary },
  cardDescription: { fontSize: 14, color: M3LoginColors.textSecondary, lineHeight: 20 },
  continueButton: {
    marginTop: 'auto',
    height: 52,
    borderRadius: 16,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  continueButtonDisabled: { opacity: 0.5 },
  continueText: { color: M3LoginColors.onPrimary, fontSize: 16, fontWeight: '700' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: M3LoginColors.background },
  stateText: { marginTop: 10, color: M3LoginColors.textSecondary, textAlign: 'center', fontSize: 14 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: M3LoginColors.textPrimary, marginBottom: 2 },
  retryButton: { marginTop: 16, backgroundColor: M3LoginColors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: M3LoginColors.onPrimary, fontWeight: '600' },
});
