import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { create } from 'zustand';
import {
  ALL_PLATFORM_CAPABILITIES,
  getPlatformCapabilities,
  isCapabilityEnabled as matrixIsCapabilityEnabled,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import { parseMeResponse } from '@agiworkforce/cloud-contracts';
import { api } from '@/services/api';

const CapabilityContext = createContext<SyncedAppSurface>('mobile');

/**
 * The server names a capability switch `capability.<its name in snake case>`,
 * so both sides derive the key from the same `PlatformCapability` union rather
 * than keeping two lists that can drift apart.
 */
const CAPABILITY_FLAG_PREFIX = 'capability.';

export function capabilityFlagKey(capability: PlatformCapability): string {
  return `${CAPABILITY_FLAG_PREFIX}${capability.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`;
}

interface RemoteCapabilityState {
  switchedOff: Readonly<Record<string, boolean>>;
  loadedAt: string | null;
  refresh: () => Promise<void>;
  clear: () => void;
}

/**
 * What the platform matrix says this build can do, narrowed by what the server
 * currently allows. A capability the server says nothing about stays exactly as
 * the build shipped it, so an unreachable server never disables a working
 * feature; a capability the server has switched off is off on the next refresh,
 * with no store release in between.
 */
export const useRemoteCapabilityStore = create<RemoteCapabilityState>((set) => ({
  switchedOff: {},
  loadedAt: null,
  refresh: async () => {
    try {
      const parsed = parseMeResponse(await api.get<unknown>('/api/me?surface=mobile'));
      const switchedOff: Record<string, boolean> = {};
      for (const capability of ALL_PLATFORM_CAPABILITIES) {
        if (parsed.feature_flags[capabilityFlagKey(capability)] === false) {
          switchedOff[capability] = true;
        }
      }
      set({ switchedOff, loadedAt: new Date().toISOString() });
    } catch (error) {
      console.warn('[capabilities] refresh failed (keeping the last answer):', error);
    }
  },
  clear: () => set({ switchedOff: {}, loadedAt: null }),
}));

export function refreshRemoteCapabilities(): Promise<void> {
  return useRemoteCapabilityStore.getState().refresh();
}

export function CapabilityProvider({
  platform = 'mobile',
  children,
}: {
  platform?: SyncedAppSurface;
  children: ReactNode;
}) {
  useEffect(() => {
    void refreshRemoteCapabilities();
  }, []);
  return <CapabilityContext.Provider value={platform}>{children}</CapabilityContext.Provider>;
}

export function useCapability(capability: PlatformCapability): boolean {
  const platform = useContext(CapabilityContext);
  const switchedOff = useRemoteCapabilityStore((state) => state.switchedOff[capability] === true);
  return matrixIsCapabilityEnabled(platform, capability) && !switchedOff;
}

export function useCapabilities() {
  const platform = useContext(CapabilityContext);
  const switchedOff = useRemoteCapabilityStore((state) => state.switchedOff);
  return useMemo(() => {
    const effective: Record<PlatformCapability, boolean> = { ...getPlatformCapabilities(platform) };
    for (const capability of ALL_PLATFORM_CAPABILITIES) {
      if (switchedOff[capability]) effective[capability] = false;
    }
    return effective;
  }, [platform, switchedOff]);
}
