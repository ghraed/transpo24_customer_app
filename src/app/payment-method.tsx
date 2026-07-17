import { CardField, createPaymentMethod } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { M3LoginColors } from '@/constants/theme';
import { saveDefaultPaymentMethod } from '@/lib/api';

export default function PaymentMethodScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { t } = useTranslation();
  const requestId = typeof params.requestId === 'string' ? params.requestId.trim() : '';
  const [cardComplete, setCardComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const onSave = async (): Promise<void> => {
    setErrorMessage('');

    if (!cardComplete) {
      setErrorMessage(t('payment_method.card_required'));
      return;
    }

    setIsSubmitting(true);

    try {
      const { paymentMethod, error } = await createPaymentMethod({
        paymentMethodType: 'Card',
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!paymentMethod?.id) {
        throw new Error(t('payment_method.create_failed'));
      }

      await saveDefaultPaymentMethod(paymentMethod.id);
      router.replace(
        (`/request-status?requestId=${encodeURIComponent(requestId)}&refreshTs=${Date.now()}`) as Href,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : t('payment_method.save_failed'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('payment_method.title')}</Text>
        <Text style={styles.subtitle}>{t('payment_method.subtitle')}</Text>
        <CardField
          postalCodeEnabled={false}
          placeholders={{ number: '4242 4242 4242 4242' }}
          cardStyle={{
            backgroundColor: '#FFFFFF',
            textColor: '#0F172A',
            placeholderColor: '#64748B',
            borderColor: '#CBD5E1',
          }}
          style={styles.cardField}
          onCardChange={(details) => setCardComplete(Boolean(details.complete))}
        />

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.primaryButton, (!cardComplete || isSubmitting) && styles.disabledButton]}
          disabled={!cardComplete || isSubmitting}
          onPress={() => void onSave()}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>{t('payment_method.save_button')}</Text>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: M3LoginColors.background,
    padding: 16,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: M3LoginColors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: M3LoginColors.outlineVariant,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: M3LoginColors.textPrimary,
  },
  subtitle: {
    color: M3LoginColors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  cardField: {
    width: '100%',
    height: 52,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: M3LoginColors.primary,
    borderRadius: 10,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: M3LoginColors.outline,
    backgroundColor: '#FFFFFF',
  },
  secondaryButtonText: {
    color: M3LoginColors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    color: M3LoginColors.error,
    fontSize: 14,
  },
  disabledButton: {
    opacity: 0.6,
  },
});
