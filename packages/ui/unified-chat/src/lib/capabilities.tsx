/**
 * Capability React layer (shared, web + desktop).
 *
 * The capability MATRIX (which surface exposes which capability) is defined once
 * in `@agiworkforce/types` (`capabilities.ts`). This module is the thin React
 * "platform adapter": each shell wraps its tree in `<CapabilityProvider
 * platform={runtime.getPlatform()}>`, and shared/surface UI consumes
 * `useCapability('canX')` — NO `platform === 'desktop'` branching and NO
 * browser-API probing.
 *
 * Lives in unified-chat (react / react-dom) so BOTH the shared composer
 * components (e.g. AttachmentMenu) and the web/desktop apps can consume it.
 * Mobile (React Native) provides its own equivalent adapter over the same
 * `@agiworkforce/types` matrix, since this package is not RN-safe.
 *
 * This is ORTHOGONAL to model-capability and model-environment gating, which
 * still compose on top — capability decides only whether an affordance is
 * allowed to EXIST on this surface.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  getPlatformCapabilities,
  isCapabilityEnabled as matrixIsCapabilityEnabled,
  type PlatformCapability,
  type SyncedAppSurface,
} from '@agiworkforce/types';

// Default 'web' (cloud-only, the most restrictive synced surface) so a missing
// provider never accidentally exposes a desktop/mobile-only affordance.
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

/** The current surface. */
export function usePlatform(): SyncedAppSurface {
  return useContext(CapabilityContext);
}

/** Whether the current surface exposes `capability`. The one hook UI gates on. */
export function useCapability(capability: PlatformCapability): boolean {
  return matrixIsCapabilityEnabled(useContext(CapabilityContext), capability);
}

/** The full capability row for the current surface (stable per platform). */
export function useCapabilities() {
  const platform = useContext(CapabilityContext);
  return useMemo(() => getPlatformCapabilities(platform), [platform]);
}
