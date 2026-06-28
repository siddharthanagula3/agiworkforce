import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { CapabilityProvider, useCapability } from '@agiworkforce/unified-chat';
import type { SyncedAppSurface } from '@agiworkforce/types';

/**
 * Proves the shared (unified-chat) capability ADAPTER actually injects the
 * platform through context — not that the matrix has the right values (that is
 * tested in @agiworkforce/types). The critical case is `desktop`: the context
 * DEFAULT is 'web', so if the provider didn't propagate, `canTakeScreenshot`
 * would be false on desktop (a silent refactor regression that loses desktop
 * capabilities). This test fails unless the provider→context→hook glue works.
 */
function wrapper(platform: SyncedAppSurface) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <CapabilityProvider platform={platform}>{children}</CapabilityProvider>;
  };
}

const cap = (platform: SyncedAppSurface, capability: Parameters<typeof useCapability>[0]) =>
  renderHook(() => useCapability(capability), { wrapper: wrapper(platform) }).result.current;

describe('unified-chat CapabilityProvider injects platform through context', () => {
  it('DESKTOP provider overrides the web default → screenshot/working-dir/terminal enabled', () => {
    expect(cap('desktop', 'canTakeScreenshot')).toBe(true);
    expect(cap('desktop', 'canUseWorkingDirectory')).toBe(true);
    expect(cap('desktop', 'canUseTerminal')).toBe(true);
  });

  it('WEB provider → desktop-only affordances absent', () => {
    expect(cap('web', 'canTakeScreenshot')).toBe(false);
    expect(cap('web', 'canUseWorkingDirectory')).toBe(false);
    expect(cap('web', 'canUseTerminal')).toBe(false);
  });

  it('MOBILE provider → desktop-only absent, camera present', () => {
    expect(cap('mobile', 'canTakeScreenshot')).toBe(false);
    expect(cap('mobile', 'canUseWorkingDirectory')).toBe(false);
    expect(cap('mobile', 'canUseCamera')).toBe(true);
  });

  it('without a provider, defaults to the most-restrictive web set (no desktop leak)', () => {
    const { result } = renderHook(() => useCapability('canTakeScreenshot'));
    expect(result.current).toBe(false);
  });
});
