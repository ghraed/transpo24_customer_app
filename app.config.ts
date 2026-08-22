import type { ConfigContext } from 'expo/config';

const MAPS_ANDROID_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ?? '';
const MAPS_IOS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ?? '';
const ANDROID_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  '';
const IOS_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_IOS_GOOGLE_SERVICES_FILE?.trim() ||
  '';
const STRIPE_MERCHANT_IDENTIFIER =
  process.env.EXPO_PUBLIC_STRIPE_MERCHANT_IDENTIFIER?.trim() ||
  process.env.EXPO_STRIPE_MERCHANT_IDENTIFIER?.trim() ||
  '';

export default ({ config }: ConfigContext) => {
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
      ...(ANDROID_GOOGLE_SERVICES_FILE ? { googleServicesFile: ANDROID_GOOGLE_SERVICES_FILE } : {}),
      config: {
        ...config.android?.config,
        googleMaps: {
          ...config.android?.config?.googleMaps,
          apiKey: MAPS_ANDROID_KEY,
        },
      },
    },
    plugins: [
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
