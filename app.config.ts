import type { ConfigContext } from 'expo/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolveStripePublishableKey } from './config/stripe';

const IS_DEV = process.env.APP_VARIANT === 'development';

const MAPS_ANDROID_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ?? '';
const MAPS_IOS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ?? '';
const ANDROID_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  './google-services.json';
const IOS_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_IOS_GOOGLE_SERVICES_FILE?.trim() ||
  '';
const STRIPE_MERCHANT_IDENTIFIER =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER?.trim() ||
  process.env.EXPO_STRIPE_MERCHANT_IDENTIFIER?.trim() ||
  '';
const EAS_BUILD_PROFILE = process.env.EAS_BUILD_PROFILE?.trim() || '';
const IS_PRODUCTION_PROFILE = EAS_BUILD_PROFILE.startsWith('production');
const STRIPE_PUBLISHABLE_KEY = resolveStripePublishableKey({
  mode: process.env.EXPO_PUBLIC_STRIPE_MODE,
  testKey: process.env.EXPO_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY,
  liveKey: process.env.EXPO_PUBLIC_STRIPE_LIVE_PUBLISHABLE_KEY,
  legacyKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  defaultMode: EAS_BUILD_PROFILE === 'play-test' ? 'test' : 'live',
  required: IS_PRODUCTION_PROFILE || EAS_BUILD_PROFILE === 'play-test',
});

if (
  EAS_BUILD_PROFILE === 'play-test' &&
  !STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')
) {
  throw new Error(
    'Play testing builds require EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to be a Stripe test publishable key (pk_test_...).',
  );
}

export default ({ config }: ConfigContext) => {
  // These guards run only for iOS production workers; Android profiles are unaffected.
  if (process.env.EAS_BUILD_PLATFORM === 'ios' && IS_PRODUCTION_PROFILE) {
    if (IS_DEV) {
      throw new Error('iOS production builds must not use APP_VARIANT=development.');
    }
    if (!MAPS_IOS_KEY.trim() || MAPS_IOS_KEY.startsWith('replace_')) {
      throw new Error('iOS production builds require EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY in the EAS production environment.');
    }
    if (config.ios?.bundleIdentifier !== 'com.transpo24.app') {
      throw new Error('iOS production builds must use bundle identifier com.transpo24.app.');
    }
  }
  const androidPackage = IS_DEV ? 'com.transpo24.app.dev' : config.android?.package;
  let androidGoogleServicesFile = ANDROID_GOOGLE_SERVICES_FILE;
  if (IS_DEV) {
    androidGoogleServicesFile = process.env.EXPO_ANDROID_DEV_GOOGLE_SERVICES_FILE?.trim() ||
      (existsSync('./google-services.dev.json') ? './google-services.dev.json' : '');
    if (androidGoogleServicesFile) {
      const services = JSON.parse(readFileSync(androidGoogleServicesFile, 'utf8'));
      if (!services.client?.some((client: { client_info?: { android_client_info?: { package_name?: string } } }) =>
        client.client_info?.android_client_info?.package_name === androidPackage,
      )) {
        throw new Error('Dev Firebase configuration must register com.transpo24.app.dev.');
      }
    }
  }
  // Validate on the Android build worker, where EAS file variables exist.
  if (process.env.EAS_BUILD_PLATFORM === 'android' && !IS_DEV) {
    const services = JSON.parse(readFileSync(androidGoogleServicesFile, 'utf8'));
    if (!services.client?.some((client: { client_info?: { android_client_info?: { package_name?: string } } }) =>
      client.client_info?.android_client_info?.package_name === androidPackage,
    )) {
      throw new Error(`Firebase configuration must register ${androidPackage} for push notifications.`);
    }
  }
  const existingPlugins = Array.isArray(config.plugins) ? config.plugins : [];
  const pluginsWithoutManagedOverrides = existingPlugins.filter((plugin) => {
    if (typeof plugin === 'string') {
      return (
        plugin !== 'react-native-maps' &&
        plugin !== '@stripe/stripe-react-native' &&
        plugin !== 'expo-secure-store'
      );
    }

    if (Array.isArray(plugin)) {
      return (
        plugin[0] !== 'react-native-maps' &&
        plugin[0] !== '@stripe/stripe-react-native' &&
        plugin[0] !== 'expo-secure-store'
      );
    }

    return true;
  });

  return {
    ...config,
    ...(IS_DEV ? {
      name: 'Transpo24 Dev',
      scheme: 'transpo24-dev',
      updates: { ...config.updates, enabled: false },
    } : {}),
    ios: {
      ...config.ios,
      ...(IS_DEV ? { bundleIdentifier: 'com.transpo24.app.dev' } : {}),
      ...(IOS_GOOGLE_SERVICES_FILE ? { googleServicesFile: IOS_GOOGLE_SERVICES_FILE } : {}),
      config: {
        ...config.ios?.config,
        googleMapsApiKey: MAPS_IOS_KEY,
      },
    },
    android: {
      ...config.android,
      package: androidPackage,
      googleServicesFile: androidGoogleServicesFile || undefined,
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: MAPS_ANDROID_KEY,
        },
      },
    },
    plugins: [
      'expo-sharing',
      ...pluginsWithoutManagedOverrides,
      'expo-secure-store',
      [
        '@stripe/stripe-react-native',
        {
          enableGooglePay: true,
          ...(STRIPE_MERCHANT_IDENTIFIER
            ? { merchantIdentifier: STRIPE_MERCHANT_IDENTIFIER }
            : {}),
        },
      ],
      [
        'react-native-maps',
        {
          androidGoogleMapsApiKey: MAPS_ANDROID_KEY,
          iosGoogleMapsApiKey: MAPS_IOS_KEY,
        },
      ],
    ],
  };
};
