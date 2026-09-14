import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { englishResources } from '@agiworkforce/i18n/en';
import { lazyLocaleBackend, loadLocaleNamespace } from '@agiworkforce/i18n/lazy';
import { NAMESPACES, SUPPORTED_LANGUAGES } from '@agiworkforce/i18n/languages';
import { resources } from '@agiworkforce/i18n';

describe('lazy locale loading', () => {
  it('ships only English up front and loads another language on demand', async () => {
    const i18n = createInstance();
    await i18n.use(lazyLocaleBackend).init({
      resources: { en: englishResources },
      partialBundledLanguages: true,
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: NAMESPACES,
      lng: 'en',
      interpolation: { escapeValue: false },
    });
    expect(i18n.hasResourceBundle('en', 'common')).toBe(true);
    expect(i18n.hasResourceBundle('de', 'common')).toBe(false);

    await i18n.changeLanguage('de');
    expect(i18n.hasResourceBundle('de', 'common')).toBe(true);
    expect(i18n.getResourceBundle('de', 'common')).toEqual(resources.de.common);
  });

  it('resolves every supported language and namespace to the bundled catalogue', async () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const namespace of NAMESPACES) {
        const loaded = await loadLocaleNamespace(language.code, namespace);
        expect(loaded).toEqual(resources[language.code as keyof typeof resources][namespace]);
      }
    }
  });

  it('refuses a language or namespace that is not in the catalogue', async () => {
    await expect(loadLocaleNamespace('xx', 'common')).rejects.toThrow('Unknown locale resource');
    await expect(loadLocaleNamespace('de', '../package')).rejects.toThrow(
      'Unknown locale resource',
    );
  });
});
