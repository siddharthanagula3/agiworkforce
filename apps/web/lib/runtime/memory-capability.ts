import { fetchPreferenceNamespace } from '@/app/settings/_lib/preferences-client';

interface CapabilityFlags {
  memory: boolean;
  searchPastChats: boolean;
}

const ALL_DISABLED: CapabilityFlags = { memory: false, searchPastChats: false };

let cached: Promise<CapabilityFlags> | null = null;

function capabilityFlags(): Promise<CapabilityFlags> {
  if (!cached) {
    cached = fetchPreferenceNamespace<CapabilityFlags>('capabilities', ALL_DISABLED)
      .then((settings) => ({
        memory: settings.memory === true,
        searchPastChats: settings.searchPastChats === true,
      }))
      .catch(() => ALL_DISABLED);
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
}
