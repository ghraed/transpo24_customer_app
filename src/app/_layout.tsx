import { StripeProvider } from '@stripe/stripe-react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { getAccessToken, hydrateAccessToken } from '@/lib/auth-token';
import { LocalizationProvider, useAppLanguage } from '@/localization/provider';
import {
  initializeNotifications,
  registerCustomerPushNotifications,
} from '@/notifications/registerPushNotifications';
import { useNotificationNavigation } from '@/notifications/useNotificationNavigation';

function RootNavigator() {
  const colorScheme = useColorScheme();
  const { t } = useTranslation();
  const { ready: localizationReady } = useAppLanguage();
  const [authReady, setAuthReady] = useState(false);
  const rawPublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  const publishableKey =
    rawPublishableKey &&
    !rawPublishableKey.startsWith('replace_') &&
    rawPublishableKey.startsWith('pk_')
      ? rawPublishableKey
      : '';

  useNotificationNavigation();

  useEffect(() => {
    void hydrateAccessToken().finally(() => {
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    initializeNotifications();
  }, []);

  useEffect(() => {
    if (!authReady || !getAccessToken()) {
      return;
    }

    void registerCustomerPushNotifications().catch((error) => {
      console.warn('Customer push registration failed during app bootstrap.', error);
    });
  }, [authReady]);

  if (!authReady || !localizationReady) {
    return (
      <StripeProvider
        publishableKey={publishableKey}
        merchantIdentifier={process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER}
      >
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AnimatedSplashOverlay />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#1D4ED8" />
          </View>
        </ThemeProvider>
      </StripeProvider>
    );
  }

  return (
    <StripeProvider
      publishableKey={publishableKey}
      merchantIdentifier={process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER}
    >
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="index" options={{ title: t('Login') }} />
          <Stack.Screen name="register" options={{ title: t('Create Account') }} />
          <Stack.Screen name="forgot-password" options={{ title: t('Reset Password') }} />

          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          <Stack.Screen name="choose-service" options={{ title: t('Choose Service') }} />
          <Stack.Screen name="vehicle-details" options={{ title: t('Vehicle Details') }} />
          <Stack.Screen name="motorcycle-details" options={{ title: t('Motorcycle Details') }} />
          <Stack.Screen name="goods-details" options={{ title: t('Goods Details') }} />
          <Stack.Screen name="furniture-details" options={{ title: t('Furniture Details') }} />
          <Stack.Screen name="vehicle-condition" options={{ title: t('Vehicle Condition') }} />
          <Stack.Screen name="pickup-location" options={{ title: t('Pickup Location') }} />
          <Stack.Screen name="dropoff-location" options={{ title: t('Dropoff Location') }} />
          <Stack.Screen name="date-time" options={{ title: t('Date & Item Details') }} />
          <Stack.Screen name="submit-request" options={{ title: t('Submit Request') }} />
          <Stack.Screen name="request-status" options={{ title: t('Request Status') }} />
          <Stack.Screen name="request-payment" options={{ title: t('Payment Hold') }} />
          <Stack.Screen name="chat" options={{ title: t('Chat with Driver') }} />
          <Stack.Screen name="customer-tracking" options={{ title: t('Customer Tracking') }} />
          <Stack.Screen name="waiting-for-pickup" options={{ title: t('Waiting for Pickup') }} />
          <Stack.Screen
            name="customer-delivery-tracking"
            options={{ title: t('Delivery Tracking') }}
          />
          <Stack.Screen name="customer-trip-delivered" options={{ title: t('Trip Delivered') }} />
          <Stack.Screen name="customer-rate-driver" options={{ title: t('Rate Driver') }} />
          <Stack.Screen name="socket-debug" options={{ title: t('Socket Debug') }} />

          <Stack.Screen name="home" options={{ title: t('Home') }} />
          <Stack.Screen name="explore" options={{ title: t('Explore') }} />
        </Stack>
      </ThemeProvider>
    </StripeProvider>
  );
}

export default function RootLayout() {
  return (
    <LocalizationProvider>
      <RootNavigator />
    </LocalizationProvider>
  );
}
