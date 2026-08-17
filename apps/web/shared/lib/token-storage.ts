import { securityManager } from './security';

export const ACCESS_TOKEN_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000;
export const REFRESH_TOKEN_MAX_AGE_MS = 60 * 60 * 24 * 30 * 1000;

interface StoredTokenEnvelope {
  token: string;
  storedAt: number;
}

function parseEnvelope(value: string): StoredTokenEnvelope | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredTokenEnvelope> | null;
    if (!parsed || typeof parsed.token !== 'string' || typeof parsed.storedAt !== 'number') {
      return null;
    }
    if (!parsed.token || !Number.isFinite(parsed.storedAt)) return null;
    return { token: parsed.token, storedAt: parsed.storedAt };
  } catch {
    return null;
  }
}

export async function encodeStoredToken(token: string, storedAt = Date.now()): Promise<string> {
  return securityManager.encryptAsync(JSON.stringify({ token, storedAt }));
}

export async function writeStoredToken(key: string, token: string): Promise<void> {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, await encodeStoredToken(token));
}

export async function readStoredToken(key: string, maxAgeMs: number): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  const stored = window.localStorage.getItem(key);
  if (!stored) return null;

  let decrypted: string | null = null;
  try {
    decrypted = await securityManager.decryptAsync(stored);
  } catch {
    decrypted = null;
  }

  const envelope = decrypted ? parseEnvelope(decrypted) : null;
  if (!envelope) {
    window.localStorage.removeItem(key);
    return null;
  }

  const age = Date.now() - envelope.storedAt;
  if (age < 0 || age > maxAgeMs) {
    window.localStorage.removeItem(key);
    return null;
  }

  return envelope.token;
}
