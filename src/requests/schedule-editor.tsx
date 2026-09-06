import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { VehicleDraft } from './vehicle-draft';
import { getActiveLocale } from '@/localization/format';

export function scheduleLabel(
  schedule: VehicleDraft['schedule'],
  language: string,
) {
  const date = new Date(schedule.at);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString(
    language === 'de' ? 'de-DE' : getActiveLocale(),
    { day: '2-digit', month: '2-digit', year: 'numeric' },
  );
  const time = date.toLocaleTimeString(getActiveLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return language === 'de' ? `${day} um ${time} Uhr` : `${day} ${time}`;
}
export function ScheduleEditor({
  value,
  onChange,
  invalid,
}: {
  value: VehicleDraft['schedule'];
  onChange: (value: VehicleDraft['schedule']) => void;
  invalid: boolean;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'date' | 'time'>();
  const [pending, setPending] = useState(new Date(value.at));
  const [fallback] = useState(() => new Date(Date.now() + 3600000));
  const current = Number.isNaN(Date.parse(value.at))
    ? fallback
    : new Date(value.at);
  const merge = (selected: Date, selectedMode: 'date' | 'time') => {
    const result = new Date(current);
    if (selectedMode === 'date')
      result.setFullYear(
        selected.getFullYear(),
        selected.getMonth(),
        selected.getDate(),
      );
    else result.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    return result;
  };
  const picker = mode ? (
    <DateTimePicker
      value={pending}
      mode={mode}
      display="spinner"
      themeVariant="light"
      textColor="#111827"
      accentColor="#111827"
      is24Hour
      locale={mode === 'time' ? 'en_GB' : getActiveLocale()}
      positiveButton={{ label: t('vehicleRequest.save') }}
      negativeButton={{ label: t('vehicleRequest.close') }}
      minimumDate={mode === 'date' ? new Date() : undefined}
      onChange={(event, selected) => {
        if (Platform.OS === 'android') {
          const selectedMode = mode;
          setMode(undefined);
          if (event.type === 'set' && selected)
            onChange({
              ...value,
              at: merge(selected, selectedMode).toISOString(),
            });
        } else if (selected) setPending(merge(selected, mode));
      }}
    />
  ) : null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('vehicleRequest.step.schedule')}</Text>
      <View style={styles.row}>
        <Text style={styles.body}>{t('vehicleRequest.immediate')}</Text>
        <Switch
          accessibilityLabel={t('vehicleRequest.immediate')}
          trackColor={{ false: '#D9DFE8', true: '#FFC548' }}
          thumbColor="#FFFFFF"
          value={value.immediate}
          onValueChange={(immediate) => onChange({ ...value, immediate })}
        />
      </View>
      {!value.immediate ? (
        <View style={[styles.section, invalid && styles.invalid]}>
          {(['date', 'time'] as const).map((option) => (
            <Pressable
              key={option}
              style={styles.button}
              onPress={() => {
                setPending(current);
                setMode(option);
              }}
            >
              <Text style={styles.body}>{t(`vehicleRequest.${option}`)}</Text>
              <Text style={styles.body}>
                {option === 'date'
                  ? current.toLocaleDateString(getActiveLocale())
                  : current.toLocaleTimeString(getActiveLocale(), {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {Platform.OS === 'ios' ? (
        <Modal
          transparent
          visible={Boolean(mode)}
          onRequestClose={() => setMode(undefined)}
          animationType="slide"
        >
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              {picker}
              <View style={styles.row}>
                <Pressable onPress={() => setMode(undefined)}>
                  <Text style={styles.body}>{t('vehicleRequest.close')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    onChange({ ...value, at: pending.toISOString() });
                    setMode(undefined);
                  }}
                >
                  <Text style={styles.body}>{t('vehicleRequest.save')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      ) : (
        picker
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  body: { color: '#111827', fontSize: 14, lineHeight: 20 },
  section: { gap: 16 },
  title: { color: '#111827', fontSize: 18, fontWeight: '700' },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    gap: 16,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  button: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#FFF',
    gap: 8,
    borderWidth: 1,
    borderColor: '#D9DFE8',
  },
  invalid: { borderWidth: 2, borderColor: '#C0392B', borderRadius: 14 },
  overlay: {
    flex: 1,
    backgroundColor: '#0006',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: { backgroundColor: '#FFF', borderRadius: 16, padding: 24 },
});
