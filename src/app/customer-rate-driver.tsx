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

import { M3LoginColors } from '@/constants/theme';
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

type StarButtonProps = {
  fill: number;
  starNumber: number;
  onSelect: (value: number) => void;
};

function StarButton({ fill, starNumber, onSelect }: StarButtonProps) {
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
  const [selectedRating, setSelectedRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(tripId));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!tripId) {
      setErrorMessage('Missing trip id.');
      setIsLoading(false);
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
  const canSubmit =
    Boolean(tripId) &&
    !isLoading &&
    !isSubmitting &&
    tracking?.ratingAvailable === true &&
    selectedRating >= 1 &&
    selectedRating <= 5 &&
    commentLength <= MAX_COMMENT_LENGTH;

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!canSubmit) {
      return;
    }

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

  const handleBack = useCallback((): void => {
    router.replace({
      pathname: '/request-status',
      params: { requestId: tripId },
    });
  }, [router, tripId]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            keyboardInset > 0 ? { paddingBottom: 20 + keyboardInset } : undefined,
          ]}
          keyboardShouldPersistTaps="handled"
        >
        <View style={styles.card}>
          <Text style={styles.title}>Rate Driver</Text>
          <Text style={styles.subtitle}>
            Choose a star rating, including half-star steps, and add a note if you want.
          </Text>
          <Text style={styles.meta}>Trip ID: {tripId || 'N/A'}</Text>
          {tracking?.driverName ? <Text style={styles.meta}>Driver: {tracking.driverName}</Text> : null}
        </View>

        <View style={styles.card}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={M3LoginColors.primary} />
              <Text style={styles.meta}>Loading trip rating details…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Your Rating</Text>
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
                <Text style={styles.infoText}>
                  Rating is no longer available for this trip. It may already have been submitted.
                </Text>
              ) : null}
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Feedback or Note</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Add feedback about the driver, optional"
            placeholderTextColor={M3LoginColors.textSecondary}
            style={styles.input}
            multiline
            textAlignVertical="top"
            maxLength={MAX_COMMENT_LENGTH}
          />
          <Text style={styles.counterText}>{commentLength}/{MAX_COMMENT_LENGTH}</Text>
        </View>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.primaryButton, !canSubmit ? styles.primaryButtonDisabled : null]}
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
        >
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Submitting...' : 'Submit rating'}
          </Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={handleBack}>
          <Text style={styles.secondaryButtonText}>Back to request status</Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
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
    gap: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    color: M3LoginColors.textSecondary,
    lineHeight: 20,
  },
  meta: {
    color: M3LoginColors.textSecondary,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  ratingValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#D97706',
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
    color: '#F59E0B',
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
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: M3LoginColors.surface,
  },
  quickPickChipActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  quickPickText: {
    color: M3LoginColors.textSecondary,
    fontWeight: '600',
  },
  quickPickTextActive: {
    color: '#B45309',
  },
  input: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    backgroundColor: M3LoginColors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: M3LoginColors.textPrimary,
  },
  counterText: {
    textAlign: 'right',
    color: M3LoginColors.textSecondary,
    fontSize: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    color: M3LoginColors.textSecondary,
    lineHeight: 20,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: M3LoginColors.onPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
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
