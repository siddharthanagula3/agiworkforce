'use client';

import { useEffect, useState } from 'react';
import { MarketingHeader } from '@/features/marketing/components/system/MarketingHeader';
import { hasBrowserSessionCookie, parseCookieHeader } from '@/lib/session-cookie';
import { useEmbeddedPage } from './EmbeddedPage';

// Reachable from both server and client module graphs, so it cannot call
// next/headers; sign-in state is read from document.cookie after mount with
// the same check proxy.ts uses.
export function Header({ minimal = false }: { minimal?: boolean } = {}) {
  const embedded = useEmbeddedPage();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(hasBrowserSessionCookie(parseCookieHeader(document.cookie)));
  }, []);

  if (embedded) return null;
  return <MarketingHeader minimal={minimal} signedIn={signedIn} />;
}
