import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { CapabilityProvider, useCapability } from '@/src/lib/capabilities';
import type { SyncedAppSurface, PlatformCapability } from '@agiworkforce/types';

/**
 * The mobile RN capability adapter is a SEPARATE ~20-line copy of the
 * unified-chat one (mobile cannot import react-dom). This test proves it injects
 * the platform through context and stays in agreement with the shared matrix —
 * the only guard against the two adapter copies drifting apart. The default
 * context is 'mobile', so the desktop-override case proves the provider actually
 * propagates (not merely returns the default).
 */
function wrapper(platform: SyncedAppSurface) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <CapabilityProvider platform={platform}>{children}</CapabilityProvider>;
  };
}

const cap = (platform: SyncedAppSurface, capability: PlatformCapability) =>
  renderHook(() => useCapability(capability), { wrapper: wrapper(platform) }).result.current;

describe('mobile CapabilityProvider (RN adapter)', () => {
  it('mobile → camera present, desktop-only capabilities absent', () => {
    expect(cap('mobile', 'canUseCamera')).toBe(true);
    expect(cap('mobile', 'canUsePhotos')).toBe(true);
    expect(cap('mobile', 'canTakeScreenshot')).toBe(false);
    expect(cap('mobile', 'canUseTerminal')).toBe(false);
    expect(cap('mobile', 'canUseWorkingDirectory')).toBe(false);
  });

  it('desktop override → screenshot enabled (proves the provider injects, not the default)', () => {
    expect(cap('desktop', 'canTakeScreenshot')).toBe(true);
    expect(cap('desktop', 'canUseTerminal')).toBe(true);
  });

  it('web override → desktop-only absent, camera absent', () => {
    expect(cap('web', 'canUseWorkingDirectory')).toBe(false);
    expect(cap('web', 'canUseCamera')).toBe(false);
  });
});
