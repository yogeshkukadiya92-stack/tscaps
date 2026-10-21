import { describe, expect, it } from 'vitest';
import { isLocale, translate } from '@ui/i18n/Locale';
import { translations } from '@ui/i18n/translations';

describe('interface localization', () => {
  it('provides both translations and preserves interpolation parameters for every key', () => {
    const parameters = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for (const [key, copy] of Object.entries(translations)) {
      for (const locale of ['hi', 'gu'] as const) {
        expect(copy[locale].trim(), `${locale}: ${key}`).not.toBe('');
        expect(parameters(copy[locale]), `${locale}: ${key}`).toEqual(parameters(key));
      }
    }
  });
  it('preserves English spacing, falls back for unknown messages, and inserts user values verbatim', () => {
    expect(translate(' Save changes ', 'en')).toBe(' Save changes ');
    expect(translate(' Save changes ', 'gu')).toBe(' ફેરફાર સેવ કરો ');
    expect(translate('Unrecognized service response', 'hi')).toBe('Unrecognized service response');
    expect(translate('Delete {0}', 'gu', { 0: 'Home <script>' })).toBe('Home <script> કાઢો');
    expect(translate('Rendering {0}%', 'en', { 0: 25 })).toBe('Rendering 25%');
  });
  it('accepts only the supported saved language values', () => {
    for (const locale of ['en', 'hi', 'gu']) expect(isLocale(locale)).toBe(true);
    for (const locale of [null, 'fr', '', {}, 'GU']) expect(isLocale(locale)).toBe(false);
  });
});
