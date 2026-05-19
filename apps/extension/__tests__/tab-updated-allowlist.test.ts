/**
 * tabs.onUpdated allowlist gate test (H-06b audit 2026-05-19;
 * self-review #4 audit 2026-05-19).
 *
 * The chrome.tabs.onUpdated listener in background.ts now gates the
 * page-context-sync call on `siteAllowlistCache.has(origin)`. Non-
 * allowlisted origins get no implicit sync, closing the leak that sent
 * full innerText to the desktop bridge for every http(s) tab.
 */

import { describe, expect, it } from 'vitest';

/**
 * Mirror of the H-06b gate logic. Returns true when the listener should
 * call `syncTabContextWithDesktop`, false otherwise.
 */
function shouldSyncContext(
  changeInfoStatus: string | undefined,
  url: string,
  allowlist: ReadonlySet<string>,
): boolean {
  if (changeInfoStatus !== 'complete') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return false;
  }
  return allowlist.has(origin);
}

describe('H-06b tabs.onUpdated context-sync gate', () => {
  it('syncs when the origin is on the allowlist', () => {
    const allowlist = new Set(['https://example.com']);
    expect(shouldSyncContext('complete', 'https://example.com/page', allowlist)).toBe(true);
  });

  it('skips when the origin is NOT on the allowlist', () => {
    const allowlist = new Set(['https://other.com']);
    expect(shouldSyncContext('complete', 'https://example.com/page', allowlist)).toBe(false);
  });

  it('skips when the allowlist is empty', () => {
    expect(shouldSyncContext('complete', 'https://example.com/', new Set())).toBe(false);
  });

  it('skips when the change is not "complete"', () => {
    expect(
      shouldSyncContext('loading', 'https://example.com/', new Set(['https://example.com'])),
    ).toBe(false);
  });

  it('skips non-http(s) URLs', () => {
    const allowlist = new Set(['chrome://newtab']);
    expect(shouldSyncContext('complete', 'chrome://newtab/', allowlist)).toBe(false);
    expect(shouldSyncContext('complete', 'file:///etc/passwd', new Set())).toBe(false);
  });

  it('skips malformed URLs', () => {
    expect(shouldSyncContext('complete', 'not-a-url', new Set())).toBe(false);
  });

  it('uses the origin (not the full URL) for the check', () => {
    const allowlist = new Set(['https://example.com']);
    expect(shouldSyncContext('complete', 'https://example.com/some/deep/path?q=1', allowlist)).toBe(
      true,
    );
  });
});
