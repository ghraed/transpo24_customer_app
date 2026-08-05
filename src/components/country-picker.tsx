import { getCountries, type CountryCode } from 'libphonenumber-js';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { countryFlag, getCallingCode } from '@/lib/phone-number';

type Props = {
  value: CountryCode;
  onChange: (country: CountryCode) => void;
};

function countryName(code: CountryCode): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

export function CountryPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const countries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return getCountries()
      .map((code) => ({ code, name: countryName(code), callingCode: getCallingCode(code) }))
      .filter((item) =>
        !query ||
        item.name.toLowerCase().includes(query) ||
        item.code.toLowerCase().includes(query) ||
        item.callingCode.includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Select country')}
        style={styles.trigger}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.flag}>{countryFlag(value)}</Text>
        <Text style={styles.callingCode}>{getCallingCode(value)}</Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('Select country')}</Text>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)}>
              <Text style={styles.done}>{t('Done')}</Text>
            </Pressable>
          </View>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('Search countries')}
            autoCapitalize="none"
            style={styles.search}
          />
          <ScrollView keyboardShouldPersistTaps="handled">
            {countries.map((item) => (
              <Pressable
                key={item.code}
                style={styles.row}
                onPress={() => {
                  onChange(item.code);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <Text style={styles.flag}>{countryFlag(item.code)}</Text>
                <Text style={styles.countryName}>{item.name}</Text>
                <Text style={styles.rowCode}>{item.callingCode}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRightWidth: 1, borderRightColor: '#E1E5EB' },
  flag: { fontSize: 23 },
  callingCode: { color: '#111827', fontSize: 15, fontWeight: '700' },
  chevron: { color: '#68768A', fontSize: 16 },
  modal: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#E8EBF0' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  done: { color: '#A56B00', fontSize: 16, fontWeight: '800' },
  search: { margin: 16, minHeight: 50, borderRadius: 14, backgroundColor: '#F3F5F8', paddingHorizontal: 16, fontSize: 16, color: '#111827' },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8EBF0' },
  countryName: { flex: 1, fontSize: 16, color: '#111827' },
  rowCode: { fontSize: 15, color: '#68768A', fontWeight: '600' },
});
