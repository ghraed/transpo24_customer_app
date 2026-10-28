import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { getCustomerPaymentPolicy } from '@/lib/api';
import { paymentRules, type PaymentContext } from '@/lib/payment-rules';
import type { PaymentPolicy } from '@/types/payment-policy';

export function usePaymentPolicy(initial?: PaymentPolicy | null) {
  const [policy, setPolicy] = useState<PaymentPolicy | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (initial) return;
    let active = true;
    if (typeof getCustomerPaymentPolicy !== 'function') return;
    void getCustomerPaymentPolicy()
      .then((value) => {
        if (active) setPolicy(value);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [initial]);
  return { policy: initial ?? policy, error };
}

export function PaymentRuleContent({
  context,
  policy,
}: {
  context: PaymentContext;
  policy: PaymentPolicy;
}) {
  const { t, i18n } = useTranslation();
  return (
    <View style={styles.rules}>
      {paymentRules(context, policy, t).map((rule, index) => (
        <Text
          key={index}
          style={[styles.body, i18n.dir?.() === 'rtl' && styles.rtl]}
        >
          {rule}
        </Text>
      ))}
    </View>
  );
}

export function PaymentInfo({
  context,
  policy: supplied,
  details = [],
}: {
  context: PaymentContext;
  policy?: PaymentPolicy | null;
  details?: string[];
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const trigger = useRef<View>(null);
  const heading = useRef<Text>(null);
  const { policy, error } = usePaymentPolicy(supplied);
  const focus = (target: React.RefObject<View | Text | null>) => {
    const handle = target.current && findNodeHandle(target.current);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => focus(trigger));
  };
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={t('payment_info.open')}
        accessibilityHint={t('payment_info.hint')}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.infoGlyph}
        >
          <Text style={styles.infoLetter}>i</Text>
        </View>
      </Pressable>
      {open ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={close}
          onShow={() => focus(heading)}
        >
          <View style={styles.backdrop}>
            <View accessibilityViewIsModal style={styles.dialog}>
              <Text
                ref={heading}
                accessible
                accessibilityRole="header"
                style={[styles.title, i18n.dir?.() === 'rtl' && styles.rtl]}
              >
                {t('payment_info.title')}
              </Text>
              <ScrollView contentContainerStyle={styles.scroll}>
                {details.map((detail, index) => (
                  <Text
                    key={index}
                    style={[styles.body, i18n.dir?.() === 'rtl' && styles.rtl]}
                  >
                    {detail}
                  </Text>
                ))}
                {policy ? (
                  <PaymentRuleContent context={context} policy={policy} />
                ) : error ? (
                  <Text style={styles.body}>
                    {t('payment_info.unavailable')}
                  </Text>
                ) : (
                  <ActivityIndicator
                    accessibilityLabel={t('payment_info.loading')}
                  />
                )}
              </ScrollView>
              <Pressable
                accessibilityRole="button"
                onPress={close}
                style={styles.close}
              >
                <Text style={styles.closeText}>{t('payment_info.close')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  infoGlyph: {
    width: 23,
    height: 23,
    borderRadius: 12,
    borderWidth: 1.6,
    borderColor: '#355475',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLetter: {
    color: '#355475',
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '700',
  },
  pressed: { opacity: 0.6 },
  backdrop: {
    flex: 1,
    padding: 24,
    backgroundColor: '#0008',
    justifyContent: 'center',
  },
  dialog: {
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#17212F',
    marginBottom: 12,
  },
  scroll: { paddingVertical: 8 },
  rules: { gap: 14 },
  body: { fontSize: 16, lineHeight: 24, color: '#355475', marginBottom: 8 },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  close: {
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#FFF2CC',
  },
  closeText: { color: '#17212F', fontSize: 16, fontWeight: '600' },
});
