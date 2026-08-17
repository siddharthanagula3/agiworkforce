import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { CapabilityProvider, useCapability } from '@/src/lib/capabilities';
import type { SyncedAppSurface, PlatformCapability } from '@agiworkforce/types';

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

  it('web override → desktop-only absent, camera present', () => {
    expect(cap('web', 'canUseWorkingDirectory')).toBe(false);
    expect(cap('web', 'canUseCamera')).toBe(true);
  });
});
