'use client';

import type { ReactNode } from 'react';

import { COOKIE_CONSENT_OPEN_EVENT } from '@shared/lib/cookie-consent';

export function CookiePreferencesTrigger({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_OPEN_EVENT))}
    >
      {children}
    </button>
  );
}
