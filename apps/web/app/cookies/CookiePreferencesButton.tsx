'use client';

import { COOKIE_CONSENT_OPEN_EVENT } from '@shared/lib/cookie-consent';

export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_OPEN_EVENT))}
      className="underline underline-offset-2"
      style={{ color: 'var(--agi-ink)' }}
    >
      Change your cookie preferences
    </button>
  );
}
