import type { ConfigContext } from 'expo/config';

const MAPS_ANDROID_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ?? '';
const MAPS_IOS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY ?? '';
const EAS_PROJECT_ID =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim() ||
  process.env.EXPO_EAS_PROJECT_ID?.trim() ||
  '';
const ANDROID_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_ANDROID_GOOGLE_SERVICES_FILE?.trim() ||
  '';
const IOS_GOOGLE_SERVICES_FILE =
  process.env.EXPO_PUBLIC_IOS_GOOGLE_SERVICES_FILE?.trim() ||
  process.env.EXPO_IOS_GOOGLE_SERVICES_FILE?.trim() ||
  '';

export default ({ config }: ConfigContext) => {
  const existingPlugins = Array.isArray(config.plugins) ? config.plugins : [];
  const pluginsWithoutReactNativeMaps = existingPlugins.filter((plugin) => {
    if (typeof plugin === 'string') {
      return plugin !== 'react-native-maps';
    }

    if (Array.isArray(plugin)) {
      return plugin[0] !== 'react-native-maps';
    }

    return true;
  });

  return {
    ...config,
    extra: {
      ...config.extra,
      eas: {
        ...config.extra?.eas,
        ...(EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : {}),
      },
    },
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
      ...pluginsWithoutReactNativeMaps,
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
