import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { M3LoginColors } from '@/constants/theme';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import { M3Styles } from '@/lib/m3-styles';
import type { VehicleConditionFormValues, VehicleConditionOption } from '@/types/vehicle-condition';

type RouteParams = {
  serviceId?: string;
  serviceKey?: string;
  vehicleDetails?: string;
  pendingRequestDetails?: string;
  pendingPhotoAssets?: string;
};

const MAX_NOTES_LENGTH = 500;

const VEHICLE_CONDITION_OPTIONS: VehicleConditionOption[] = [
  { value: 'RUNNING', label: 'Running vehicle', description: 'Can be driven' },
  { value: 'NEEDS_JUMP_START', label: 'Needs jump-start', description: 'Battery is dead' },
  { value: 'NEEDS_WINCH', label: 'Needs winch', description: 'Cannot be towed normally' },
  { value: 'NEEDS_CRANE', label: 'Needs crane', description: 'Special case or accident' },
  { value: 'MISSING_WHEELS', label: 'Missing wheels', description: 'Tires are missing or damaged' },
];

export default function VehicleConditionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<RouteParams>();
  const serviceId = typeof params.serviceId === 'string' ? params.serviceId : '';
  const serviceKey = typeof params.serviceKey === 'string' ? params.serviceKey : '';
  const vehicleDetails = typeof params.vehicleDetails === 'string' ? params.vehicleDetails : '';
  const pendingRequestDetails =
    typeof params.pendingRequestDetails === 'string' ? params.pendingRequestDetails : '';
  const pendingPhotoAssets = typeof params.pendingPhotoAssets === 'string' ? params.pendingPhotoAssets : '';
  const keyboardInset = useAndroidKeyboardInset();

  const [form, setForm] = useState<VehicleConditionFormValues>({
    condition: null,
    notes: '',
  });
  const [errorMessage, setErrorMessage] = useState<string>('');

  const trimmedNotes = useMemo(() => form.notes?.trim() ?? '', [form.notes]);

  const validationError = useMemo(() => {
    if (!form.condition) return 'Please select the vehicle condition.';
    if (trimmedNotes.length > MAX_NOTES_LENGTH) {
      return `Additional notes cannot exceed ${MAX_NOTES_LENGTH} characters.`;
    }
    return '';
  }, [form.condition, trimmedNotes]);

  const onContinue = () => {
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    router.push({
      pathname: '/pickup-location',
      params: {
        serviceId,
        serviceKey,
        vehicleDetails,
        pendingRequestDetails,
        pendingPhotoAssets,
        vehicleConditionDetails: JSON.stringify({
          vehicleCondition: form.condition,
          vehicleConditionNotes: trimmedNotes || undefined,
        }),
      },
    } as unknown as Href);
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoidingView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          keyboardInset > 0 ? { paddingBottom: 32 + keyboardInset } : undefined,
        ]}
        keyboardShouldPersistTaps="handled"
      >
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>Vehicle Condition</Text>
      <Text style={styles.subtitle}>
        Tell drivers the vehicle condition so they can prepare the right equipment.
      </Text>

      <View style={styles.cardList}>
        {VEHICLE_CONDITION_OPTIONS.map((option) => {
          const isSelected = form.condition === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.optionCard, isSelected && styles.optionCardSelected]}
              onPress={() => {
                setForm((prev) => ({ ...prev, condition: option.value }));
                setErrorMessage('');
              }}
            >
              <View style={[styles.radio, isSelected && styles.radioSelected]}>
                {isSelected ? <View style={styles.radioDot} /> : null}
              </View>
              <View style={styles.optionContent}>
                <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                  {option.label}
                </Text>
                <Text
                  style={[
                    styles.optionDescription,
                    isSelected && styles.optionDescriptionSelected,
                  ]}
                >
                  {option.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.notesLabel}>Additional notes</Text>
      <TextInput
        value={form.notes}
        onChangeText={(value) => {
          setForm((prev) => ({ ...prev, notes: value }));
          setErrorMessage('');
        }}
        placeholder="Add any notes or extra details about the vehicle condition"
        placeholderTextColor="#98a2b3"
        style={styles.notesInput}
        multiline
        textAlignVertical="top"
        maxLength={MAX_NOTES_LENGTH}
      />
      <Text style={styles.notesCount}>{trimmedNotes.length}/{MAX_NOTES_LENGTH}</Text>

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueText}>Continue to Pickup Location</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: M3LoginColors.background,
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: M3LoginColors.surface,
  },
  backButtonText: {
    color: M3LoginColors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: M3LoginColors.textSecondary,
  },
  cardList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: M3LoginColors.surface,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 14,
    padding: 14,
  },
  optionCardSelected: {
    borderColor: M3LoginColors.primary,
    backgroundColor: M3LoginColors.primary,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: M3LoginColors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioSelected: {
    borderColor: M3LoginColors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: M3LoginColors.primary,
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  optionLabelSelected: {
    color: '#FFFFFF',
  },
  optionDescription: {
    fontSize: 14,
    color: M3LoginColors.textSecondary,
  },
  optionDescriptionSelected: {
    color: '#FFFFFF',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: M3LoginColors.textPrimary,
  },
  notesInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    borderRadius: 12,
    backgroundColor: M3LoginColors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: M3LoginColors.textPrimary,
  },
  notesCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: M3LoginColors.textTertiary,
  },
  errorText: {
    color: M3LoginColors.error,
    fontSize: 13,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 8,
    height: 52,
    borderRadius: 12,
    backgroundColor: M3LoginColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    color: M3LoginColors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
