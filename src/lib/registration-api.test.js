import { extractRegistrationCard } from './api';
import { REGISTRATION_FIELDS } from '@/types/registration';
import { AppState } from 'react-native';
import { authenticatedFetch, refreshAccessToken } from './auth-token';

let mockOwner = 'customer';
jest.mock('@/lib/auth-token', () => ({
  getAccessToken: () => 'synthetic-access-token',
  getAuthSessionSnapshot: () => ({ user: { id: mockOwner } }),
  refreshAccessToken: jest.fn(async () => 'refreshed'),
  authenticatedFetch: jest.fn(),
}));
jest.mock('@/config/backend', () => ({
  getApiBaseUrl: () => 'https://api.test',
  createBackendReachabilityError: jest.fn(),
}));
jest.mock('@/localization/i18n', () => ({
  __esModule: true,
  default: { t: (value) => value },
}));
const { default: NativeFormData } = jest.requireActual(
  'react-native/Libraries/Network/FormData',
);
const originalXhr = global.XMLHttpRequest;
const originalForm = global.FormData;
const response = () => ({
  status: 'partial',
  fields: Object.fromEntries(
    REGISTRATION_FIELDS.map((name) => [
      name,
      { value: null, status: 'missing', evidence: [] },
    ]),
  ),
  missingFields: [...REGISTRATION_FIELDS],
  warnings: [],
});
const jobId = '00000000-0000-4000-8000-000000000001';
const job = (status = 'queued', extra = {}) => ({ jobId, status, expiresAt: new Date(Date.now() + 300000).toISOString(), ...extra });
const originalFetch = global.fetch;
let appStateListener;
let instances;
let replies;
beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  mockOwner = 'customer';
  instances = [];
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { appStateListener = listener; return { remove: jest.fn() }; });
  Object.defineProperty(AppState, 'currentState', { configurable: true, writable: true, value: 'active' });
  global.fetch = jest.fn(async () => ({ ok: true }));
  authenticatedFetch.mockResolvedValue({ ok: true, status: 200, json: async () => job('completed', { result: response() }) });
  replies = [{ status: 202, body: job() }];
  global.FormData = NativeFormData;
  global.XMLHttpRequest = jest.fn(() => {
    const reply = replies.shift();
    const xhr = {
      status: reply.status,
      responseText:
        typeof reply.body === 'string'
          ? reply.body
          : JSON.stringify(reply.body),
      upload: {},
      open: jest.fn(),
      setRequestHeader: jest.fn(),
      timeout: 0,
      send: jest.fn(() => {
        if (!reply.pending)
          Promise.resolve().then(() => {
            xhr.upload.onprogress?.({
              lengthComputable: true,
              loaded: 10,
              total: 20,
            });
            xhr.upload.onload?.();
            xhr.onload();
          });
      }),
      abort: jest.fn(() => xhr.onabort()),
    };
    instances.push(xhr);
    return xhr;
  });
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
  jest.restoreAllMocks();
  global.XMLHttpRequest = originalXhr;
  global.FormData = originalForm;
});
const photo = {
  uri: 'file:///cache/registration.jpg',
  fileName: 'registration.jpg',
  mimeType: 'image/jpeg',
};
it('uploads authenticated native multipart with progress and parses the typed contract', async () => {
  const onProgress = jest.fn();
  const pending = extractRegistrationCard([photo], { signal: new AbortController().signal, onProgress });
  await jest.advanceTimersByTimeAsync(2000);
  await expect(pending).resolves.toMatchObject({ status: 'partial' });
  expect(console.info).toHaveBeenCalledWith('[RegistrationScan] Sending scan', { apiOrigin: 'https://api.test' });
  expect(instances[0].open).toHaveBeenCalledWith(
    'POST',
    'https://api.test/vehicles/registration-extractions',
  );
  expect(instances[0].setRequestHeader).toHaveBeenCalledWith(
    'Authorization',
    'Bearer synthetic-access-token',
  );
  expect(instances[0].setRequestHeader).not.toHaveBeenCalledWith(
    'Content-Type',
    expect.anything(),
  );
  expect(instances[0].send.mock.calls[0][0].getParts()[0]).toMatchObject({
    fieldName: 'images',
    uri: photo.uri,
    type: 'image/jpeg',
  });
  expect(instances[0].timeout).toBe(30000);
  expect(onProgress).toHaveBeenCalledWith(0.5);
  expect(onProgress).toHaveBeenCalledWith(1);
});
it('refreshes authentication once without retrying other failures', async () => {
  replies = [
    { status: 401, body: {} },
    { status: 202, body: job('completed', { result: response() }) },
  ];
  await extractRegistrationCard([photo], {
    signal: new AbortController().signal,
  });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(instances).toHaveLength(2);
});
it('accepts an evidence-backed weight with the original multilingual source label', async () => {
  const body = response();
  body.fields.emptyWeightKg = { value: 1607, status: 'extracted', evidence: [{
    imageIndex: 0, label: 'Leergewicht / Poids à vide', printedValue: '**1607', unit: 'kg', meaning: 'empty_weight',
  }] };
  replies = [{ status: 202, body: job('completed', { result: body }) }];
  const extracted = await extractRegistrationCard([photo], { signal: new AbortController().signal });
  expect(extracted.fields.emptyWeightKg.value).toBe(1607);
  expect(extracted.fields.emptyWeightKg.evidence[0].meaning).toBe('empty_weight');
});
it.each(['{broken', {}, { status: 'partial', fields: {} }])(
  'rejects malformed or incomplete successful output',
  async (body) => {
    replies = [{ status: 202, body: job('completed', { result: body }) }];
    await expect(
      extractRegistrationCard([photo], {
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_INVALID_OUTPUT' });
    expect(instances).toHaveLength(1);
  },
);
it('preserves safe provider error codes', async () => {
  replies = [
    {
      status: 429,
      body: {
        code: 'REGISTRATION_RATE_LIMIT',
        message: 'Do not display raw provider data',
      },
    },
  ];
  await expect(
    extractRegistrationCard([photo], { signal: new AbortController().signal }),
  ).rejects.toMatchObject({
    code: 'REGISTRATION_RATE_LIMIT',
    message: 'REGISTRATION_RATE_LIMIT',
  });
  expect(refreshAccessToken).not.toHaveBeenCalled();
});
it('aborts an in-flight native upload', async () => {
  replies = [{ status: 202, body: job(), pending: true }];
  const abort = new AbortController();
  const promise = extractRegistrationCard([photo], { signal: abort.signal });
  await Promise.resolve();
  abort.abort();
  await expect(promise).rejects.toMatchObject({
    code: 'REGISTRATION_CANCELLED',
  });
  expect(instances[0].abort).toHaveBeenCalled();
});
it('discards a response arriving after an account change', async () => {
  replies = [{ status: 202, body: job(), pending: true }];
  const promise = extractRegistrationCard([photo], {
    signal: new AbortController().signal,
  });
  await Promise.resolve();
  mockOwner = 'another-customer';
  instances[0].onload();
  await expect(promise).rejects.toMatchObject({
    code: 'REGISTRATION_CANCELLED',
  });
  expect(refreshAccessToken).not.toHaveBeenCalled();
});

it('polls queued then processing, without uploading again', async () => {
  const onStatus = jest.fn();
  authenticatedFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => job('processing') });
  const pending = extractRegistrationCard([photo], { signal: new AbortController().signal, onStatus });
  await jest.advanceTimersByTimeAsync(4000);
  await expect(pending).resolves.toMatchObject({ status: 'partial' });
  expect(onStatus.mock.calls.map(call => call[0])).toEqual(['queued', 'processing']);
  expect(authenticatedFetch).toHaveBeenCalledTimes(2);
  expect(instances).toHaveLength(1);
});
it('cancels the accepted job after aborting while queued', async () => {
  const abort = new AbortController();
  const pending = extractRegistrationCard([photo], { signal: abort.signal });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'REGISTRATION_CANCELLED' });
  await jest.advanceTimersByTimeAsync(1);
  abort.abort();
  await rejected;
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(jobId), expect.objectContaining({ method: 'DELETE' }));
  expect(authenticatedFetch).not.toHaveBeenCalled();
});
it('pauses polling in the background and resumes immediately on foreground', async () => {
  AppState.currentState = 'background';
  const pending = extractRegistrationCard([photo], { signal: new AbortController().signal });
  await jest.advanceTimersByTimeAsync(10000);
  expect(authenticatedFetch).not.toHaveBeenCalled();
  AppState.currentState = 'active';
  appStateListener('active');
  await jest.advanceTimersByTimeAsync(1);
  await pending;
  expect(authenticatedFetch).toHaveBeenCalledTimes(1);
});
it('does not overlap slow status requests', async () => {
  let resolveStatus;
  authenticatedFetch.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
  const pending = extractRegistrationCard([photo], { signal: new AbortController().signal });
  await jest.advanceTimersByTimeAsync(10000);
  expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  resolveStatus({ ok: true, status: 200, json: async () => job('completed', { result: response() }) });
  await pending;
});
it('expires a backgrounded job after five minutes and requests cancellation', async () => {
  AppState.currentState = 'background';
  const pending = extractRegistrationCard([photo], { signal: new AbortController().signal });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'REGISTRATION_TIMEOUT' });
  await jest.advanceTimersByTimeAsync(300000);
  await rejected;
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(jobId), expect.objectContaining({ method: 'DELETE' }));
});

it('keeps cancellation available after completion while the UI confirms its action', async () => {
  const accepted = jest.fn();
  replies = [{ status: 202, body: job('completed', { result: response() }) }];
  await extractRegistrationCard([photo], { signal: new AbortController().signal, onAccepted: accepted });
  await accepted.mock.calls[0][0]();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(jobId), expect.objectContaining({ method: 'DELETE' }));
});
it('does not re-upload after an ambiguous network failure', async () => {
  replies = [{ status: 202, body: job(), pending: true }];
  const pending = extractRegistrationCard([photo], { signal: new AbortController().signal });
  const rejected = expect(pending).rejects.toMatchObject({ code: 'REGISTRATION_UNAVAILABLE' });
  await Promise.resolve();
  instances[0].onerror();
  await rejected;
  expect(instances).toHaveLength(1);
  expect(refreshAccessToken).not.toHaveBeenCalled();
});
