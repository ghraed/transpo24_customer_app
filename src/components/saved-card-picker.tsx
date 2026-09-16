import { CardField, confirmSetupIntent } from '@stripe/stripe-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { createCardSetup, getSavedCards, removeSavedCard, saveDefaultPaymentMethod } from '@/lib/api';
import { getAuthSessionSnapshot, useAuthSession } from '@/lib/auth-token';
import type { SavedPaymentMethodSummary } from '@/types/customer-request';

export type CardSelection = { paymentMethodId: string | null; complete: boolean; busy: boolean };
export const EMPTY_CARD_SELECTION: CardSelection = { paymentMethodId: null, complete: false, busy: false };

type Props = {
  disabled?: boolean;
  onChange: (selection: CardSelection) => void;
};

export function SavedCardPicker(props: Props) {
  const { user } = useAuthSession();
  // Remount on account changes so another customer's cards cannot remain visible.
  return <AccountCards key={user?.id ?? 'signed-out'} {...props} customerId={user?.id} />;
}

function AccountCards({ disabled, onChange, customerId }: Props & { customerId?: string }) {
  const { t } = useTranslation();
  const [cards, setCards] = useState<SavedPaymentMethodSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(Boolean(customerId));
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const operation = useRef(false);
  const isCurrentAccount = () => mounted.current && getAuthSessionSnapshot().user?.id === customerId;

  useEffect(() => {
    mounted.current = true;
    let active = true;
    if (customerId) {
      void getSavedCards().then((saved) => {
        if (!active) return;
        setCards(saved);
        setSelectedId(saved[0]?.id ?? null);
      }).catch(() => {
        if (active) setError(t('saved_cards.load_failed'));
      }).finally(() => { if (active) setBusy(false); });
    }
    return () => { active = false; mounted.current = false; };
  }, [customerId, t]);

  useEffect(() => {
    onChange({ paymentMethodId: selectedId, complete: Boolean(customerId) && (Boolean(selectedId) || complete), busy });
  }, [busy, complete, customerId, onChange, selectedId]);
  useEffect(() => () => onChange(EMPTY_CARD_SELECTION), [onChange]);

  const save = async () => {
    if (!complete || busy || disabled || operation.current || !customerId) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const { clientSecret } = await createCardSetup();
      if (!isCurrentAccount()) return;
      const result = await confirmSetupIntent(clientSecret, { paymentMethodType: 'Card' });
      if (!isCurrentAccount()) return;
      const id = result.setupIntent?.paymentMethod?.id ?? result.setupIntent?.paymentMethodId;
      if (result.error || result.setupIntent?.status !== 'Succeeded' || !id) {
        throw new Error('Card setup was not completed.');
      }
      const saved = await saveDefaultPaymentMethod(id);
      if (!isCurrentAccount()) return;
      setCards((previous) => [saved, ...previous.filter((card) => card.id !== saved.id)]);
      setSelectedId(saved.id);
      setComplete(false);
    } catch {
      if (isCurrentAccount()) setError(t('saved_cards.save_failed'));
    } finally {
      operation.current = false;
      if (isCurrentAccount()) setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (busy || disabled || operation.current || !isCurrentAccount()) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await removeSavedCard(id);
      if (!isCurrentAccount()) return;
      setCards((previous) => previous.filter((card) => card.id !== id));
      if (selectedId === id) { setSelectedId(null); setComplete(false); }
    } catch {
      if (isCurrentAccount()) setError(t('saved_cards.remove_failed'));
    } finally {
      operation.current = false;
      if (isCurrentAccount()) setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('saved_cards.title')}</Text>
      {busy ? <ActivityIndicator /> : null}
      {cards.map((card) => (
        <View key={card.id} style={styles.row}>
          <Pressable
            accessibilityRole="radio" accessibilityState={{ checked: selectedId === card.id }}
            disabled={busy || disabled}
            style={[styles.choice, styles.grow, selectedId === card.id && styles.selected]}
            onPress={() => { setSelectedId(card.id); setComplete(false); }}
          >
            <Text>{card.brand?.toUpperCase() || 'CARD'} •••• {card.last4}</Text>
            <Text>{t('saved_cards.expiry', { month: card.expMonth, year: card.expYear })}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={busy || disabled} style={styles.remove}
            accessibilityLabel={t('saved_cards.remove_label', { last4: card.last4 })}
            onPress={() => Alert.alert(t('saved_cards.remove'), t('saved_cards.remove_confirm'), [
              { text: t('payment_method.cancel_button'), style: 'cancel' },
              { text: t('saved_cards.remove'), style: 'destructive', onPress: () => void remove(card.id) },
            ])}>
            <Text>{t('saved_cards.remove')}</Text>
          </Pressable>
        </View>
      ))}
      <Pressable accessibilityRole="radio" accessibilityState={{ checked: !selectedId }}
        disabled={busy || disabled} style={[styles.choice, !selectedId && styles.selected]}
        onPress={() => { if (selectedId) { setSelectedId(null); setComplete(false); } }}>
        <Text>{t('saved_cards.new_card')}</Text>
      </Pressable>
      {!selectedId ? <>
        <CardField postalCodeEnabled={false} dangerouslyGetFullCardDetails={false}
          disabled={busy || disabled || !customerId}
          cardStyle={{ backgroundColor: '#F8FAFC', textColor: '#111827', placeholderColor: '#68768A' }}
          style={styles.field} onCardChange={(details) => setComplete(Boolean(details.complete))} />
        <Text style={styles.note}>{t('saved_cards.consent')}</Text>
        <Pressable accessibilityRole="button" disabled={!complete || busy || disabled || !customerId}
          style={[styles.save, (!complete || busy || disabled) && styles.disabled]}
          onPress={() => void save()}>
          <Text>{t('saved_cards.save')}</Text>
        </Pressable>
      </> : null}
      <Text style={styles.note}>{t('saved_cards.security')}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  choice: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', gap: 4 },
  selected: { borderColor: '#D89A1A', backgroundColor: '#FFF7E1' },
  remove: { padding: 12, minHeight: 44, justifyContent: 'center' },
  field: { width: '100%', height: 56 },
  note: { fontSize: 13, lineHeight: 19, color: '#68768A' },
  save: { padding: 15, borderRadius: 12, backgroundColor: '#FFC548', alignItems: 'center' },
  disabled: { opacity: 0.5 },
  error: { color: '#B42318', fontSize: 14 },
});
