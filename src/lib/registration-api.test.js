import { extractRegistrationCard } from './api';
import { REGISTRATION_FIELDS } from '@/types/registration';
import { refreshAccessToken } from './auth-token';

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
let instances;
let replies;
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = 'customer';
  instances = [];
  replies = [{ status: 201, body: response() }];
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
          queueMicrotask(() => {
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
  await expect(
    extractRegistrationCard([photo], {
      signal: new AbortController().signal,
      onProgress,
    }),
  ).resolves.toMatchObject({ status: 'partial' });
  expect(instances[0].open).toHaveBeenCalledWith(
    'POST',
    'https://api.test/vehicles/extract-registration',
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
  expect(instances[0].timeout).toBeLessThanOrEqual(90000);
  expect(onProgress).toHaveBeenCalledWith(0.5);
  expect(onProgress).toHaveBeenCalledWith(1);
});
it('refreshes authentication once without retrying other failures', async () => {
  replies = [
    { status: 401, body: {} },
    { status: 201, body: response() },
  ];
  await extractRegistrationCard([photo], {
    signal: new AbortController().signal,
  });
  expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  expect(instances).toHaveLength(2);
});
it.each(['{broken', {}, { status: 'partial', fields: {} }])(
  'rejects malformed or incomplete successful output',
  async (body) => {
    replies = [{ status: 201, body }];
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
  replies = [{ status: 201, body: response(), pending: true }];
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
  replies = [{ status: 201, body: response(), pending: true }];
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
