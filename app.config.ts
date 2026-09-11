import type { ConfigContext } from 'expo/config';
import { readFileSync } from 'node:fs';

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
const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || '';
const EAS_BUILD_PROFILE = process.env.EAS_BUILD_PROFILE?.trim() || '';

if (
  EAS_BUILD_PROFILE === 'production' &&
  !STRIPE_PUBLISHABLE_KEY.startsWith('pk_live_')
) {
  throw new Error(
    'Production builds require EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to be a Stripe live publishable key (pk_live_...).',
  );
}

if (
  EAS_BUILD_PROFILE === 'play-test' &&
  !STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_')
) {
  throw new Error(
    'Play testing builds require EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to be a Stripe test publishable key (pk_test_...).',
  );
}

export default ({ config }: ConfigContext) => {
  const androidPackage = IS_DEV ? 'com.transpo24.app.dev' : config.android?.package;
  let androidGoogleServicesFile = ANDROID_GOOGLE_SERVICES_FILE;
  if (IS_DEV) {
    androidGoogleServicesFile = process.env.EXPO_ANDROID_DEV_GOOGLE_SERVICES_FILE?.trim() || '';
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
