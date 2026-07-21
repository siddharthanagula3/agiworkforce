/**
 * Reads the "Memory" capability toggle (Settings → Capabilities → Memory) so the
 * chat runtime can honor it before injecting saved memory facts. Without this,
 * the toggle persists but never affects answers (it was write-only).
 *
 * Session-cached to avoid a preferences fetch on every message send; the cache
 * is invalidated by `resetMemoryCapabilityCache()` when the setting is saved, so
 * toggling applies without a reload. Fails open (memory enabled) on any error —
 * a settings-fetch hiccup must never silently drop the user's memory.
 */
import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';

let cached: Promise<boolean> | null = null;

export function isMemoryCapabilityEnabled(): Promise<boolean> {
  if (!cached) {
    cached = fetchPreferenceNamespace<{ memory: boolean }>('capabilities', { memory: true })
      .then((settings) => settings.memory !== false)
      .catch(() => true);
  }
  return cached;
}

export function resetMemoryCapabilityCache(): void {
  cached = null;
}
