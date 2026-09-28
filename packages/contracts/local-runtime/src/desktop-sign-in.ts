import { DESKTOP_DEEP_LINK_SCHEME } from './host-bridge';

export const BROWSER_SIGN_IN_START = 'browser_sign_in_start';

export const DESKTOP_SIGN_IN_PATH = '/auth/desktop';

export const DESKTOP_SIGN_IN_COMPLETE_PATH = '/auth/desktop/complete';

export const DESKTOP_SIGN_IN_LINK_HOST = 'sign-in';

const SIGN_IN_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function desktopSignInLink(code: string): string {
  return `${DESKTOP_DEEP_LINK_SCHEME}://${DESKTOP_SIGN_IN_LINK_HOST}?code=${encodeURIComponent(code)}`;
}

export function isDesktopSignInLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === `${DESKTOP_DEEP_LINK_SCHEME}:` &&
      parsed.host === DESKTOP_SIGN_IN_LINK_HOST
    );
  } catch {
    return false;
  }
}

export function readDesktopSignInCode(url: string): string | null {
  if (!isDesktopSignInLink(url)) return null;
  const code = new URL(url).searchParams.get('code');
  return code !== null && SIGN_IN_CODE_PATTERN.test(code) ? code : null;
}
