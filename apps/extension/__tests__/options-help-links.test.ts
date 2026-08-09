/**
 * The options page must offer a way out when someone is stuck.
 *
 * Before this test the extension had no help affordance anywhere — not in the
 * side panel, not on the options page — so the only exit from a confusing
 * state was to guess a URL. These assertions render the real options page and
 * check that the Help rows exist and point at web routes that actually exist
 * (`apps/web/app/help`, `/docs`, `/support`). A link to a route that does not
 * exist is worse than no link, so the paths are asserted literally.
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';

// options.ts calls buildPage() at module load, so every browser/chrome API it
// touches on the way down has to exist on globalThis BEFORE the import.
vi.hoisted(() => {
  // jsdom ships CSSStyleSheet without the constructable-stylesheet methods.
  class FakeStyleSheet {
    replaceSync(): void {}
  }
  (globalThis as Record<string, unknown>).CSSStyleSheet = FakeStyleSheet;
  Object.defineProperty(globalThis.document, 'adoptedStyleSheets', {
    configurable: true,
    writable: true,
    value: [],
  });

  (globalThis as Record<string, unknown>).chrome = {
    runtime: {
      getManifest: () => ({ version: '1.2.3' }),
      getURL: (path: string) => `chrome-extension://test/${path}`,
      lastError: undefined,
    },
    storage: {
      local: {
        get: (_keys: unknown, cb?: (result: Record<string, unknown>) => void) => {
          if (cb) cb({});
          return Promise.resolve({});
        },
        set: (_items: unknown, cb?: () => void) => {
          if (cb) cb();
          return Promise.resolve();
        },
        remove: () => Promise.resolve(),
      },
    },
    tabs: {
      query: (_q: unknown, cb?: (tabs: unknown[]) => void) => {
        if (cb) cb([]);
        return Promise.resolve([]);
      },
      create: () => Promise.resolve({}),
    },
  };
});

vi.mock('../src/features/cloud-bridge/freeTrialClient', () => ({
  getAuthToken: vi.fn().mockResolvedValue(null),
  clearAuthToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/features/cloud-bridge/clerkAuth', () => ({
  isClerkExtensionAuthConfigured: () => true,
  openClerkSignIn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/features/options/account-state', () => ({
  beginOptionsAccountRefresh: vi.fn().mockResolvedValue(undefined),
}));

describe('options page — Help', () => {
  it('renders a Help section linking to real web routes', async () => {
    await import('../src/options');

    const titles = Array.from(document.querySelectorAll('.opt-section-title')).map(
      (node) => node.textContent,
    );
    expect(titles).toContain('Help');

    const paths = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.opt-link')).map(
      (anchor) => new URL(anchor.href).pathname,
    );
    expect(paths).toEqual(expect.arrayContaining(['/help', '/docs', '/support']));
  });

  it('opens help destinations in a new tab without leaking the opener', () => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a.opt-link'));
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      expect(new URL(anchor.href).origin).toBe('https://agiworkforce.com');
      expect(anchor.target).toBe('_blank');
      expect(anchor.rel).toContain('noopener');
    }
  });
});
