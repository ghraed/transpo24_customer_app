import Constants from 'expo-constants';
import { Platform } from 'react-native';

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
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
  const explicit = process.env.EXPO_PUBLIC_API_URL;
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
  const explicit = process.env.EXPO_PUBLIC_SOCKET_URL;
  if (explicit && explicit.trim().length > 0) {
    return normalizeUrl(explicit);
  }

  return getApiBaseUrl();
}
