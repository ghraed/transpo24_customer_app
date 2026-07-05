import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface BackendConnectionTarget {
  label: string;
  url: string;
  note?: string;
}

const BACKEND_CONNECTION_TARGETS: readonly BackendConnectionTarget[] = [
  {
    label: 'Android USB device',
    url: 'http://127.0.0.1:3000',
    note: 'use adb reverse',
  },
  {
    label: 'Android emulator',
    url: 'http://10.0.2.2:3000',
  },
  {
    label: 'iOS simulator',
    url: 'http://localhost:3000',
  },
  {
    label: 'Physical device over Wi-Fi',
    url: 'your computer LAN IP',
  },
] as const;

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function formatBackendConnectionTargets(): string {
  return BACKEND_CONNECTION_TARGETS.map((target) =>
    `${target.label}: ${target.url}${target.note ? ` (${target.note})` : ''}`,
  ).join(', ');
}

function readBackendEnvValue(baseName: 'API_URL' | 'SOCKET_URL'): string | undefined {
  if (__DEV__ && Platform.OS === 'android') {
    const androidOverride = process.env[`EXPO_PUBLIC_ANDROID_${baseName}`]?.trim();
    if (androidOverride) {
      return androidOverride;
    }
  }

  return process.env[`EXPO_PUBLIC_${baseName}`]?.trim();
}

function getDevServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri?.trim();
  if (!hostUri) {
    return null;
  }

  const host = hostUri.split(':')[0]?.trim();
  return host || null;
}

export function createBackendReachabilityError(endpoint: string, envName = 'EXPO_PUBLIC_API_URL'): Error {
  return new Error(
    `Cannot reach backend at ${endpoint}. Verify ${envName} and backend network access. ${formatBackendConnectionTargets()}.`,
  );
}

export function getApiBaseUrl(): string {
  const explicit = readBackendEnvValue('API_URL');
  if (explicit && explicit.trim().length > 0) {
    return normalizeUrl(explicit);
  }

  const devHost = getDevServerHost();
  if (devHost) {
    return `http://${devHost}:3000`;
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }

  return 'http://localhost:3000';
}

export function getSocketBaseUrl(): string {
  const explicit = readBackendEnvValue('SOCKET_URL');
  if (explicit && explicit.trim().length > 0) {
    return normalizeUrl(explicit);
  }

  return getApiBaseUrl();
}
