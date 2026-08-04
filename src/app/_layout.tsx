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

if (__DEV__) {
  const globalState = globalThis as typeof globalThis & {
    __transpoJsonParsePatched?: boolean;
    __transpoResponseJsonPatched?: boolean;
    __transpoGlobalErrorPatched?: boolean;
    ErrorUtils?: {
      getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
    };
  };

  if (!globalState.__transpoJsonParsePatched) {
    const originalJsonParse = JSON.parse;

    JSON.parse = ((text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) => {
      try {
        return originalJsonParse(text, reviver);
      } catch (error) {
        const preview = typeof text === 'string' ? text.slice(0, 200) : String(text);
        console.error('JSON.parse failed in dev runtime.', {
          preview,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }) as typeof JSON.parse;

    globalState.__transpoJsonParsePatched = true;
  }

  if (!globalState.__transpoResponseJsonPatched && typeof Response !== 'undefined') {
    const originalResponseJson = Response.prototype.json;

    Response.prototype.json = (async function (
      this: Response,
      ...args: Parameters<typeof originalResponseJson>
    ) {
      try {
        return await originalResponseJson.apply(this, args);
      } catch (error) {
        let preview = '';

        try {
          preview = (await this.clone().text()).slice(0, 200);
        } catch {
          preview = '<unavailable>';
        }

        console.error('Response.json failed in dev runtime.', {
          url: this.url,
          status: this.status,
          preview,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }) as typeof Response.prototype.json;

    globalState.__transpoResponseJsonPatched = true;
  }

  if (
    !globalState.__transpoGlobalErrorPatched &&
    globalState.ErrorUtils?.getGlobalHandler &&
    globalState.ErrorUtils?.setGlobalHandler
  ) {
    const originalGlobalHandler = globalState.ErrorUtils.getGlobalHandler();

    globalState.ErrorUtils.setGlobalHandler((error, isFatal) => {
      console.error('Global JS error intercepted in dev runtime.', {
        isFatal: Boolean(isFatal),
        name: error?.name,
        message: error?.message,
        stack: error?.stack,
      });

      originalGlobalHandler(error, isFatal);
    });

    globalState.__transpoGlobalErrorPatched = true;
  }
}

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
          <Stack.Screen
            name="index"
            options={{
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="register"
            options={{
              title: t('Create Account'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="forgot-password"
            options={{
              title: t('Reset Password'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />

          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          <Stack.Screen
            name="choose-service"
            options={{
              title: t('Choose Service'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="vehicle-details"
            options={{
              title: t('Vehicle Details'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="motorcycle-details"
            options={{
              title: t('Motorcycle Details'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="goods-details"
            options={{
              title: t('Goods Details'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="furniture-details"
            options={{
              title: t('Furniture Details'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen name="vehicle-condition" options={{ title: t('Vehicle Condition') }} />
          <Stack.Screen name="pickup-location" options={{ title: t('Pickup Location') }} />
          <Stack.Screen name="dropoff-location" options={{ title: t('Dropoff Location') }} />
          <Stack.Screen name="date-time" options={{ title: t('Date & Item Details') }} />
          <Stack.Screen name="submit-request" options={{ title: t('Submit Request') }} />
          <Stack.Screen name="request-status" options={{ title: t('Request Status') }} />
          <Stack.Screen name="request-payment" options={{ title: t('Pay Now') }} />
          <Stack.Screen name="payment-method" options={{ title: t('Payment Method') }} />
          <Stack.Screen name="wallet" options={{ title: t('Wallet') }} />
          <Stack.Screen name="wallet-top-up" options={{ title: t('Add Money') }} />
          <Stack.Screen name="chat" options={{ title: t('Chat with Driver') }} />
          <Stack.Screen
            name="customer-tracking"
            options={{
              title: t('Customer Tracking'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="waiting-for-pickup"
            options={{
              title: t('Waiting for Pickup'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="customer-delivery-tracking"
            options={{
              title: t('Delivery Tracking'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="customer-trip-delivered"
            options={{
              title: t('Trip Delivered'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />
          <Stack.Screen
            name="customer-rate-driver"
            options={{
              title: t('Rate Driver'),
              headerStyle: { backgroundColor: '#FAFAFA' },
              headerTintColor: '#111827',
              headerTitleStyle: { color: '#111827' },
              headerShadowVisible: false,
            }}
          />

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
