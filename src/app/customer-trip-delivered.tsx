import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  clientTheme,
  TrackingHero,
  TrackingInfoPill,
  TrackingMetaRow,
  TrackingProgress,
  TrackingScreenCard,
  TrackingScrollable,
} from '@/components/tracking-ui';
import { getRequestTracking } from '@/lib/api';
import type { RequestTracking } from '@/types/customer-request';
import appI18n from '@/localization/i18n';

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
  return appI18n.t("{{value0}}{{value1}}{{value2}}", { value0: baseUrl, value1: trimmed.startsWith('/') ? '' : '/', value2: trimmed });
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
  const [errorMessage, setErrorMessage] = useState('');
  const [expandedPhotoUrl, setExpandedPhotoUrl] = useState('');

  useEffect(() => {
    if (tripId === 'N/A') {
      return;
    }

    void (async () => {
      try {
        const response = await getRequestTracking(tripId);
        setTracking(response);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : appI18n.t("Failed to load delivery details."),
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tripId]);

  const onRateDriver = useCallback((): void => {
    router.push((`/customer-rate-driver?tripId=${encodeURIComponent(tripId)}`) as Href);
  }, [router, tripId]);

  const deliveredAt = tracking?.deliveredAt ?? deliveredAtParam;
  const proofPhotos = tracking?.deliveryProofPhotos ?? [];
  const ratingAvailable = tracking?.ratingAvailable ?? false;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TrackingScrollable>
        <TrackingHero
          eyebrow={`Order #${tripId}`}
          title={appI18n.t("Delivery completed")}
          description="Your request has been delivered. Delivery proof and final details are shown below."
        />

        <TrackingProgress currentStage={5} />

        <TrackingScreenCard>
          <TrackingInfoPill label={appI18n.t("Delivered")} tone="success" />
          <TrackingMetaRow label={appI18n.t("Trip ID")} value={tripId} />
          <TrackingMetaRow
            label={appI18n.t("Delivered at")}
            value={deliveredAt ? new Date(deliveredAt).toLocaleString(undefined, { hour12: false }) : 'N/A'}
          />
          {deliveryNotes ? <TrackingMetaRow label={appI18n.t("Delivery notes")} value={deliveryNotes} /> : null}
          {tracking?.nearDeliveryNotifiedAt ? (
            <TrackingMetaRow
              label={appI18n.t("Near-delivery alert")}
              value={new Date(tracking.nearDeliveryNotifiedAt).toLocaleString(undefined, { hour12: false })}
            />
          ) : null}
        </TrackingScreenCard>

        <TrackingScreenCard>
          <Text style={styles.sectionTitle}>{appI18n.t("Delivery proof")}</Text>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={clientTheme.accentStrong} />
              <Text style={styles.bodyText}>{appI18n.t("Loading delivery proof...")}</Text>
            </View>
          ) : proofPhotos.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
            >
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
            <Text style={styles.bodyText}>{appI18n.t("Delivery proof photos will appear here when available.")}</Text>
          )}
        </TrackingScreenCard>

        {ratingAvailable ? (
          <TrackingScreenCard>
            <Text style={styles.sectionTitle}>{appI18n.t("Next step")}</Text>
            <Text style={styles.bodyText}>
              {appI18n.t("Final delivery is confirmed. You can now rate the driver.")}</Text>
            <Pressable style={styles.primaryButton} onPress={onRateDriver}>
              <Text style={styles.primaryButtonText}>{appI18n.t("Rate driver")}</Text>
            </Pressable>
          </TrackingScreenCard>
        ) : null}

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.replace(`/request-status?requestId=${encodeURIComponent(tripId)}`)}
        >
          <Text style={styles.secondaryButtonText}>{appI18n.t("Back to request status")}</Text>
        </Pressable>

        <Modal
          visible={Boolean(expandedPhotoUrl)}
          transparent
          animationType="fade"
          onRequestClose={() => setExpandedPhotoUrl('')}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setExpandedPhotoUrl('')}>
            {expandedPhotoUrl ? (
              <Image source={{ uri: expandedPhotoUrl }} style={styles.expandedPhoto} resizeMode="contain" />
            ) : null}
          </Pressable>
        </Modal>
      </TrackingScrollable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clientTheme.background,
  },
  sectionTitle: {
    color: clientTheme.text,
    fontSize: 18,
    fontWeight: '800',
  },
  bodyText: {
    color: clientTheme.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoRow: {
    gap: 12,
  },
  photo: {
    width: 156,
    height: 156,
    borderRadius: 20,
    backgroundColor: '#E5E8EF',
  },
  photoFallback: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    backgroundColor: '#E5E8EF',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: clientTheme.text,
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: clientTheme.text,
    fontSize: 15,
    fontWeight: '800',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  expandedPhoto: {
    width: '100%',
    height: '100%',
  },
});
