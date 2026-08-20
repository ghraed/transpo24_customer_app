import i18n from '@/localization/i18n';
import {
  type AppLanguage,
  DEFAULT_LANGUAGE,
  getLocaleForLanguage,
  isSupportedLanguage,
} from '@/localization/languages';

function getActiveLanguage(): AppLanguage {
  const candidate = i18n.language?.split('-')[0] ?? DEFAULT_LANGUAGE;
  return isSupportedLanguage(candidate) ? candidate : DEFAULT_LANGUAGE;
}

export function getActiveLocale(): string {
  return getLocaleForLanguage(getActiveLanguage());
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : 'N/A';
  }

  return new Intl.DateTimeFormat(getActiveLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(parsed);
}

export function formatDateOnly(value: string | number | Date | null | undefined): string {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : 'N/A';
  }

  return new Intl.DateTimeFormat(getActiveLocale(), {
    dateStyle: 'medium',
  }).format(parsed);
}

export function formatTimeOnly(value: string | number | Date | null | undefined): string {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return typeof value === 'string' ? value : 'N/A';
  }

  return new Intl.DateTimeFormat(getActiveLocale(), {
    timeStyle: 'short',
    hour12: false,
  }).format(parsed);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getActiveLocale()).format(value);
}

export function formatCurrency(value: number, currency: string | null | undefined): string {
  const code = currency?.trim() || 'USD';

  try {
    return new Intl.NumberFormat(getActiveLocale(), {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return i18n.t("{{value0}} {{value1}}", { value0: value.toFixed(2), value1: code });
  }
}
