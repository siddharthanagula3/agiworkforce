import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SyncedAppSurface } from '@agiworkforce/types';
import {
  getPlatformCapabilities,
  isCapabilityEnabled as matrixIsCapabilityEnabled,
  type PlatformCapability,
} from '@agiworkforce/types/capabilities';

const CapabilityContext = createContext<SyncedAppSurface>('web');

export function CapabilityProvider({
  platform,
  children,
}: {
  platform: SyncedAppSurface;
  children: ReactNode;
}) {
  return <CapabilityContext.Provider value={platform}>{children}</CapabilityContext.Provider>;
}

export function usePlatform(): SyncedAppSurface {
  return useContext(CapabilityContext);
}

export function useCapability(capability: PlatformCapability): boolean {
  return matrixIsCapabilityEnabled(useContext(CapabilityContext), capability);
}

export function useCapabilities() {
  const platform = useContext(CapabilityContext);
  return useMemo(() => getPlatformCapabilities(platform), [platform]);
}
