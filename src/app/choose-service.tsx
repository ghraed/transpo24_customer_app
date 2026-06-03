import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { getServices } from '@/lib/api';
import type { Service } from '@/types/service';
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
    router.push({
      pathname: isVehicleService
        ? '/vehicle-details'
        : isMotorcycleService
          ? '/motorcycle-details'
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
        return <Pressable style={[styles.card, isSelected && styles.cardSelected]} onPress={() => setSelectedService(item)}><View style={styles.cardTop}><Text style={styles.icon}>{serviceIcons[item.key] ?? '📦'}</Text><Text style={[styles.cardTitle, isSelected && styles.cardTitleSelected]}>{item.nameEn}</Text></View><Text style={styles.cardDescription}>{item.descriptionEn}</Text></Pressable>;
      }} />
      <Pressable style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]} onPress={onContinue} disabled={!canContinue}><Text style={styles.continueText}>Continue</Text></Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f9fc', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 },
  header: { marginBottom: 12 }, title: { fontSize: 28, fontWeight: '700', color: '#101828' }, subtitle: { fontSize: 15, color: '#475467', marginTop: 4 },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    backgroundColor: '#ffffff',
  },
  backButtonText: { color: '#334155', fontWeight: '600', fontSize: 13 },
  listContent: { paddingBottom: 16, gap: 10 },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, padding: 14 }, cardSelected: { borderColor: '#1a73e8', backgroundColor: '#eef5ff' },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 10 }, icon: { fontSize: 24 }, cardTitle: { fontSize: 17, fontWeight: '700', color: '#111827' }, cardTitleSelected: { color: '#0b57d0' }, cardDescription: { fontSize: 14, color: '#4b5563', lineHeight: 20 },
  continueButton: { marginTop: 'auto', height: 50, borderRadius: 12, backgroundColor: '#1a73e8', alignItems: 'center', justifyContent: 'center' }, continueButtonDisabled: { opacity: 0.45 }, continueText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#f7f9fc' }, stateText: { marginTop: 10, color: '#475467', textAlign: 'center', fontSize: 14 }, errorTitle: { fontSize: 20, fontWeight: '700', color: '#101828', marginBottom: 2 }, retryButton: { marginTop: 16, backgroundColor: '#1a73e8', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 }, retryText: { color: '#fff', fontWeight: '600' },
});
