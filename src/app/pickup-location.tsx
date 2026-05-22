import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

type VehicleDetailsPayload = {
  vehicleVin?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleSeries?: string;
  vehicleVariant?: string;
  vehicleManufactureYear?: number;
  vehicleEstimatedWeightKg?: number;
  vehicleBodyType?: string;
  vehicleDataSource?: 'VIN_API' | 'MANUAL';
};

export default function PickupLocationScreen() {
  const params = useLocalSearchParams<{
    serviceId?: string;
    serviceKey?: string;
    vehicleDetails?: string;
  }>();

  const vehicleDetails = useMemo(() => {
    if (!params.vehicleDetails || typeof params.vehicleDetails !== 'string') return null;
    try {
      return JSON.parse(params.vehicleDetails) as VehicleDetailsPayload;
    } catch {
      return null;
    }
  }, [params.vehicleDetails]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pickup Location</Text>
      <Text style={styles.subtitle}>Selected service key: {params.serviceKey ?? 'N/A'}</Text>
      <Text style={styles.subtitle}>Selected service id: {params.serviceId ?? 'N/A'}</Text>
      {vehicleDetails ? (
        <View style={styles.vehicleBox}>
          <Text style={styles.vehicleTitle}>Vehicle details saved</Text>
          <Text style={styles.subtitle}>Brand: {vehicleDetails.vehicleBrand ?? 'N/A'}</Text>
          <Text style={styles.subtitle}>Model: {vehicleDetails.vehicleModel ?? 'N/A'}</Text>
          <Text style={styles.subtitle}>Year: {vehicleDetails.vehicleManufactureYear ?? 'N/A'}</Text>
          <Text style={styles.subtitle}>Weight (kg): {vehicleDetails.vehicleEstimatedWeightKg ?? 'N/A'}</Text>
          <Text style={styles.subtitle}>Source: {vehicleDetails.vehicleDataSource ?? 'N/A'}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    padding: 24,
  },
  title: { fontSize: 28, fontWeight: '700', color: '#111111', marginBottom: 10 },
  subtitle: { fontSize: 14, color: '#444444', marginBottom: 6 },
  vehicleBox: {
    marginTop: 18,
    width: '100%',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#f7f9fc',
  },
  vehicleTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 8 },
});
