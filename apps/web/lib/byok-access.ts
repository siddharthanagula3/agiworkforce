'use client';

/**
 * Provider keys that run fully on the user's device.
 * Mirrors the Local branch in WebChatPage's providerMode classification.
 */
export const LOCAL_PROVIDER_KEYS = new Set([
  'local',
  'ollama',
  'lmstudio',
  'executorch',
  'llamacpp',
]);

/**
 * Returns true if at least one BYOK env key is configured server-side.
 * Calls /api/byok/env-key-status (presence-only, never reveals key values).
 * Returns false on any fetch failure to fail-safe toward redirect.
 */
export async function hasByokEnvKeys(): Promise<boolean> {
  try {
    const res = await fetch('/api/byok/env-key-status');
    if (!res.ok) return false;
    const data = (await res.json()) as { providers: { id: string; isSet: boolean }[] };
    return data.providers.some((p) => p.isSet);
  } catch {
    return false;
  }
}
