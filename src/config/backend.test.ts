import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { getApiBaseUrl, getSocketBaseUrl } from './backend';

jest.mock('@/localization/i18n', () => ({
  __esModule: true,
  default: { t: (message: string) => message },
}));

const envKeys = [
  'EXPO_PUBLIC_ANDROID_API_URL', 'EXPO_PUBLIC_ANDROID_SOCKET_URL',
  'EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SOCKET_URL',
] as const;
const originalEnv = { ...process.env };
const originalPlatform = Platform.OS;

describe('backend environment selection', () => {
  beforeEach(() => {
    Platform.OS = 'android';
    delete process.env.EXPO_PUBLIC_ANDROID_API_URL;
    delete process.env.EXPO_PUBLIC_ANDROID_SOCKET_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_SOCKET_URL;
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    Platform.OS = originalPlatform;
  });

  it('honors configured Android URLs during development instead of hardcoded loopback', () => {
    process.env.EXPO_PUBLIC_ANDROID_API_URL = 'http://192.168.1.50:4000/';
    process.env.EXPO_PUBLIC_ANDROID_SOCKET_URL = 'http://192.168.1.50:4001/';
    process.env.EXPO_PUBLIC_API_URL = 'https://generic.example';
    expect(getApiBaseUrl()).toBe('http://192.168.1.50:4000');
    expect(getSocketBaseUrl()).toBe('http://192.168.1.50:4001');
  });

  it('uses generic URLs on iOS and falls back to the API for sockets', () => {
    Platform.OS = 'ios';
    process.env.EXPO_PUBLIC_ANDROID_API_URL = 'http://127.0.0.1:3001';
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3001/';
    expect(getApiBaseUrl()).toBe('http://localhost:3001');
    expect(getSocketBaseUrl()).toBe('http://localhost:3001');
  });

  it('reports missing configuration instead of silently choosing a server', () => {
    expect(() => getApiBaseUrl()).toThrow('EXPO_PUBLIC_API_URL is missing');
  });
});
