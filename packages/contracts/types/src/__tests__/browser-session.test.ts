import { describe, expect, it } from 'vitest';

import {
  BROWSER_SESSION_KINDS,
  browserSessionCapability,
  isBrowserSessionKind,
  resolveBrowserSession,
} from '../browser-session';

describe('browser session kinds', () => {
  it('names the three sessions a task can run in', () => {
    expect([...BROWSER_SESSION_KINDS]).toEqual(['user-chrome', 'built-in', 'cloud']);
  });

  it('separates the user profile from the isolated ones', () => {
    expect(browserSessionCapability('user-chrome').isolatedProfile).toBe(false);
    expect(browserSessionCapability('built-in').isolatedProfile).toBe(true);
    expect(browserSessionCapability('cloud').isolatedProfile).toBe(true);
  });

  it('gives background continuation to the cloud session alone', () => {
    const surviving = BROWSER_SESSION_KINDS.filter(
      (kind) => browserSessionCapability(kind).survivesClientDisconnect,
    );
    expect(surviving).toEqual(['cloud']);
  });

  it('declares the cloud session unavailable with a reason', () => {
    const cloud = browserSessionCapability('cloud');
    expect(cloud.available).toBe(false);
    expect(cloud.unavailableReason).toMatch(/not available yet/);
  });

  it('refuses a cloud request instead of substituting the user’s own Chrome', () => {
    const resolution = resolveBrowserSession('cloud');
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.reason).toMatch(/not available yet/);
  });

  it('resolves the kinds that do exist', () => {
    for (const kind of ['user-chrome', 'built-in'] as const) {
      const resolution = resolveBrowserSession(kind);
      expect(resolution.ok).toBe(true);
      if (!resolution.ok) continue;
      expect(resolution.capability.kind).toBe(kind);
    }
  });

  it('rejects anything that is not a session kind', () => {
    expect(isBrowserSessionKind('remote')).toBe(false);
    expect(resolveBrowserSession(undefined).ok).toBe(false);
  });
});
