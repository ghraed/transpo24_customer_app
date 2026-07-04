import Constants from 'expo-constants';
import { Platform } from 'react-native';

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function readBackendEnvValue(baseName: 'API_URL' | 'SOCKET_URL'): string | undefined {
  if (Platform.OS === 'android') {
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
