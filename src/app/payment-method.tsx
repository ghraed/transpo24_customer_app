import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SavedCardPicker, EMPTY_CARD_SELECTION } from '@/components/saved-card-picker';

import { saveDefaultPaymentMethod } from '@/lib/api';

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

export default function PaymentMethodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const [cardSelection, setCardSelection] = useState(EMPTY_CARD_SELECTION);
  const cardComplete = Boolean(cardSelection.paymentMethodId) && !cardSelection.busy;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const onSave = async (): Promise<void> => {
    if (isSubmitting || cardSelection.busy) return;
    setErrorMessage('');

    if (!cardComplete) {
      setErrorMessage(t('payment_method.card_required'));
      return;
    }

    setIsSubmitting(true);

    try {
      await saveDefaultPaymentMethod(cardSelection.paymentMethodId!);
      router.replace(
        (`/request-status?requestId=${encodeURIComponent(requestId)}&refreshTs=${Date.now()}`) as Href,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('payment_method.save_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom + 32, 42),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroBadge}>
              <IconSymbol
                name={{ ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }}
                color="#111827"
                size={20}
              />
            </View>
            <Text style={styles.heroLabel}>{t('payment_method.title')}</Text>
          </View>
          <Text style={styles.heroTitle}>{t('payment_method.title')}</Text>
          <Text style={styles.heroSubtitle}>{t('payment_method.subtitle')}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t('payment_method.title')}</Text>
          <SavedCardPicker disabled={isSubmitting} onChange={setCardSelection} />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        </View>

        <Pressable
          style={[styles.primaryButton, (!cardComplete || isSubmitting) && styles.disabledButton]}
          disabled={!cardComplete || isSubmitting}
          onPress={() => void onSave()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('saved_cards.use_card')}</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.secondaryButton}
          onPress={() =>
            router.replace(
              (`/request-status?requestId=${encodeURIComponent(requestId)}&refreshTs=${Date.now()}`) as Href,
            )
          }
        >
          <Text style={styles.secondaryButtonText}>{t('payment_method.cancel_button')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  heroBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  heroSubtitle: {
    marginTop: 8,
    color: '#68768A',
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  cardFieldWrap: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardField: {
    width: '100%',
    height: 56,
  },
  primaryButton: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#111827',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    marginTop: 12,
    lineHeight: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
