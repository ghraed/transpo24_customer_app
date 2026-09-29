import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { translateDynamicBatch, translateDynamicText } from './translation-service';
import { getCachedTranslation, setCachedTranslation } from '@/localization/storage';
import { getAccessToken } from '@/lib/auth-token';
import { getApiBaseUrl } from '@/config/backend';

jest.mock('@/localization/storage', () => ({ getCachedTranslation: jest.fn(), setCachedTranslation: jest.fn() }));
jest.mock('@/lib/auth-token', () => ({ getAccessToken: jest.fn() }));
jest.mock('@/config/backend', () => ({ getApiBaseUrl: jest.fn() }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: (text: string, values: Record<string, unknown>) => text.replace(/\{\{(value\d+)\}\}/g, (_, key) => String(values[key])) } }));

const cache = getCachedTranslation as jest.MockedFunction<typeof getCachedTranslation>;
const save = setCachedTranslation as jest.MockedFunction<typeof setCachedTranslation>;
const token = getAccessToken as jest.MockedFunction<typeof getAccessToken>;
const apiBase = getApiBaseUrl as jest.MockedFunction<typeof getApiBaseUrl>;
const fetchMock = jest.fn<(...args: Parameters<typeof fetch>) => Promise<any>>();

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
  apiBase.mockReturnValue('https://api.example.test');
  token.mockReturnValue('secret');
  cache.mockResolvedValue(null);
  save.mockResolvedValue(undefined);
});

describe('dynamic text translation', () => {
  it('returns empty or same-language text without cache or network access', async () => {
    expect(await translateDynamicText({ text: '  ', targetLanguage: 'fr' })).toBe('  ');
    expect(await translateDynamicText({ text: 'Hello', targetLanguage: 'en' })).toBe('Hello');
    expect(cache).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses a cached translation before making a request', async () => {
    cache.mockResolvedValue('Bonjour');
    expect(await translateDynamicText({ text: ' Hello ', targetLanguage: 'fr' })).toBe('Bonjour');
    expect(cache).toHaveBeenCalledWith('en:fr:Hello');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts trimmed text with authorization and caches the answer', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ translatedText: 'Bonjour' }) });
    expect(await translateDynamicText({ text: ' Hello ', targetLanguage: 'fr' })).toBe('Bonjour');
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/translations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer secret' },
      body: JSON.stringify({ text: 'Hello', sourceLanguage: 'en', targetLanguage: 'fr' }),
    });
    expect(save).toHaveBeenCalledWith('en:fr:Hello', 'Bonjour');
  });

  it('returns original text on a failed response', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    expect(await translateDynamicText({ text: 'Hello', targetLanguage: 'fr' })).toBe('Hello');
    expect(save).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});

describe('dynamic batch translation', () => {
  const items = [{ key: 'one', text: 'Hello' }, { key: 'two', text: 'Bye' }];

  it('returns original entries for empty and same-language batches', async () => {
    expect(await translateDynamicBatch({ items: [], targetLanguage: 'fr' })).toEqual({});
    expect(await translateDynamicBatch({ items, targetLanguage: 'en' })).toEqual({ one: 'Hello', two: 'Bye' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends only cache misses and preserves cached entries', async () => {
    cache.mockImplementation(async (key) => key.endsWith(':Hello') ? 'Bonjour' : null);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ translations: [{ originalText: 'Bye', translatedText: 'Au revoir' }] }) });
    expect(await translateDynamicBatch({ items, targetLanguage: 'fr' })).toEqual({ one: 'Bonjour', two: 'Au revoir' });
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({ texts: ['Bye'], sourceLanguage: 'en', targetLanguage: 'fr' });
    expect(save).toHaveBeenCalledWith('en:fr:Bye', 'Au revoir');
  });

  it('falls back for missing translations and network errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ translations: [{ originalText: 'Hello', translatedText: 'Bonjour' }] }) });
    expect(await translateDynamicBatch({ items, targetLanguage: 'fr' })).toEqual({ one: 'Bonjour', two: 'Bye' });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await translateDynamicBatch({ items, targetLanguage: 'fr' })).toEqual({ one: 'Hello', two: 'Bye' });
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });
});
