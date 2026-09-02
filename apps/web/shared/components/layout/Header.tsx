'use client';

import { useEffect, useState } from 'react';
import { MarketingHeader } from '@/features/marketing/components/system/MarketingHeader';
import { hasBrowserSessionCookie, parseCookieHeader } from '@/lib/session-cookie';

// 96 call sites import this by the same name, 13 of them from client
// components; a shared component reachable from both a server and a client
// module graph can never call next/headers (it would fail wherever a client
// file pulls it in), so sign-in state is read from document.cookie after
// mount instead of from a server wrapper. The cookie-name check mirrors
// proxy.ts's hasBrowserSessionCookie exactly, just evaluated client-side.
export function Header({ minimal = false }: { minimal?: boolean } = {}) {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(hasBrowserSessionCookie(parseCookieHeader(document.cookie)));
  }, []);

  return <MarketingHeader minimal={minimal} signedIn={signedIn} />;
}
