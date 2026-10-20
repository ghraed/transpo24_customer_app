import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export function OptionalRequestNote({
  value,
  onChangeText,
  onFocus,
  editable = true,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onFocus?: () => void;
  editable?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t('Optional Note')}</Text>
      <TextInput
        accessibilityLabel={t('Optional Note')}
        placeholder={t('Add a note for drivers, optional')}
        placeholderTextColor="#68768A"
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        editable={editable}
        maxLength={1000}
        multiline
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 12,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 18,
    minHeight: 100,
    backgroundColor: '#F8FAFC',
    padding: 14,
    textAlignVertical: 'top',
    color: '#111827',
    fontSize: 14,
  },
});
