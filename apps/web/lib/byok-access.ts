'use client';

export const LOCAL_PROVIDER_KEYS = new Set([
  'local',
  'ollama',
  'lmstudio',
  'executorch',
  'llamacpp',
]);

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
