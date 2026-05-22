import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { getCustomerHome } from '@/lib/api';
import { clearAccessToken } from '@/lib/auth-token';
import type { CustomerHomeProfile } from '@/types/customer-request';

export default function ProfileTabScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerHomeProfile | null>(null);

  const loadProfile = useCallback(async (): Promise<void> => {
    try {
      const response = await getCustomerHome();
      setProfile(response.customer);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const onLogout = (): void => {
    clearAccessToken();
    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Profile</Text>
        <Text style={styles.value}>{profile?.fullName || 'Customer'}</Text>
        <Text style={styles.meta}>{profile?.email || 'No email'}</Text>
        <Text style={styles.meta}>{profile?.phone || 'No phone number'}</Text>

        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Edit Profile</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Settings</Text>
        </Pressable>
        <Pressable style={styles.dangerButton} onPress={onLogout}>
          <Text style={styles.dangerButtonText}>Logout</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 24, fontWeight: '700', color: '#0F172A' },
  value: { fontSize: 18, fontWeight: '600', color: '#0F172A' },
  meta: { fontSize: 14, color: '#64748B' },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: { color: '#0F172A', fontWeight: '600' },
  dangerButton: {
    minHeight: 42,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerButtonText: { color: '#FFFFFF', fontWeight: '700' },
});
