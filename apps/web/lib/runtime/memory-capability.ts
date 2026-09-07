import {
  PREFERENCE_NAMESPACE_SAVED_EVENT,
  fetchPreferenceNamespace,
  type PreferenceNamespaceSavedDetail,
} from '@/app/settings/_lib/preferences-client';

interface CapabilityFlags {
  memory: boolean;
  searchPastChats: boolean;
}

const CAPABILITIES_NAMESPACE = 'capabilities';

const ALL_DISABLED: CapabilityFlags = { memory: false, searchPastChats: false };

let cached: Promise<CapabilityFlags> | null = null;
const listeners = new Set<() => void>();

function capabilityFlags(): Promise<CapabilityFlags> {
  if (!cached) {
    const pending: Promise<CapabilityFlags> = fetchPreferenceNamespace<CapabilityFlags>(
      CAPABILITIES_NAMESPACE,
      ALL_DISABLED,
    )
      .then((settings) => ({
        memory: settings.memory === true,
        searchPastChats: settings.searchPastChats === true,
      }))
      .catch(() => {
        // A read that failed is not an answer. Caching it would keep every later
        // caller on the disabled fallback for the life of the tab.
        if (cached === pending) cached = null;
        return ALL_DISABLED;
      });
    cached = pending;
  }
  return cached;
}

export function isMemoryCapabilityEnabled(): Promise<boolean> {
  return capabilityFlags().then((flags) => flags.memory);
}

export function isPastChatSearchEnabled(): Promise<boolean> {
  return capabilityFlags().then((flags) => flags.searchPastChats);
}

export function resetMemoryCapabilityCache(): void {
  cached = null;
  for (const listener of [...listeners]) listener();
}

function onPreferenceNamespaceSaved(event: Event): void {
  const { detail } = event as CustomEvent<PreferenceNamespaceSavedDetail>;
  if (detail?.namespace !== CAPABILITIES_NAMESPACE) return;
  resetMemoryCapabilityCache();
}

export function subscribeMemoryCapability(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== 'undefined') {
    window.addEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, onPreferenceNamespaceSaved);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener(PREFERENCE_NAMESPACE_SAVED_EVENT, onPreferenceNamespaceSaved);
    }
  };
}
