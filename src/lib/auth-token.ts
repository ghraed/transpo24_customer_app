import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { getApiBaseUrl } from '@/config/backend';

const ACCESS_TOKEN_STORAGE_KEY = 'transpo24.customer.accessToken';
const REFRESH_TOKEN_STORAGE_KEY = 'transpo24.customer.refreshToken';
const USER_STORAGE_KEY = 'transpo24.customer.user';
const TRUSTED_SESSION_STORAGE_KEY = 'transpo24.customer.trustedSession';

export type CustomerAuthUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  countryCode: string | null;
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

export type TrustedSessionRestoreResult =
  | { status: 'restored' }
  | { status: 'invalid' }
  | { status: 'unavailable'; message: string };

type RefreshFailure = {
  kind: 'invalid' | 'unavailable';
  message: string;
};

let accessToken: string | null = null;
let refreshToken: string | null = null;
let currentUser: CustomerAuthUser | null = null;
let snapshot: AuthSessionSnapshot = { status: 'initializing', user: null };
let hydratePromise: Promise<AuthSessionSnapshot> | null = null;
let refreshPromise: Promise<string | null> | null = null;
let lastRefreshFailure: RefreshFailure | null = null;
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
    SecureStore.setItemAsync(TRUSTED_SESSION_STORAGE_KEY, JSON.stringify(data)),
  ]);
  emit({
    status: data.profileCompleted ? 'authenticated' : 'needsProfileCompletion',
    user: data.user,
  });
}

export async function getTrustedCustomer(): Promise<CustomerAuthUser | null> {
  try {
    const storedSession = await readTrustedSession();
    return storedSession?.user ?? null;
  } catch {
    return null;
  }
}

export async function restoreTrustedCustomerSession(): Promise<TrustedSessionRestoreResult> {
  try {
    const storedSession = await readTrustedSession();
    if (!storedSession) return { status: 'invalid' };

    refreshToken = storedSession.refreshToken;
    const refreshedToken = await refreshAccessToken();

    if (refreshedToken) return { status: 'restored' };
    if (lastRefreshFailure?.kind === 'unavailable') {
      return { status: 'unavailable', message: lastRefreshFailure.message };
    }

    return { status: 'invalid' };
  } catch (error) {
    return {
      status: 'unavailable',
      message: error instanceof Error ? error.message : 'Unable to read the saved session.',
    };
  }
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
    lastRefreshFailure = null;
    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          lastRefreshFailure = {
            kind: 'invalid',
            message: 'The saved session is no longer valid.',
          };
        } else {
          lastRefreshFailure = {
            kind: 'unavailable',
            message: 'The server is temporarily unavailable. Please try again.',
          };
        }
        throw new Error('Refresh failed');
      }
      const session = (await response.json()) as CustomerSessionResponse;
      if (!session.accessToken || !session.refreshToken) throw new Error('Invalid refresh response');
      await setCustomerSession(session);
      return session.accessToken;
    } catch (error) {
      if (!lastRefreshFailure) {
        lastRefreshFailure = {
          kind: 'unavailable',
          message: error instanceof Error ? error.message : 'Unable to reach the server.',
        };
      }

      await clearSession();
      if (lastRefreshFailure.kind === 'invalid') {
        await SecureStore.deleteItemAsync(TRUSTED_SESSION_STORAGE_KEY);
      }
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
    await SecureStore.deleteItemAsync(TRUSTED_SESSION_STORAGE_KEY);
  }
}

// Account switching keeps this device's verified session available for Continue.
export async function switchCustomerAccountOnDevice(): Promise<void> {
  await clearSession();
}

export async function markProfileCompleted(name: string, countryCode: string): Promise<void> {
  if (currentUser) {
    currentUser = { ...currentUser, name, countryCode };
    await SecureStore.setItemAsync(USER_STORAGE_KEY, JSON.stringify(currentUser));
  }
  emit({ status: 'authenticated', user: currentUser });
}

export async function updateCustomerSessionProfile(input: {
  name: string;
  countryCode: string;
}): Promise<void> {
  if (!currentUser) {
    return;
  }

  currentUser = { ...currentUser, name: input.name, countryCode: input.countryCode };

  const trustedSession = await readTrustedSession();
  const nextTrustedSession = trustedSession
    ? {
        ...trustedSession,
        user: {
          ...trustedSession.user,
          name: input.name,
          countryCode: input.countryCode,
        },
      }
    : null;

  await Promise.all([
    SecureStore.setItemAsync(USER_STORAGE_KEY, JSON.stringify(currentUser)),
    nextTrustedSession
      ? SecureStore.setItemAsync(TRUSTED_SESSION_STORAGE_KEY, JSON.stringify(nextTrustedSession))
      : Promise.resolve(),
  ]);

  emit({ status: snapshot.status, user: currentUser });
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

async function readTrustedSession(): Promise<CustomerSessionResponse | null> {
  const rawSession = await SecureStore.getItemAsync(TRUSTED_SESSION_STORAGE_KEY);
  if (!rawSession) return null;

  try {
    const session = JSON.parse(rawSession) as Partial<CustomerSessionResponse>;
    if (
      typeof session.accessToken !== 'string' ||
      typeof session.refreshToken !== 'string' ||
      !session.user ||
      typeof session.user.id !== 'string' ||
      typeof session.user.phoneNumber !== 'string' ||
      typeof session.profileCompleted !== 'boolean'
    ) {
      throw new Error('Invalid trusted session');
    }
    return session as CustomerSessionResponse;
  } catch {
    await SecureStore.deleteItemAsync(TRUSTED_SESSION_STORAGE_KEY);
    return null;
  }
}
