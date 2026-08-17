'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/app/i18n/index';

const TRANSLATION_SCOPE_FALLBACK =
  'Translates the public site, pricing, and some chat labels. Settings and most other screens are still English.';

export function LanguageSelector() {
  const { t, i18n } = useTranslation('settings');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const code = e.target.value;
      void i18n.changeLanguage(code);
    },
    [i18n],
  );

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <select
        value={i18n.language}
        onChange={handleChange}
        aria-label="Display language"
        aria-describedby="display-language-scope"
        className="rounded-md border px-3 py-1.5 text-sm"
        style={{
          background: 'var(--chat-surface-elevated, transparent)',
          borderColor: 'var(--chat-border-strong)',
          color: 'var(--chat-text-secondary)',
          cursor: 'pointer',
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.nativeName}
          </option>
        ))}
      </select>
      <p
        id="display-language-scope"
        className="max-w-xs text-[11px] leading-snug text-muted-foreground sm:text-right"
      >
        {t('translationScope', TRANSLATION_SCOPE_FALLBACK)}
      </p>
    </div>
  );
}
