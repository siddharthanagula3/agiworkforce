'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SELECTABLE_LANGUAGES } from '@/app/i18n/index';

export function LanguageSelector({ describedBy }: { describedBy?: string }) {
  const { i18n } = useTranslation('settings');

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
      aria-describedby={describedBy}
      className="rounded-md border px-3 py-1.5 text-sm"
      style={{
        background: 'var(--chat-surface-elevated, transparent)',
        borderColor: 'var(--chat-border-strong)',
        color: 'var(--chat-text-secondary)',
        cursor: 'pointer',
      }}
    >
      {SELECTABLE_LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.flag} {lang.nativeName}
        </option>
      ))}
    </select>
  );
}
