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

jest.mock('./private-cache', () => ({ clearPrivateCache: jest.fn(async () => undefined) }));

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

  it('persists the nickname in both session copies after completion and profile edits', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession({ ...session, profileCompleted: false });
    await auth.markProfileCompleted('Private Name', 'LB', 'Road Runner');
    expect(auth.getAuthSessionSnapshot().user?.nickname).toBe('Road Runner');
    expect(auth.getAuthSessionSnapshot().status).toBe('authenticated');
    const trusted = JSON.parse(mockStorage.get('transpo24.customer.trustedSession')!);
    expect(trusted.user.nickname).toBe('Road Runner');
    expect(trusted.profileCompleted).toBe(true);
    await auth.updateCustomerSessionProfile({ name: 'Private Name', countryCode: 'LB', nickname: 'New Nickname' });
    expect(JSON.parse(mockStorage.get('transpo24.customer.user')!).nickname).toBe('New Nickname');
    expect(JSON.parse(mockStorage.get('transpo24.customer.trustedSession')!).user.nickname).toBe('New Nickname');
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


describe('market and account isolation', () => {
  beforeEach(() => { mockStorage.clear(); jest.resetModules(); globalThis.fetch = jest.fn<typeof fetch>(); });
  it('does not restore a trusted customer through another market', async () => {
    const auth = loadAuth();
    mockStorage.set('transpo24.customer.trustedSession', JSON.stringify({ ...session, user: { ...session.user, tenant: { code: 'FR' } } }));
    await expect(auth.restoreTrustedCustomerSession('LB')).resolves.toEqual({ status: 'marketMismatch' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(auth.getAccessToken()).toBeNull();
  });
  it('cannot resurrect a logged-out session with a late refresh response', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession(session);
    let finish!: (value: Response) => void;
    jest.mocked(globalThis.fetch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const refreshing = auth.refreshAccessToken();
    await auth.clearSession();
    finish(response(200, session));
    await expect(refreshing).resolves.toBeNull();
    expect(auth.getAccessToken()).toBeNull();
  });
  it('does not retry the previous account request with the next account token', async () => {
    const auth = loadAuth();
    await auth.setCustomerSession(session);
    let finish!: (value: Response) => void;
    jest.mocked(globalThis.fetch).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const request = auth.authenticatedFetch('http://api.test/customer/home', { method: 'GET' });
    await auth.setCustomerSession({ ...session, user: { ...session.user, id: 'customer-2' } });
    finish(response(401));
    await expect(request).rejects.toThrow('Session changed');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  it('clears private caches on logout and direct account replacement', async () => {
    const auth = loadAuth();
    const { clearPrivateCache } = jest.requireMock('./private-cache') as { clearPrivateCache: ReturnType<typeof jest.fn> };
    await auth.setCustomerSession(session);
    await auth.setCustomerSession({ ...session, user: { ...session.user, id: 'customer-2' } });
    expect(clearPrivateCache).toHaveBeenCalledWith('customer-1');
    await auth.switchCustomerAccountOnDevice();
    expect(clearPrivateCache).toHaveBeenCalledWith('customer-2');
  });
});

it.each([false, true])('restores unexpired legacy/JWT access tokens (JWT=%s)', async (jwt) => {
  mockStorage.clear(); jest.resetModules();
  const payload = globalThis.btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }));
  const token = jwt ? `header.${payload}.signature` : `${payload}.signature`;
  mockStorage.set('transpo24.customer.accessToken', token);
  mockStorage.set('transpo24.customer.user', JSON.stringify(session.user));
  const auth = loadAuth();
  await auth.hydrateAuthSession();
  expect(auth.getAccessToken()).toBe(token);
});
