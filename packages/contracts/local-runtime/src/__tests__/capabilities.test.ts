import { describe, expect, it } from 'vitest';
import {
  DESKTOP_CAPABILITIES,
  HIGH_RISK_CAPABILITIES,
  isDesktopCapability,
  isPermissionScope,
} from '../capabilities';

describe('the capability vocabulary', () => {
  it('names no capability twice and rates only capabilities it names as high-risk', () => {
    expect(new Set(DESKTOP_CAPABILITIES).size).toBe(DESKTOP_CAPABILITIES.length);
    for (const capability of HIGH_RISK_CAPABILITIES) {
      expect(isDesktopCapability(capability)).toBe(true);
    }
  });

  it('no longer recognises a capability no command was ever gated on', () => {
    for (const retired of [
      'clipboard.monitor',
      'simulator.ios',
      'emulator.android',
      'mcp.local',
      'task.scheduled',
    ]) {
      expect(isDesktopCapability(retired)).toBe(false);
    }
  });
});

describe('isPermissionScope', () => {
  it('accepts a global scope with no target and a scoped one with a target', () => {
    expect(isPermissionScope({ kind: 'global' })).toBe(true);
    expect(isPermissionScope({ kind: 'workspace', target: '/work/a' })).toBe(true);
    expect(isPermissionScope({ kind: 'site', target: 'https://example.com' })).toBe(true);
    expect(isPermissionScope({ kind: 'application', target: 'Chrome' })).toBe(true);
  });

  it('refuses anything else a page might send', () => {
    expect(isPermissionScope(null)).toBe(false);
    expect(isPermissionScope('global')).toBe(false);
    expect(isPermissionScope({ kind: 'everything' })).toBe(false);
    expect(isPermissionScope({ kind: 'workspace' })).toBe(false);
    expect(isPermissionScope({ kind: 'workspace', target: '' })).toBe(false);
    expect(isPermissionScope({ kind: 'workspace', target: 7 })).toBe(false);
    expect(isPermissionScope({ kind: 'global', target: '/work/a' })).toBe(false);
  });
});
