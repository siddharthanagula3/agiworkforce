import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@agiworkforce/i18n/languages';

import i18n from './index';

describe('document language after a language change', () => {
  it('sets lang and the registry reading direction for every supported language', async () => {
    for (const language of SUPPORTED_LANGUAGES) {
      await i18n.changeLanguage(language.code);
      expect(document.documentElement.lang, language.code).toBe(language.code);
      expect(document.documentElement.dir, language.code).toBe(language.rtl ? 'rtl' : 'ltr');
    }
  });

  it('returns to left-to-right when the default language comes back', async () => {
    const rightToLeft = SUPPORTED_LANGUAGES.find((language) => language.rtl);
    if (rightToLeft) await i18n.changeLanguage(rightToLeft.code);

    await i18n.changeLanguage(DEFAULT_LANGUAGE);

    expect(document.documentElement.lang).toBe(DEFAULT_LANGUAGE);
    expect(document.documentElement.dir).toBe('ltr');
  });
});
