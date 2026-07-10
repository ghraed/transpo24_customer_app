import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_STORAGE_KEY = 'transpo24.customer.accessToken';

let accessToken: string | null = null;
let didHydrateAccessToken = false;
let hydrateAccessTokenPromise: Promise<string | null> | null = null;

export async function hydrateAccessToken(): Promise<string | null> {
  if (didHydrateAccessToken) {
    return accessToken;
  }

  if (!hydrateAccessTokenPromise) {
    hydrateAccessTokenPromise = (async () => {
      try {
        accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_STORAGE_KEY);
      } catch (error) {
        console.warn('Failed to restore access token from secure storage.', error);
        accessToken = null;
      } finally {
        didHydrateAccessToken = true;
      }

      return accessToken;
    })();
  }

  return hydrateAccessTokenPromise;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function setAccessToken(token: string): Promise<void> {
  accessToken = token;
  didHydrateAccessToken = true;

  try {
    await SecureStore.setItemAsync(ACCESS_TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.warn('Failed to persist access token to secure storage.', error);
  }
}

export async function clearAccessToken(): Promise<void> {
  accessToken = null;
  didHydrateAccessToken = true;

  try {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear access token from secure storage.', error);
  }
}
