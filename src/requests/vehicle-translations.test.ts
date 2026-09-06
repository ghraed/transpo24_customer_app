import { describe, expect, it } from '@jest/globals';
import i18n, { initializeI18n } from '@/localization/i18n';
import en from '@/localization/locales/en.json';
import de from '@/localization/locales/de.json';
import fr from '@/localization/locales/fr.json';
import ar from '@/localization/locales/ar.json';
import es from '@/localization/locales/es.json';
import itLocale from '@/localization/locales/it.json';
import { isRTLLanguage } from '@/localization/languages';

describe('vehicle request translations', () => {
  it('has every vehicle text key in all six supported languages', () => {
    const keys = Object.keys(en).filter(key => key.startsWith('vehicleRequest.')).sort();
    for (const locale of [de, fr, ar, es, itLocale]) expect(Object.keys(locale).filter(key => key.startsWith('vehicleRequest.')).sort()).toEqual(keys);
  });
  it('renders German labels and a selected/maximum photo counter', async () => {
    await initializeI18n();
    await i18n.changeLanguage('de');
    expect(i18n.t('vehicleRequest.title')).toBe('Fahrzeugtransport');
    expect(i18n.t('vehicleRequest.photoCount', { count: 4, max: 8 })).toBe('4/8');
    expect(i18n.t('vehicleRequest.errorSchedule')).toBe('Abholtermin fehlt oder liegt in der Vergangenheit.');
    expect(isRTLLanguage('ar')).toBe(true);
    for (const language of ['en', 'de', 'fr', 'es', 'it'] as const) expect(isRTLLanguage(language)).toBe(false);
  });
});
