import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { VehicleConditionFormValues, VehicleConditionOption } from '@/types/vehicle-condition';

type RouteParams = {
  serviceId?: string;
  serviceKey?: string;
  vehicleDetails?: string;
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
        vehicleConditionDetails: JSON.stringify({
          vehicleCondition: form.condition,
          vehicleConditionNotes: trimmedNotes || undefined,
        }),
      },
    } as unknown as Href);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
                <Text style={styles.optionDescription}>{option.description}</Text>
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
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#f7f9fc',
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  backButtonText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 13,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    fontSize: 15,
    color: '#475467',
  },
  cardList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 14,
    padding: 14,
  },
  optionCardSelected: {
    borderColor: '#1a73e8',
    backgroundColor: '#eef5ff',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#98a2b3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  radioSelected: {
    borderColor: '#1a73e8',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1a73e8',
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101828',
  },
  optionLabelSelected: {
    color: '#0b57d0',
  },
  optionDescription: {
    fontSize: 14,
    color: '#475467',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  notesInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#111827',
  },
  notesCount: {
    alignSelf: 'flex-end',
    fontSize: 12,
    color: '#667085',
  },
  errorText: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '600',
  },
  continueButton: {
    marginTop: 8,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#1a73e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
