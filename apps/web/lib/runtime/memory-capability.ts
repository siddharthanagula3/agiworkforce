import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';

let cached: Promise<boolean> | null = null;

export function isMemoryCapabilityEnabled(): Promise<boolean> {
  if (!cached) {
    cached = fetchPreferenceNamespace<{ memory: boolean }>('capabilities', { memory: false })
      .then((settings) => settings.memory === true)
      .catch(() => false);
  }
  return cached;
}

export function resetMemoryCapabilityCache(): void {
  cached = null;
}
