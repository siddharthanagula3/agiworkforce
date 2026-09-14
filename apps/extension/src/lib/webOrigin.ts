export const DEFAULT_AGI_WEB_ORIGIN = 'https://agiworkforce.com';

function metaEnv(): Record<string, string | undefined> {
  const importEnv =
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const processEnv =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

  return { ...processEnv, ...importEnv };
}

export function validateAgiWebOrigin(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    const isLocalhost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '[::1]';
    const isAgiWeb =
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'agiworkforce.com' || parsed.hostname.endsWith('.agiworkforce.com'));

    if (!isLocalhost && !isAgiWeb) return null;
    if (isLocalhost && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    return parsed.origin;
  } catch {
    return null;
  }
}

export function configuredAgiWebOrigin(): string | null {
  const env = metaEnv();
  const configured =
    env['VITE_AGI_WEB_API_BASE_URL']?.trim() || env['VITE_API_BASE_URL']?.trim() || '';
  if (!configured) return DEFAULT_AGI_WEB_ORIGIN;
  return validateAgiWebOrigin(configured);
}
