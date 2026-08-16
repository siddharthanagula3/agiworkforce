'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '@/app/i18n/index';

export function LanguageSelector() {
  const { i18n } = useTranslation();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const code = e.target.value;
      void i18n.changeLanguage(code);
    },
    [i18n],
  );

  return (
    <select
      value={i18n.language}
      onChange={handleChange}
      aria-label="Display language"
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
  );
}
