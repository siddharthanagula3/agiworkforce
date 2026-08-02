'use client';

// SIX-25: withdrawal of consent must be as reachable as giving it. The banner
// only appears until a choice is stored, so without this the "Analytics is
// opt-in" promise would be one-way. Dispatches the event `CookieConsent`
// (mounted in the root layout) listens for.

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
