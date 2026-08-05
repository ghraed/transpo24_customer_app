import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { getApiBaseUrl } from '@/config/backend';

const ACCESS_TOKEN_STORAGE_KEY = 'transpo24.customer.accessToken';
const REFRESH_TOKEN_STORAGE_KEY = 'transpo24.customer.refreshToken';
const USER_STORAGE_KEY = 'transpo24.customer.user';

export type CustomerAuthUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: 'CUSTOMER';
};

export type CustomerSessionResponse = {
  accessToken: string;
  refreshToken: string;
  user: CustomerAuthUser;
  isNewUser: boolean;
  profileCompleted: boolean;
};

export type AuthSessionSnapshot = {
  status: 'initializing' | 'unauthenticated' | 'authenticated' | 'needsProfileCompletion';
  user: CustomerAuthUser | null;
};

let accessToken: string | null = null;
let refreshToken: string | null = null;
let currentUser: CustomerAuthUser | null = null;
let snapshot: AuthSessionSnapshot = { status: 'initializing', user: null };
let hydratePromise: Promise<AuthSessionSnapshot> | null = null;
let refreshPromise: Promise<string | null> | null = null;
const listeners = new Set<() => void>();

function emit(next: AuthSessionSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function subscribeAuthSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthSessionSnapshot(): AuthSessionSnapshot {
  return snapshot;
}

export function useAuthSession(): AuthSessionSnapshot {
  return useSyncExternalStore(
    subscribeAuthSession,
    getAuthSessionSnapshot,
    getAuthSessionSnapshot,
  );
}

export async function hydrateAccessToken(): Promise<string | null> {
  await hydrateAuthSession();
  return accessToken;
}

export async function hydrateAuthSession(): Promise<AuthSessionSnapshot> {
  if (snapshot.status !== 'initializing') return snapshot;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const [storedAccess, storedRefresh, storedUser] = await Promise.all([
        SecureStore.getItemAsync(ACCESS_TOKEN_STORAGE_KEY),
        SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY),
        SecureStore.getItemAsync(USER_STORAGE_KEY),
      ]);
      accessToken = storedAccess;
      refreshToken = storedRefresh;
      currentUser = storedUser ? (JSON.parse(storedUser) as CustomerAuthUser) : null;

      if (refreshToken) {
        const refreshed = await refreshAccessToken();
        if (refreshed) return snapshot;
      }

      if (accessToken && !isJwtExpired(accessToken)) {
        emit({ status: 'authenticated', user: currentUser });
        return snapshot;
      }
    } catch {
      // Invalid or unavailable secure storage is treated as a signed-out session.
    }

    await clearSession();
    return snapshot;
  })();

  return hydratePromise;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export async function setAccessToken(token: string): Promise<void> {
  accessToken = token;
  await SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, token);
  emit({ status: 'authenticated', user: currentUser });
}

export async function setCustomerSession(data: CustomerSessionResponse): Promise<void> {
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
  currentUser = data.user;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, data.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, data.refreshToken),
    SecureStore.setItemAsync(USER_STORAGE_KEY, JSON.stringify(data.user)),
  ]);
  emit({
    status: data.profileCompleted ? 'authenticated' : 'needsProfileCompletion',
    user: data.user,
  });
}

export async function clearAccessToken(): Promise<void> {
  await clearSession();
}

export async function clearSession(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  currentUser = null;
  await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY),
    SecureStore.deleteItemAsync(USER_STORAGE_KEY),
  ]);
  emit({ status: 'unauthenticated', user: null });
}

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  if (!refreshToken) return null;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) throw new Error('Refresh failed');
      const session = (await response.json()) as CustomerSessionResponse;
      if (!session.accessToken || !session.refreshToken) throw new Error('Invalid refresh response');
      await setCustomerSession(session);
      return session.accessToken;
    } catch {
      await clearSession();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function authenticatedFetch(
  endpoint: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetch(endpoint, withCurrentToken(init));
  if (response.status !== 401 || !refreshToken) return response;

  const token = await refreshAccessToken();
  if (!token) return response;
  return fetch(endpoint, withCurrentToken(init));
}

export async function logoutCustomerSession(): Promise<void> {
  const tokenToRevoke = refreshToken;
  try {
    if (tokenToRevoke) {
      await fetch(`${getApiBaseUrl()}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokenToRevoke }),
      });
    }
  } finally {
    await clearSession();
  }
}

export async function markProfileCompleted(name: string): Promise<void> {
  if (currentUser) {
    currentUser = { ...currentUser, name };
    await SecureStore.setItemAsync(USER_STORAGE_KEY, JSON.stringify(currentUser));
  }
  emit({ status: 'authenticated', user: currentUser });
}

function withCurrentToken(init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return { ...init, headers };
}

function isJwtExpired(token: string): boolean {
  try {
    const encodedPayload = token.split('.')[0];
    if (!encodedPayload) return true;
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const payload = JSON.parse(globalThis.atob(padded)) as { exp?: number };
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
