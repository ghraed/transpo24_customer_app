import { Platform } from 'react-native';
import appI18n from '@/localization/i18n';

export interface BackendConnectionTarget {
  label: string;
  url: string;
  note?: string;
}

const BACKEND_CONNECTION_TARGETS: readonly BackendConnectionTarget[] = [
  {
    label: 'Android USB device',
    url: 'http://127.0.0.1:3001',
    note: 'use adb reverse',
  },
  {
    label: 'Android emulator',
    url: 'http://10.0.2.2:3001',
  },
  {
    label: 'iOS simulator',
    url: 'http://localhost:3001',
  },
  {
    label: 'Physical device over Wi-Fi',
    url: 'your computer LAN IP',
  },
] as const;

/**
 * Expo Go and development-client sessions execute with __DEV__ enabled. Keep
 * those sessions on the locally running API even though EXPO_PUBLIC_* values
 * are bundled into the app for production builds. On Android, adb reverse
 * makes the device's loopback address reach the development machine.
 */
function getDevelopmentBackendUrl(): string | undefined {
  if (!__DEV__) {
    return undefined;
  }

  return Platform.OS === 'android'
    ? 'http://127.0.0.1:3001'
    : 'http://localhost:3001';
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function formatBackendConnectionTargets(): string {
  return BACKEND_CONNECTION_TARGETS.map((target) =>
    `${target.label}: ${target.url}${target.note ? ` (${target.note})` : ''}`,
  ).join(', ');
}

function readBackendEnvValue(baseName: 'API_URL' | 'SOCKET_URL'): string | undefined {
  const developmentUrl = getDevelopmentBackendUrl();
  if (developmentUrl) {
    return developmentUrl;
  }

  if (Platform.OS === 'android') {
    const androidOverride =
      baseName === 'API_URL'
        ? process.env.EXPO_PUBLIC_ANDROID_API_URL?.trim()
        : process.env.EXPO_PUBLIC_ANDROID_SOCKET_URL?.trim();
    if (androidOverride) {
      return androidOverride;
    }
  }

  return baseName === 'API_URL'
    ? process.env.EXPO_PUBLIC_API_URL?.trim()
    : process.env.EXPO_PUBLIC_SOCKET_URL?.trim();
}

export function createBackendReachabilityError(endpoint: string, envName = 'EXPO_PUBLIC_API_URL'): Error {
  return new Error(
    appI18n.t("Cannot reach backend at {{value0}}. Verify {{value1}} and backend network access. {{value2}}.", { value0: endpoint, value1: envName, value2: formatBackendConnectionTargets() }),
  );
}

export function getApiBaseUrl(): string {
  const explicit = readBackendEnvValue('API_URL');
  if (explicit && explicit.trim().length > 0) {
    return normalizeUrl(explicit);
  }

  throw new Error(appI18n.t("EXPO_PUBLIC_API_URL is missing. Please set it in your environment."));
}

export function getSocketBaseUrl(): string {
  const explicit = readBackendEnvValue('SOCKET_URL');
  if (explicit && explicit.trim().length > 0) {
    return normalizeUrl(explicit);
  }

  return getApiBaseUrl();
}
