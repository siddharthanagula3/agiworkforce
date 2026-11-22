import * as Linking from 'expo-linking';
import { isAgiWorkforceUniversalLinkHost } from '@/src/integrations/universalLinks';

import { isActiveMobileSsoCallback } from '@/src/features/auth/services/mobileSsoCallback';

const ROOT_LAYOUT_SCHEME_HOSTS = new Set(['intent', 'pair']);

function isHandledByRootLayout(url: string): boolean {
  const parsed = Linking.parse(url);
  const scheme = (parsed.scheme ?? '').toLowerCase();
  const hostname = (parsed.hostname ?? '').toLowerCase();
  if (scheme === 'agiworkforce') return ROOT_LAYOUT_SCHEME_HOSTS.has(hostname);
  if (scheme !== 'https' || !isAgiWorkforceUniversalLinkHost(hostname)) return false;
  const segments = (parsed.path ?? '').split('/').filter(Boolean);
  return (
    (segments[0] === 'pair' && segments.length <= 2) ||
    (segments[0] === 'auth' && segments[1] === 'reset-password' && segments.length === 2)
  );
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    // The browser session consumes this link. Routing it to a second login screen
    // would clear the Cloud destination before Clerk finishes the exchange.
    return isActiveMobileSsoCallback(path) || isHandledByRootLayout(path) ? null : path;
  } catch {
    return path;
  }
}
