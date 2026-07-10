import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getApiBaseUrl } from '@/config/backend';
import { M3LoginColors } from '@/constants/theme';
import { M3Styles } from '@/lib/m3-styles';
import { getRequestTracking } from '@/lib/api';
import type { RequestTracking } from '@/types/customer-request';

type RouteParams = {
  tripId?: string;
  deliveredAt?: string;
  deliveryNotes?: string;
  deliveryProofImageUrl?: string;
};

function resolveAssetUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?:|file:|content:|data:)/i.test(trimmed)) {
    return trimmed;
  }

  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export default function CustomerTripDeliveredScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();

  const tripId = typeof params.tripId === 'string' ? params.tripId : 'N/A';
  const deliveredAtParam = typeof params.deliveredAt === 'string' ? params.deliveredAt : null;
  const deliveryNotes = typeof params.deliveryNotes === 'string' ? params.deliveryNotes : '';
  const deliveryProofImageUrl =
    typeof params.deliveryProofImageUrl === 'string' ? params.deliveryProofImageUrl : '';

  const [tracking, setTracking] = useState<RequestTracking | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(tripId !== 'N/A');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState<string>('');

  useEffect(() => {
    if (tripId === 'N/A') {
      setIsLoading(false);
      return;
    }

    void (async () => {
      try {
        const response = await getRequestTracking(tripId);
        setTracking(response);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'Failed to load delivery details.',
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tripId]);

  const onRateDriver = useCallback((): void => {
    Alert.alert(
      'Rating is ready',
      'The driver can now be rated. We can connect this button to the final rating screen once that route is added.',
    );
  }, []);

  const deliveredAt = tracking?.deliveredAt ?? deliveredAtParam;
  const proofPhotos = tracking?.deliveryProofPhotos ?? [];
  const ratingAvailable = tracking?.ratingAvailable ?? false;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>Delivered</Text>
          <Text style={styles.subtitle}>Your delivery has been completed.</Text>
          <Text style={styles.meta}>Trip ID: {tripId}</Text>
          <Text style={styles.meta}>
            Delivered at: {deliveredAt ? new Date(deliveredAt).toLocaleString() : 'N/A'}
          </Text>
          {deliveryNotes ? <Text style={styles.meta}>Notes: {deliveryNotes}</Text> : null}
          {tracking?.nearDeliveryNotifiedAt ? (
            <Text style={styles.meta}>
              Near-delivery alert sent: {new Date(tracking.nearDeliveryNotifiedAt).toLocaleString()}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery Proof Photos</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={styles.meta}>Loading delivery proof…</Text>
            </View>
          ) : proofPhotos.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {proofPhotos.map((photo) => (
                <Pressable key={photo.id} onPress={() => setExpandedPhotoUrl(resolveAssetUrl(photo.url))}>
                  <Image
                    source={{ uri: resolveAssetUrl(photo.url) }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : deliveryProofImageUrl ? (
            <Pressable onPress={() => setExpandedPhotoUrl(resolveAssetUrl(deliveryProofImageUrl))}>
              <Image
                source={{ uri: resolveAssetUrl(deliveryProofImageUrl) }}
                style={styles.photoFallback}
                resizeMode="cover"
              />
            </Pressable>
          ) : (
            <Text style={styles.meta}>Delivery proof photos will appear here when available.</Text>
          )}
        </View>

        {ratingAvailable ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Rating Pending</Text>
            <Text style={styles.meta}>Final delivery is confirmed. You can now rate the driver.</Text>
            <Pressable style={styles.button} onPress={onRateDriver}>
              <Text style={styles.buttonText}>Rate driver</Text>
            </Pressable>
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={styles.secondaryButton}
          onPress={() =>
            router.replace(`/request-status?requestId=${encodeURIComponent(tripId)}`)
          }
        >
          <Text style={styles.secondaryButtonText}>Back to request status</Text>
        </Pressable>
        <Modal visible={Boolean(expandedPhotoUrl)} transparent animationType="fade" onRequestClose={() => setExpandedPhotoUrl('')}>
          <Pressable style={styles.modalBackdrop} onPress={() => setExpandedPhotoUrl('')}>
            {expandedPhotoUrl ? <Image source={{ uri: expandedPhotoUrl }} style={styles.expandedPhoto} resizeMode="contain" /> : null}
          </Pressable>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3LoginColors.background,
  },
  content: {
    padding: 20,
    gap: 12,
  },
  card: {
    backgroundColor: M3LoginColors.surface,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    color: M3LoginColors.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  meta: {
    color: M3LoginColors.textSecondary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoRow: {
    gap: 10,
  },
  photo: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: M3LoginColors.outlineVariant,
  },
  photoFallback: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: M3LoginColors.outlineVariant,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(28, 27, 31, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  expandedPhoto: {
    width: '100%',
    height: '100%',
  },
  button: {
    marginTop: 4,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: M3LoginColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: M3LoginColors.textPrimary,
    fontWeight: '600',
  },
  errorText: {
    color: M3LoginColors.error,
    textAlign: 'center',
  },
});
