import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { getAccessToken } from '@/lib/auth-token';
import { initializeNotifications , registerCustomerPushNotifications } from '@/notifications/registerPushNotifications';
import { useNotificationNavigation } from '@/notifications/useNotificationNavigation';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const rawPublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? '';
  const publishableKey =
    rawPublishableKey &&
    !rawPublishableKey.startsWith('replace_') &&
    rawPublishableKey.startsWith('pk_')
      ? rawPublishableKey
      : '';

  useNotificationNavigation();

  useEffect(() => {
    initializeNotifications();
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      return;
    }

    void registerCustomerPushNotifications().catch((error) => {
      // Best-effort token registration on app boot for already-authenticated sessions.
      console.warn('Customer push registration failed during app bootstrap.', error);
    });
  }, []);

  return (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier={process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack>
          <Stack.Screen name="index" options={{ title: 'Login' }} />
          <Stack.Screen name="register" options={{ title: 'Create Account' }} />
          <Stack.Screen name="forgot-password" options={{ title: 'Reset Password' }} />

          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          <Stack.Screen name="choose-service" options={{ title: 'Choose Service' }} />
          <Stack.Screen name="vehicle-details" options={{ title: 'Vehicle Details' }} />
          <Stack.Screen name="motorcycle-details" options={{ title: 'Motorcycle Details' }} />
          <Stack.Screen name="goods-details" options={{ title: 'Goods Details' }} />
          <Stack.Screen name="furniture-details" options={{ title: 'Furniture Details' }} />
          <Stack.Screen name="vehicle-condition" options={{ title: 'Vehicle Condition' }} />
          <Stack.Screen name="pickup-location" options={{ title: 'Pickup Location' }} />
          <Stack.Screen name="dropoff-location" options={{ title: 'Dropoff Location' }} />
          <Stack.Screen name="date-time" options={{ title: 'Date & Item Details' }} />
          <Stack.Screen name="submit-request" options={{ title: 'Submit Request' }} />
          <Stack.Screen name="request-status" options={{ title: 'Request Status' }} />
          <Stack.Screen name="request-payment" options={{ title: 'Payment Hold' }} />
          <Stack.Screen name="chat" options={{ title: 'Chat with Driver' }} />
          <Stack.Screen name="customer-tracking" options={{ title: 'Customer Tracking' }} />
          <Stack.Screen name="waiting-for-pickup" options={{ title: 'Waiting for Pickup' }} />
          <Stack.Screen name="customer-delivery-tracking" options={{ title: 'Delivery Tracking' }} />
          <Stack.Screen name="customer-trip-delivered" options={{ title: 'Trip Delivered' }} />
          <Stack.Screen name="socket-debug" options={{ title: 'Socket Debug' }} />

          <Stack.Screen name="home" options={{ title: 'Home' }} />
          <Stack.Screen name="explore" options={{ title: 'Explore' }} />
        </Stack>
      </ThemeProvider>
    </StripeProvider>
  );
}
