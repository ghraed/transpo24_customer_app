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
import { SafeAreaView } from 'react-native-safe-area-context';
import { clientTheme } from '@/components/tracking-ui';
import { useAndroidKeyboardInset } from '@/hooks/use-android-keyboard-inset';
import type { VehicleConditionFormValues, VehicleConditionOption } from '@/types/vehicle-condition';
import appI18n from '@/localization/i18n';

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
    if (!form.condition) return appI18n.t("Please select the vehicle condition.");
    if (trimmedNotes.length > MAX_NOTES_LENGTH) {
      return appI18n.t("Additional notes cannot exceed {{value0}} characters.", { value0: MAX_NOTES_LENGTH });
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
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>{appI18n.t("Vehicle transport")}</Text>
            <Text style={styles.title}>{appI18n.t("Vehicle condition")}</Text>
            <Text style={styles.subtitle}>
              {appI18n.t("Tell drivers the vehicle condition so they can prepare the right equipment.")}</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{appI18n.t("Select condition")}</Text>
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
                        {appI18n.t(option.label)}
                      </Text>
                      <Text
                        style={[
                          styles.optionDescription,
                          isSelected && styles.optionDescriptionSelected,
                        ]}
                      >
                        {appI18n.t(option.description)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{appI18n.t("Additional notes")}</Text>
            <TextInput
              value={form.notes}
              onChangeText={(value) => {
                setForm((prev) => ({ ...prev, notes: value }));
                setErrorMessage('');
              }}
              placeholder={appI18n.t("Add any notes or extra details about the vehicle condition")}
              placeholderTextColor="#98A2B3"
              style={styles.notesInput}
              multiline
              textAlignVertical="top"
              maxLength={MAX_NOTES_LENGTH}
            />
            <Text style={styles.notesCount}>{trimmedNotes.length}/{MAX_NOTES_LENGTH}</Text>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <Pressable style={styles.continueButton} onPress={onContinue}>
            <Text style={styles.continueText}>{appI18n.t("Continue to pickup location")}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: clientTheme.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    padding: 20,
    paddingBottom: 32,
    backgroundColor: clientTheme.background,
    gap: 16,
  },
  heroCard: {
    backgroundColor: clientTheme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 20,
    gap: 8,
  },
  eyebrow: {
    color: clientTheme.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: clientTheme.text,
  },
  subtitle: {
    fontSize: 15,
    color: clientTheme.textMuted,
    lineHeight: 22,
  },
  sectionCard: {
    backgroundColor: clientTheme.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: clientTheme.border,
    padding: 18,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: clientTheme.text,
  },
  cardList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: clientTheme.surface,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 20,
    padding: 14,
  },
  optionCardSelected: {
    borderColor: clientTheme.accent,
    backgroundColor: clientTheme.accentSoft,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: clientTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioSelected: {
    borderColor: clientTheme.accentStrong,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: clientTheme.accentStrong,
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: clientTheme.text,
  },
  optionLabelSelected: {
    color: clientTheme.text,
  },
  optionDescription: {
    fontSize: 14,
    color: clientTheme.textMuted,
  },
  optionDescriptionSelected: {
    color: clientTheme.textMuted,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: clientTheme.text,
  },
  notesInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: clientTheme.border,
    borderRadius: 16,
    backgroundColor: clientTheme.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: clientTheme.text,
  },
  notesCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: clientTheme.textMuted,
  },
  errorText: {
    color: clientTheme.danger,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  continueButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: clientTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    color: clientTheme.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
