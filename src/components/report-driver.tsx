import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { getChatRoomByTransportRequestId, reportChatParticipant } from '@/lib/api';
import { clientTheme } from '@/components/tracking-ui';

// Keep explicit incident labels in the existing moderation queue without requiring
// a server enum migration before clients can report service incidents.
const REASONS = [
  { id: 'NO_SHOW', label: 'Driver did not show up' },
  { id: 'THEFT', label: 'Suspected theft or missing items' },
  { id: 'OTHER', label: 'Other driver issue' },
] as const;

export function ReportDriver({ requestId }: { requestId: string }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>(REASONS[0]);
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const inFlight = useRef(false);

  function close() {
    if (!inFlight.current) setVisible(false);
  }

  async function submit() {
    if (inFlight.current) return;
    if (!details.trim()) {
      setError(t('Please describe what happened.'));
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setError('');
    try {
      const room = await getChatRoomByTransportRequestId(requestId);
      await reportChatParticipant(room.id, {
        reason: 'OTHER',
        details: `${reason.label}\n${details.trim()}`,
      });
      setSubmitted(true);
    } catch {
      setError(t('Could not submit your report. Please try again.'));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Report driver')}
        onPress={() => { setError(''); setSubmitted(false); setDetails(''); setReason(REASONS[0]); setVisible(true); }}
        style={({ pressed }) => [styles.reportButton, pressed && styles.pressed]}
      >
        <SymbolView name={{ ios: 'flag', android: 'flag', web: 'flag' }} size={24} tintColor={styles.reportTitle.color} />
        <View style={styles.buttonCopy}>
          <Text style={styles.reportTitle}>{t('Report driver')}</Text>
          <Text style={styles.reportHint}>{t('Driver did not arrive, missing items, or another issue?')}</Text>
        </View>
      </Pressable>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
        <SafeAreaView style={styles.overlay}>
          <KeyboardAvoidingView style={styles.modalLayout} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={styles.sheet} accessibilityViewIsModal>
              <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
                <Text accessibilityRole="header" style={styles.title}>{t(submitted ? 'Report submitted' : 'Report driver')}</Text>
                {submitted ? (
                  <Text style={styles.body} accessibilityLiveRegion="polite">{t('Your report has been sent to the Transpo24 safety team for review.')}</Text>
                ) : (
                  <>
                    <Text style={styles.body}>{t('Tell us what happened with this request. Your report will be sent to the Transpo24 safety team.')}</Text>
                    <Text style={styles.label}>{t('What happened?')}</Text>
                    <View accessibilityRole="radiogroup">
                      {REASONS.map(option => (
                        <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ checked: reason.id === option.id, disabled: submitting }} disabled={submitting} onPress={() => setReason(option)} style={[styles.option, reason.id === option.id && styles.selected]}>
                          <View style={[styles.radio, reason.id === option.id && styles.radioSelected]} />
                          <Text style={styles.optionText}>{t(option.label)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.label}>{t('Describe what happened (required)')}</Text>
                    <TextInput accessibilityLabel={t('Describe what happened (required)')} style={styles.input} value={details} onChangeText={setDetails} multiline maxLength={900} editable={!submitting} textAlignVertical="top" />
                    {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
                    <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting, busy: submitting }} disabled={submitting} onPress={() => void submit()} style={({ pressed }) => [styles.submit, (pressed || submitting) && styles.pressed]}>
                      {submitting ? <ActivityIndicator color={clientTheme.text} /> : null}
                      <Text style={styles.submitText}>{t(submitting ? 'Submitting…' : 'Submit report')}</Text>
                    </Pressable>
                  </>
                )}
                <Pressable accessibilityRole="button" disabled={submitting} onPress={close} style={styles.cancel}>
                  <Text style={styles.label}>{t(submitted ? 'Done' : 'Cancel')}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  reportButton: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 16, borderWidth: 1, borderColor: '#E9B5B5', backgroundColor: '#FFF3F2', borderRadius: 16 },
  buttonCopy: { flex: 1, gap: 4 },
  reportTitle: { color: '#9F2424', fontWeight: '700', fontSize: 16 },
  reportHint: { color: '#7B3333', fontSize: 14, lineHeight: 20 },
  pressed: { opacity: 0.65 },
  overlay: { flex: 1, backgroundColor: clientTheme.overlay },
  modalLayout: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '95%', backgroundColor: clientTheme.surface, borderTopStartRadius: 24, borderTopEndRadius: 24 },
  sheetContent: { padding: 24, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: clientTheme.text },
  body: { fontSize: 16, lineHeight: 24, color: clientTheme.textMuted },
  label: { fontSize: 16, fontWeight: '600', color: clientTheme.text },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: clientTheme.border, marginBottom: 8 },
  selected: { borderColor: clientTheme.accentStrong, backgroundColor: clientTheme.accentSoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: clientTheme.textMuted },
  radioSelected: { borderColor: clientTheme.text, backgroundColor: clientTheme.accent },
  optionText: { flex: 1, fontSize: 16, color: clientTheme.text },
  input: { minHeight: 112, padding: 12, borderWidth: 1, borderColor: clientTheme.border, borderRadius: 12, fontSize: 16, color: clientTheme.text },
  error: { color: '#9F2424', fontSize: 16 },
  submit: { minHeight: 48, padding: 14, borderRadius: 12, backgroundColor: clientTheme.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  submitText: { fontSize: 16, fontWeight: '700', color: clientTheme.text },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
