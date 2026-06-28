/**
 * Mobile (React Native) platform-adapter for the shared capability matrix.
 *
 * The capability MATRIX is defined once in `@agiworkforce/types`
 * (`capabilities.ts`, pure / RN-safe). Mobile cannot import the web/desktop
 * React layer in `@agiworkforce/unified-chat` (it pulls react-dom), so it
 * provides this thin equivalent adapter over the SAME matrix. Shared/mobile UI
 * consumes `useCapability('canX')` — never `platform === 'desktop'` branching.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  getPlatformCapabilities,
  isCapabilityEnabled as matrixIsCapabilityEnabled,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';

const CapabilityContext = createContext<SyncedAppSurface>('mobile');

export function CapabilityProvider({
  platform = 'mobile',
  children,
}: {
  platform?: SyncedAppSurface;
  children: ReactNode;
}) {
  return <CapabilityContext.Provider value={platform}>{children}</CapabilityContext.Provider>;
}

/** Whether the current surface exposes `capability`. */
export function useCapability(capability: PlatformCapability): boolean {
  return matrixIsCapabilityEnabled(useContext(CapabilityContext), capability);
}

/** The full capability row for the current surface. */
export function useCapabilities() {
  const platform = useContext(CapabilityContext);
  return useMemo(() => getPlatformCapabilities(platform), [platform]);
}
