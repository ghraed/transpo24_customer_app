import { getApiBaseUrl } from '@/config/backend';
import { getAccessToken } from '@/lib/auth-token';
import { type AppLanguage, DEFAULT_LANGUAGE } from '@/localization/languages';
import {
  getCachedTranslation,
  setCachedTranslation,
} from '@/localization/storage';

export interface TranslateTextRequest {
  text: string;
  targetLanguage: AppLanguage;
  sourceLanguage?: AppLanguage;
  context?: string;
}

export interface TranslateBatchItem {
  key: string;
  text: string;
  context?: string;
}

export interface TranslateBatchRequest {
  items: TranslateBatchItem[];
  targetLanguage: AppLanguage;
  sourceLanguage?: AppLanguage;
}

type TranslationResultMap = Record<string, string>;

function getHeaders(): HeadersInit {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function buildCacheKey(sourceLanguage: AppLanguage, targetLanguage: AppLanguage, text: string): string {
  return `${sourceLanguage}:${targetLanguage}:${text.trim()}`;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Translation request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

function readSingleTranslation(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }

  if (raw && typeof raw === 'object') {
    const data = raw as Record<string, unknown>;

    const direct =
      data.translatedText ??
      data.translation ??
      (data.data && typeof data.data === 'object'
        ? (data.data as Record<string, unknown>).translatedText
        : undefined);

    if (typeof direct === 'string' && direct.trim()) {
      return direct;
    }
  }

  return fallback;
}

function readBatchTranslations(
  raw: unknown,
  items: TranslateBatchItem[],
  sourceLanguage: AppLanguage,
  targetLanguage: AppLanguage,
): TranslationResultMap {
  const fallback = Object.fromEntries(items.map((item) => [item.key, item.text])) as TranslationResultMap;

  if (!raw || typeof raw !== 'object') {
    return fallback;
  }

  const container = raw as Record<string, unknown>;
  const list =
    (Array.isArray(container.translations) ? container.translations : null) ??
    (Array.isArray(container.items) ? container.items : null) ??
    (Array.isArray(raw) ? raw : null);

  if (!list) {
    return fallback;
  }

  const next = { ...fallback };

  for (const item of list) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const originalText = typeof record.originalText === 'string' ? record.originalText : '';
    const translatedText = typeof record.translatedText === 'string'
      ? record.translatedText
      : typeof record.translation === 'string'
        ? record.translation
        : '';

    if (!originalText.trim() || !translatedText.trim()) {
      continue;
    }

    const matchingItems = items.filter((entry) => entry.text === originalText);
    for (const entry of matchingItems) {
      next[entry.key] = translatedText;
    }

    void setCachedTranslation(buildCacheKey(sourceLanguage, targetLanguage, originalText), translatedText);
  }

  return next;
}

export async function translateDynamicText({
  text,
  targetLanguage,
  sourceLanguage = DEFAULT_LANGUAGE,
}: TranslateTextRequest): Promise<string> {
  const trimmed = text.trim();

  if (!trimmed || targetLanguage === sourceLanguage) {
    return text;
  }

  const cacheKey = buildCacheKey(sourceLanguage, targetLanguage, trimmed);
  const cached = await getCachedTranslation(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const response = await postJson<unknown>('/translations', {
      text: trimmed,
      sourceLanguage,
      targetLanguage,
    });
    const translated = readSingleTranslation(response, text);
    if (translated.trim()) {
      await setCachedTranslation(cacheKey, translated);
    }
    return translated;
  } catch (error) {
    console.warn('Dynamic translation failed, falling back to original text.', error);
    return text;
  }
}

export async function translateDynamicBatch({
  items,
  targetLanguage,
  sourceLanguage = DEFAULT_LANGUAGE,
}: TranslateBatchRequest): Promise<TranslationResultMap> {
  if (!items.length || targetLanguage === sourceLanguage) {
    return Object.fromEntries(items.map((item) => [item.key, item.text])) as TranslationResultMap;
  }

  const cachedEntries = await Promise.all(items.map(async (item) => {
    const cached = await getCachedTranslation(buildCacheKey(sourceLanguage, targetLanguage, item.text));
    return [item.key, cached] as const;
  }));

  const next = Object.fromEntries(items.map((item) => [item.key, item.text])) as TranslationResultMap;
  const missingItems: TranslateBatchItem[] = [];

  for (const item of items) {
    const cached = cachedEntries.find(([key]) => key === item.key)?.[1];
    if (cached) {
      next[item.key] = cached;
    } else {
      missingItems.push(item);
    }
  }

  if (!missingItems.length) {
    return next;
  }

  try {
    const response = await postJson<unknown>('/translations/batch', {
      texts: missingItems.map((item) => item.text),
      sourceLanguage,
      targetLanguage,
    });

    return {
      ...next,
      ...readBatchTranslations(response, missingItems, sourceLanguage, targetLanguage),
    };
  } catch (error) {
    console.warn('Dynamic translation batch failed, falling back to original texts.', error);
    return next;
  }
}
