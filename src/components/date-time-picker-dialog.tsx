import NativeDateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

type Props = {
  value: Date;
  mode: 'date' | 'time';
  minimumDate?: Date;
  maximumDate?: Date;
  is24Hour?: boolean;
  locale?: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
};

function initialValue({ value, mode, minimumDate, maximumDate }: Props): Date {
  const date = Number.isFinite(value.getTime()) ? value : new Date();
  if (mode === 'time') return date;
  const day = (input: Date) => new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  if (minimumDate && day(date) < day(minimumDate)) return minimumDate;
  if (maximumDate && day(date) > day(maximumDate)) return maximumDate;
  return date;
}

// Mount a fresh dialog for each edit. iOS wheel changes stay in a draft until Save.
export function DateTimePickerDialog(props: Props) {
  const { mode, minimumDate, maximumDate, is24Hour, locale, onConfirm, onCancel } = props;
  const { t } = useTranslation();
  const [pending, setPending] = useState(() => initialValue(props));
  const callbacks = useRef({ onConfirm, onCancel });
  useLayoutEffect(() => { callbacks.current = { onConfirm, onCancel }; }, [onConfirm, onCancel]);
  // Android reopens/updates its native dialog when the callback identity changes.
  const handleChange = useCallback((event: DateTimePickerEvent, date?: Date) => {
    if (event.type !== 'set') { callbacks.current.onCancel(); return; }
    if (!date || !Number.isFinite(date.getTime())) return;
    if (Platform.OS === 'android') callbacks.current.onConfirm(date);
    else setPending(date);
  }, []);
  const picker = <NativeDateTimePicker
    value={pending}
    mode={mode}
    display="spinner"
    minimumDate={minimumDate}
    maximumDate={maximumDate}
    is24Hour={is24Hour}
    locale={locale}
    themeVariant="light"
    textColor="#111827"
    positiveButton={{ label: t('Save') }}
    negativeButton={{ label: t('Cancel') }}
    onChange={handleChange}
  />;
  if (Platform.OS !== 'ios') return picker;
  return <Modal transparent visible onRequestClose={onCancel}>
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <ScrollView style={styles.scroll}>{picker}</ScrollView>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={onCancel}>
            <Text style={styles.text}>{t('Cancel')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && styles.pressed]} onPress={() => onConfirm(pending)}>
            <Text style={styles.text}>{t('Save')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#0006' },
  sheet: { maxHeight: '90%', backgroundColor: '#FFF', borderRadius: 16, padding: 20 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  action: { minHeight: 48, padding: 14, justifyContent: 'center' },
  text: { color: '#111827', fontSize: 16 },
  pressed: { opacity: 0.7 },
});
