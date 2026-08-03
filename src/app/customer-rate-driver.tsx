import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  clientTheme,
  TrackingHero,
  TrackingInfoPill,
  TrackingMetaRow,
  TrackingProgress,
  TrackingScreenCard,
} from '@/components/tracking-ui';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { createDriverRating, getRequestTracking } from '@/lib/api';
import type { RequestTracking } from '@/types/customer-request';

type RouteParams = {
  tripId?: string;
};

const MAX_COMMENT_LENGTH = 500;
const STAR_VALUES = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;

function formatRating(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function getStarFill(rating: number, starNumber: number): number {
  if (rating >= starNumber) return 1;
  if (rating >= starNumber - 0.5) return 0.5;
  return 0;
}

function StarButton({
  fill,
  starNumber,
  onSelect,
}: {
  fill: number;
  starNumber: number;
  onSelect: (value: number) => void;
}) {
  return (
    <View style={styles.starTouchZone}>
      <View style={styles.starShell}>
        <Text style={styles.starEmpty}>★</Text>
        <View style={[styles.starFillMask, { width: `${fill * 100}%` }]}>
          <Text style={styles.starFilled}>★</Text>
        </View>
      </View>
      <View style={styles.starPressOverlay}>
        <Pressable
          style={styles.halfPress}
          onPress={() => onSelect(starNumber - 0.5)}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${formatRating(starNumber - 0.5)} stars`}
        />
        <Pressable
          style={styles.halfPress}
          onPress={() => onSelect(starNumber)}
          accessibilityRole="button"
          accessibilityLabel={`Rate ${starNumber} stars`}
        />
      </View>
    </View>
  );
}

export default function CustomerRateDriverScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const keyboardInset = useAndroidKeyboardInset();
  const tripId = typeof params.tripId === 'string' ? params.tripId.trim() : '';

  const [tracking, setTracking] = useState<RequestTracking | null>(null);
  const [selectedRating, setSelectedRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState(Boolean(tripId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!tripId) {
      return;
    }

    void (async () => {
      try {
        const response = await getRequestTracking(tripId);
        setTracking(response);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load trip rating details.');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [tripId]);

  const trimmedComment = useMemo(() => comment.trim(), [comment]);
  const commentLength = comment.length;
  const resolvedErrorMessage = !tripId ? 'Missing trip id.' : errorMessage;
  const canSubmit =
    Boolean(tripId) &&
    !isLoading &&
    !isSubmitting &&
    tracking?.ratingAvailable === true &&
    selectedRating >= 1 &&
    selectedRating <= 5 &&
    commentLength <= MAX_COMMENT_LENGTH;

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      await createDriverRating(tripId, {
        rating: selectedRating,
        comment: trimmedComment || undefined,
      });

      router.replace({
        pathname: '/request-status',
        params: { requestId: tripId },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit driver rating.');
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, router, selectedRating, trimmedComment, tripId]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            keyboardInset > 0 ? { paddingBottom: 24 + keyboardInset } : null,
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TrackingHero
            eyebrow={`Order #${tripId || 'N/A'}`}
            title="Rate your driver"
            description="Share a quick rating and optional feedback about the completed delivery."
          />

          <TrackingProgress currentStage={5} />

          <TrackingScreenCard>
            <TrackingInfoPill label="Delivery completed" tone="success" />
            <TrackingMetaRow label="Trip ID" value={tripId || 'N/A'} />
            {tracking?.driverName ? <TrackingMetaRow label="Driver" value={tracking.driverName} /> : null}
          </TrackingScreenCard>

          <TrackingScreenCard>
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={clientTheme.accentStrong} />
                <Text style={styles.bodyText}>Loading trip rating details...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Your rating</Text>
                <Text style={styles.ratingValue}>{formatRating(selectedRating)} / 5</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((starNumber) => (
                    <StarButton
                      key={starNumber}
                      starNumber={starNumber}
                      fill={getStarFill(selectedRating, starNumber)}
                      onSelect={setSelectedRating}
                    />
                  ))}
                </View>
                <View style={styles.quickPickRow}>
                  {STAR_VALUES.map((value) => (
                    <Pressable
                      key={value}
                      style={[
                        styles.quickPickChip,
                        selectedRating === value ? styles.quickPickChipActive : null,
                      ]}
                      onPress={() => setSelectedRating(value)}
                    >
                      <Text
                        style={[
                          styles.quickPickText,
                          selectedRating === value ? styles.quickPickTextActive : null,
                        ]}
                      >
                        {formatRating(value)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {tracking?.ratingAvailable === false ? (
                  <Text style={styles.bodyText}>
                    Rating is no longer available for this trip. It may already have been submitted.
                  </Text>
                ) : null}
              </>
            )}
          </TrackingScreenCard>

          <TrackingScreenCard>
            <Text style={styles.sectionTitle}>Feedback</Text>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Add feedback about the driver, optional"
              placeholderTextColor="#8A94A6"
              style={styles.input}
              multiline
              textAlignVertical="top"
              maxLength={MAX_COMMENT_LENGTH}
            />
            <Text style={styles.counterText}>
              {commentLength}/{MAX_COMMENT_LENGTH}
            </Text>
          </TrackingScreenCard>

          {resolvedErrorMessage ? <Text style={styles.errorText}>{resolvedErrorMessage}</Text> : null}

          <Pressable
            style={[styles.primaryButton, !canSubmit ? styles.primaryButtonDisabled : null]}
            onPress={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Submitting...' : 'Submit rating'}
            </Text>
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={() =>
              router.replace({
                pathname: '/request-status',
                params: { requestId: tripId },
              })
            }
          >
            <Text style={styles.secondaryButtonText}>Back to request status</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: clientTheme.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
    gap: 16,
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
  ratingValue: {
    fontSize: 34,
    fontWeight: '800',
    color: clientTheme.accentStrong,
    textAlign: 'center',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  starTouchZone: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starShell: {
    position: 'relative',
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starEmpty: {
    fontSize: 30,
    lineHeight: 34,
    color: '#D1D5DB',
    width: 34,
    textAlign: 'center',
  },
  starFillMask: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 34,
    overflow: 'hidden',
  },
  starFilled: {
    fontSize: 30,
    lineHeight: 34,
    color: clientTheme.accentStrong,
    width: 34,
    textAlign: 'center',
  },
  starPressOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
  },
  halfPress: {
    flex: 1,
  },
  quickPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  quickPickChip: {
    minWidth: 54,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: clientTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: clientTheme.surfaceMuted,
  },
  quickPickChipActive: {
    backgroundColor: clientTheme.accentSoft,
    borderColor: clientTheme.accent,
  },
  quickPickText: {
    color: clientTheme.textMuted,
    fontWeight: '700',
  },
  quickPickTextActive: {
    color: clientTheme.text,
  },
  input: {
    minHeight: 130,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: clientTheme.border,
    backgroundColor: clientTheme.surfaceMuted,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: clientTheme.text,
  },
  counterText: {
    textAlign: 'right',
    color: clientTheme.textMuted,
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: clientTheme.text,
    fontWeight: '800',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: clientTheme.border,
    backgroundColor: clientTheme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: clientTheme.text,
    fontWeight: '700',
  },
  errorText: {
    color: '#DC2626',
    textAlign: 'center',
  },
});
