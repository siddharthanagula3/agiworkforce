import * as Linking from 'expo-linking';
import { isAgiWorkforceUniversalLinkHost } from '@/src/integrations/universalLinks';

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
    return isHandledByRootLayout(path) ? null : path;
  } catch {
    return path;
  }
}
