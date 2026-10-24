import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  ALL_PLATFORM_CAPABILITIES,
  resolveCapabilityDocumentDecision,
  type CapabilityDecision,
  type CapabilityDocumentWireView,
  type SyncedAppSurface,
} from '@agiworkforce/types';
import {
  isCapabilityEnabled as matrixIsCapabilityEnabled,
  type PlatformCapability,
} from '@agiworkforce/types/capabilities';

interface CapabilityContextValue {
  platform: SyncedAppSurface;
  document: CapabilityDocumentWireView | null;
}

const DEFAULT_CAPABILITY_CONTEXT: CapabilityContextValue = { platform: 'web', document: null };

const CapabilityContext = createContext<CapabilityContextValue>(DEFAULT_CAPABILITY_CONTEXT);

export function CapabilityProvider({
  platform,
  document = null,
  children,
}: {
  platform: SyncedAppSurface;
  document?: CapabilityDocumentWireView | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ platform, document }), [platform, document]);
  return <CapabilityContext.Provider value={value}>{children}</CapabilityContext.Provider>;
}

function decideCapability(
  context: CapabilityContextValue,
  capability: PlatformCapability,
): boolean {
  const decision = resolveCapabilityDocumentDecision(context.document, capability);
  return decision ? decision.allowed : matrixIsCapabilityEnabled(context.platform, capability);
}

export function usePlatform(): SyncedAppSurface {
  return useContext(CapabilityContext).platform;
}

export function useCapabilityDecision(capability: PlatformCapability): CapabilityDecision | null {
  const { document } = useContext(CapabilityContext);
  return useMemo(
    () => resolveCapabilityDocumentDecision(document, capability),
    [document, capability],
  );
}

export function useCapability(capability: PlatformCapability): boolean {
  return decideCapability(useContext(CapabilityContext), capability);
}

export function useCapabilities(): Readonly<Record<PlatformCapability, boolean>> {
  const context = useContext(CapabilityContext);
  return useMemo(
    () =>
      Object.fromEntries(
        ALL_PLATFORM_CAPABILITIES.map((capability) => [
          capability,
          decideCapability(context, capability),
        ]),
      ) as Record<PlatformCapability, boolean>,
    [context],
  );
}
