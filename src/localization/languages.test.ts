import { describe, expect, it } from '@jest/globals';
import { DEFAULT_LANGUAGE, getLocaleForLanguage, isRTLLanguage, isSupportedLanguage, normalizeLanguageTag, resolveSupportedLanguage, SUPPORTED_LANGUAGES } from './languages';

describe('language selection', () => {
  it('resolves supported regional tags and normalizes case and whitespace', () => {
    expect(normalizeLanguageTag(' FR_ca ')).toBe('fr-ca');
    expect(resolveSupportedLanguage(' FR_ca ')).toBe('fr');
    expect(resolveSupportedLanguage('AR-LB')).toBe('ar');
  });

  it.each([null, undefined, '', 'pt-BR', 'english'])('falls back for unsupported language %j', (value) => {
    expect(isSupportedLanguage(value)).toBe(false);
    expect(resolveSupportedLanguage(value)).toBe(DEFAULT_LANGUAGE);
  });

  it('defines a locale for each supported language and flags Arabic as RTL', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(isSupportedLanguage(language)).toBe(true);
      expect(getLocaleForLanguage(language)).toBeTruthy();
      expect(isRTLLanguage(language)).toBe(language === 'ar');
    }
  });
});
