import { createURL } from 'expo-linking';

let activeCallback: string | null = null;

export async function withMobileSsoCallback<T>(start: (redirectUrl: string) => Promise<T>) {
  const redirectUrl = createURL('/login');
  activeCallback = redirectUrl;
  try {
    return await start(redirectUrl);
  } finally {
    activeCallback = null;
  }
}

export function isActiveMobileSsoCallback(path: string): boolean {
  if (!activeCallback) return false;
  return path.split(/[?#]/, 1)[0] === activeCallback;
}
