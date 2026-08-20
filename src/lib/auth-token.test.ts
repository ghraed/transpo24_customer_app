import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockStorage = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
}));

jest.mock('@/config/backend', () => ({ getApiBaseUrl: () => 'http://api.test' }));

const session = {
  accessToken: 'new-access-token',
  refreshToken: 'new-refresh-token',
  user: {
    id: 'customer-1',
    name: 'Customer',
    email: 'internal@example.com',
    phoneNumber: '+96170123456',
    countryCode: 'LB',
    role: 'CUSTOMER' as const,
  },
  isNewUser: false,
  profileCompleted: true,
};

function response(status: number, body?: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: jest.fn(async () => body) } as unknown as Response;
}

function loadAuth(): typeof import('./auth-token') {
  return jest.requireActual('./auth-token') as typeof import('./auth-token');
}

describe('customer session persistence', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.resetModules();
    globalThis.fetch = jest.fn<typeof fetch>();
  });

  it('stores access, refresh, and user data securely after verification', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession(session);
    expect(mockStorage.get('transpo24.customer.accessToken')).toBe(session.accessToken);
    expect(mockStorage.get('transpo24.customer.refreshToken')).toBe(session.refreshToken);
    expect(mockStorage.get('transpo24.customer.trustedSession')).toBe(JSON.stringify(session));
    expect(auth.getAuthSessionSnapshot().status).toBe('authenticated');
  });

  it('restores a session by rotating the stored refresh token', async () => {
    mockStorage.set('transpo24.customer.refreshToken', 'stored-refresh');
    jest.mocked(globalThis.fetch).mockResolvedValue(response(200, session));
    const auth = loadAuth();
    await auth.hydrateAuthSession();
    expect(auth.getAccessToken()).toBe(session.accessToken);
    expect(auth.getAuthSessionSnapshot().status).toBe('authenticated');
  });

  it('coalesces simultaneous refresh requests', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession({ ...session, refreshToken: 'old-refresh' });
    jest.mocked(globalThis.fetch).mockResolvedValue(response(200, session));
    await Promise.all([auth.refreshAccessToken(), auth.refreshAccessToken()]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a 401 and retries the original request once', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession({ ...session, refreshToken: 'old-refresh' });
    jest.mocked(globalThis.fetch)
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200, session))
      .mockResolvedValueOnce(response(200));

    const result = await auth.authenticatedFetch('http://api.test/customer/home', {
      method: 'GET',
    });

    expect(result.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it('clears the local session when refresh fails', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession(session);
    jest.mocked(globalThis.fetch).mockResolvedValue(response(401));
    await auth.refreshAccessToken();
    expect(auth.getAuthSessionSnapshot().status).toBe('unauthenticated');
    expect(mockStorage.size).toBe(0);
  });

  it('keeps the trusted device when refresh is temporarily unavailable', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession(session);
    jest.mocked(globalThis.fetch).mockResolvedValue(response(503));

    await auth.refreshAccessToken();

    expect(auth.getAuthSessionSnapshot().status).toBe('unauthenticated');
    expect(mockStorage.get('transpo24.customer.trustedSession')).toBe(JSON.stringify(session));
  });

  it('revokes and clears the session on explicit logout', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession(session);
    jest.mocked(globalThis.fetch).mockResolvedValue(response(200));
    await auth.logoutCustomerSession();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api.test/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(auth.getAuthSessionSnapshot().status).toBe('unauthenticated');
    expect(mockStorage.size).toBe(0);
  });

  it('keeps a verified session available when switching accounts on this device', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession(session);
    await auth.switchCustomerAccountOnDevice();
    expect(auth.getAuthSessionSnapshot().status).toBe('unauthenticated');
    expect(mockStorage.get('transpo24.customer.trustedSession')).toBe(JSON.stringify(session));
  });

  it('restores a trusted session by refreshing its stored credential', async () => {
    mockStorage.set('transpo24.customer.trustedSession', JSON.stringify({ ...session, refreshToken: 'trusted-refresh' }));
    jest.mocked(globalThis.fetch).mockResolvedValue(response(200, session));
    const auth = loadAuth();
    await expect(auth.restoreTrustedCustomerSession()).resolves.toEqual({ status: 'restored' });
    expect(auth.getAuthSessionSnapshot().status).toBe('authenticated');
  });

  it('keeps the continue option after a transient trusted-session failure', async () => {
    mockStorage.set('transpo24.customer.trustedSession', JSON.stringify(session));
    jest.mocked(globalThis.fetch).mockRejectedValue(new Error('Network unavailable'));
    const auth = loadAuth();

    await expect(auth.restoreTrustedCustomerSession()).resolves.toEqual({
      status: 'unavailable',
      message: 'Network unavailable',
    });
    expect(mockStorage.get('transpo24.customer.trustedSession')).toBe(JSON.stringify(session));
  });
});
