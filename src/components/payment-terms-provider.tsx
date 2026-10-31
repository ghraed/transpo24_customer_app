import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, AppState, findNodeHandle, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getCustomerPaymentPolicy } from '@/lib/api';
import { PaymentPolicyContext } from '@/lib/payment-policy-context';
import { changedPolicySections, policyFingerprint, policySections } from '@/lib/payment-policy-review';
import { paymentRules } from '@/lib/payment-rules';
import type { PaymentPolicy } from '@/types/payment-policy';
import { PaymentRuleContent } from './payment-info';
import { clientTheme as theme } from './tracking-ui';

type Acceptance = { policy: PaymentPolicy; acceptedAt: string };

async function readAcceptance(key: string): Promise<Acceptance | null> {
  try {
    const raw = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(key)
      : await SecureStore.getItemAsync(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Acceptance;
    // Corrupt or older local records must never count as acceptance.
    if (!value.acceptedAt || !value.policy?.version) return null;
    for (const { context } of policySections) paymentRules(context, value.policy, (key) => key);
    return value;
  } catch {
    return null;
  }
}

async function saveAcceptance(key: string, policy: PaymentPolicy) {
  const raw = JSON.stringify({ policy, acceptedAt: new Date().toISOString() });
  if (Platform.OS === 'web') globalThis.localStorage.setItem(key, raw);
  else await SecureStore.setItemAsync(key, raw);
}

// Key this provider by session/user so late responses cannot update another account.
export function PaymentTermsProvider({ ready, userId, children }: {
  ready: boolean;
  userId?: string;
  children: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [policy, setPolicy] = useState<PaymentPolicy | null>(null);
  const [accepted, setAccepted] = useState<Acceptance | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const heading = useRef<Text>(null);
  const scroll = useRef<ScrollView>(null);
  const banner = useRef<View>(null);
  const active = useRef(false);
  const accepting = useRef(false);
  const reload = useRef<() => Promise<void>>(async () => undefined);
  const storageKey = `transpo24.customer.paymentTerms.${encodeURIComponent(userId ?? '').replace(/%/g, '_')}`;
  const requiresAcceptance = !!policy && policyFingerprint(accepted?.policy) !== policyFingerprint(policy);

  useEffect(() => {
    if (!ready || !userId) return;
    active.current = true;
    let subscribed = true;
    let loading = false;
    const load = async () => {
      if (loading || accepting.current) return;
      loading = true;
      setChecking(true);
      try {
        const [current, saved] = await Promise.all([
          getCustomerPaymentPolicy(), readAcceptance(storageKey),
        ]);
        if (!subscribed) return;
        setPolicy(current);
        setAccepted(saved);
        setError(false);
        setSaveError('');
        setOpen(policyFingerprint(saved?.policy) !== policyFingerprint(current));
      } catch {
        if (subscribed) setError(true);
      } finally {
        loading = false;
        if (subscribed) setChecking(false);
      }
    };
    reload.current = load;
    void load();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => { subscribed = false; active.current = false; subscription.remove(); };
  }, [ready, userId, storageKey]);

  const focus = (target: Text | View | null) => {
    const handle = target && findNodeHandle(target);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };
  const close = () => {
    if (accepting.current) return;
    setOpen(false);
    requestAnimationFrame(() => focus(banner.current));
  };
  const accept = async () => {
    if (!policy || accepting.current) return;
    accepting.current = true;
    setBusy(true);
    setSaveError('');
    try {
      // Acceptance only covers what was displayed. Never accept newer terms silently.
      const current = await getCustomerPaymentPolicy();
      if (!active.current) return;
      if (policyFingerprint(current) !== policyFingerprint(policy)) {
        setPolicy(current);
        setSaveError(t('payment_terms.changed_again'));
        requestAnimationFrame(() => {
          scroll.current?.scrollTo({ y: 0, animated: false });
          focus(heading.current);
        });
        return;
      }
      await saveAcceptance(storageKey, policy);
      if (!active.current) return;
      setAccepted({ policy, acceptedAt: new Date().toISOString() });
      setError(false);
      setOpen(false);
    } catch {
      if (active.current) setSaveError(t('payment_terms.save_failed'));
    } finally {
      accepting.current = false;
      if (active.current) setBusy(false);
    }
  };
  const changes = accepted && policy ? changedPolicySections(accepted.policy, policy).map(({ context }) => {
    const before = paymentRules(context, accepted.policy, t);
    const after = paymentRules(context, policy, t);
    return { context, before: before.filter((rule) => !after.includes(rule)), after: after.filter((rule) => !before.includes(rule)) };
  }).filter(({ before, after }) => before.length || after.length) : [];
  const rtl = i18n.dir?.() === 'rtl';
  const textStyle = rtl ? styles.rtl : undefined;
  return (
    <PaymentPolicyContext.Provider value={{
      policy, error, checking, requiresAcceptance, reviewing: open,
      refresh: () => reload.current(),
    }}>
      {ready && !open && (requiresAcceptance || error) ? (
        <Pressable
          ref={banner}
          accessibilityRole="button"
          onPress={() => { if (error) void reload.current(); else setOpen(true); }}
          style={({ pressed }) => [styles.banner, { paddingTop: insets.top + 12 }, pressed && styles.pressed]}
        >
          <Text style={[styles.buttonText, textStyle]}>
            {t(error ? 'payment_terms.retry' : 'payment_terms.review')}
          </Text>
        </Pressable>
      ) : null}
      {children}
      {ready && policy && open ? (
        <Modal visible transparent animationType="none" onRequestClose={close}
          onShow={() => focus(heading.current)}>
          <View style={[styles.overlay, {
            paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16),
          }]}>
            <View accessibilityViewIsModal style={[styles.dialog, { direction: rtl ? 'rtl' : 'ltr' }]}>
              <ScrollView ref={scroll} contentContainerStyle={styles.content} bounces={false}>
                <Text ref={heading} accessible accessibilityRole="header" style={[styles.title, textStyle]}>
                  {t(accepted ? 'payment_terms.updated' : 'payment_terms.title')}
                </Text>
                <Text style={[styles.body, textStyle]}>{t('payment_terms.intro')}</Text>
                {accepted ? (
                  <View style={styles.changes}>
                    <Text accessibilityRole="header" style={[styles.sectionTitle, textStyle]}>{t('payment_terms.changes')}</Text>
                    {changes.length ? changes.map(({ context, before, after }) => (
                      <View key={context} style={styles.group}>
                        <Text style={[styles.sectionTitle, textStyle]}>{t(`payment_terms.${context}`)}</Text>
                        {before.length ? <Text style={[styles.label, textStyle]}>{t('payment_terms.previously')}</Text> : null}
                        {before.map((rule, index) => <Text key={`before-${index}`} style={[styles.body, textStyle]}>{rule}</Text>)}
                        {after.length ? <Text style={[styles.label, textStyle]}>{t('payment_terms.now')}</Text> : null}
                        {after.map((rule, index) => <Text key={`after-${index}`} style={[styles.body, textStyle]}>{rule}</Text>)}
                      </View>
                    )) : <Text style={[styles.body, textStyle]}>{t('payment_terms.version_changed')}</Text>}
                  </View>
                ) : <Text style={[styles.body, textStyle]}>{t('payment_terms.no_previous')}</Text>}
                <Text accessibilityRole="header" style={[styles.sectionTitle, textStyle]}>{t('payment_terms.current')}</Text>
                {policySections.map(({ context }) => (
                  <View key={context} style={styles.group}>
                    <Text accessibilityRole="header" style={[styles.sectionTitle, textStyle]}>{t(`payment_terms.${context}`)}</Text>
                    <PaymentRuleContent context={context} policy={policy} />
                  </View>
                ))}
                <Text style={[styles.body, textStyle]}>{t('payment_terms.no_payment')}</Text>
                {saveError ? <Text accessibilityRole="alert" style={[styles.error, textStyle]}>{saveError}</Text> : null}
                <Pressable accessibilityRole="button" disabled={busy}
                  accessibilityState={{ disabled: busy, busy }} onPress={() => { void accept(); }}
                  style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                  {busy ? <ActivityIndicator color={theme.text} />
                    : <Text style={styles.buttonText}>{t('payment_terms.accept')}</Text>}
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} onPress={close}
                  style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Text style={styles.buttonText}>{t('payment_terms.later')}</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </PaymentPolicyContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.55)', justifyContent: 'center', paddingHorizontal: 16 },
  dialog: { maxHeight: '100%', maxWidth: 560, width: '100%', alignSelf: 'center', backgroundColor: theme.surface, borderRadius: 24, overflow: 'hidden' },
  content: { padding: 24, gap: 16 },
  title: { color: theme.text, fontSize: 24, fontWeight: '800' },
  sectionTitle: { color: theme.text, fontSize: 18, fontWeight: '700' },
  label: { color: theme.reminderText, fontSize: 16, fontWeight: '700' },
  body: { color: theme.text, fontSize: 16, lineHeight: 24 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  group: { gap: 12 },
  changes: { backgroundColor: theme.reminderSurface, borderRadius: 16, padding: 16, gap: 16 },
  primary: { backgroundColor: theme.accent, minHeight: 48, padding: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  secondary: { minHeight: 48, padding: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: theme.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  banner: { minHeight: 48, padding: 12, justifyContent: 'center', backgroundColor: theme.accentSoft },
  pressed: { opacity: 0.65 },
  error: { color: '#9B1C1C', fontSize: 16, lineHeight: 24 },
});
