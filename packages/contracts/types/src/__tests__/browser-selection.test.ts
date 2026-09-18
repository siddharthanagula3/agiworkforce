import { describe, expect, it } from 'vitest';
import {
  BROWSER_SELECTION_ORDER,
  broadensSiteAccess,
  browserSiteAccess,
  selectBrowser,
} from '../browser-selection';
import { BROWSER_SESSION_KINDS } from '../browser-session';

const ALL = [...BROWSER_SESSION_KINDS];

describe('browser site access', () => {
  it('ranks the signed-in profile above both isolated sessions', () => {
    expect(browserSiteAccess('user-chrome')).toBe('user-profile');
    expect(browserSiteAccess('built-in')).toBe('isolated-local');
    expect(browserSiteAccess('cloud')).toBe('isolated-remote');
    expect(broadensSiteAccess('built-in', 'user-chrome')).toBe(true);
    expect(broadensSiteAccess('cloud', 'built-in')).toBe(true);
    expect(broadensSiteAccess('user-chrome', 'built-in')).toBe(false);
  });

  it('probes least privilege first', () => {
    expect(BROWSER_SELECTION_ORDER[0]).toBe('cloud');
    expect(BROWSER_SELECTION_ORDER[BROWSER_SELECTION_ORDER.length - 1]).toBe('user-chrome');
  });
});

describe('automatic selection', () => {
  it('picks the built-in browser on a desktop that also has the extension connected', () => {
    const selection = selectBrowser({ present: ['built-in', 'user-chrome'] });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('built-in');
    expect(selection.viaFallback).toBe(false);
    expect(selection.declined.map((entry) => entry.kind)).toContain('cloud');
  });

  it('picks the user Chrome on a surface where nothing else is present', () => {
    const selection = selectBrowser({ present: ['user-chrome'] });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('user-chrome');
    expect(selection.declined.find((entry) => entry.kind === 'built-in')?.reason).toBe(
      'not-present-on-this-surface',
    );
  });

  it('refuses rather than inventing a session when the surface drives none', () => {
    const selection = selectBrowser({ present: [] });
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.declined).toHaveLength(ALL.length);
  });
});

describe('user override', () => {
  it('honours an explicit choice the surface can drive', () => {
    const selection = selectBrowser({
      requested: 'user-chrome',
      present: ['built-in', 'user-chrome'],
    });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('user-chrome');
    expect(selection.viaFallback).toBe(false);
  });

  it('refuses a choice the workspace policy forbids instead of quietly using another', () => {
    const selection = selectBrowser({
      requested: 'user-chrome',
      allowed: ['built-in', 'cloud'],
      present: ['built-in', 'user-chrome'],
    });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('built-in');
    expect(selection.viaFallback).toBe(true);
    expect(selection.declined.find((entry) => entry.kind === 'user-chrome')?.reason).toBe(
      'not-allowed-by-policy',
    );
  });
});

describe('fallback cannot broaden site access', () => {
  it('refuses a cloud request rather than running it in the signed-in Chrome', () => {
    const selection = selectBrowser({ requested: 'cloud', present: ['built-in', 'user-chrome'] });
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    for (const kind of ['built-in', 'user-chrome'] as const) {
      expect(selection.declined.find((entry) => entry.kind === kind)?.reason).toBe(
        'would-broaden-access',
      );
    }
    expect(selection.reason).toContain('cloud browser');
  });

  it('refuses to fall back from the built-in browser into the signed-in profile', () => {
    const selection = selectBrowser({ requested: 'built-in', present: ['user-chrome'] });
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.declined.find((entry) => entry.kind === 'user-chrome')?.reason).toBe(
      'would-broaden-access',
    );
  });

  it('allows a narrowing fallback and says so', () => {
    const selection = selectBrowser({ requested: 'user-chrome', present: ['built-in'] });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('built-in');
    expect(selection.viaFallback).toBe(true);
    expect(selection.reason).toContain('no more of your data');
  });

  it('never returns a session that reaches more than the one that was asked for', () => {
    for (const requested of BROWSER_SESSION_KINDS) {
      const selection = selectBrowser({ requested, present: ALL });
      if (!selection.ok) continue;
      expect(broadensSiteAccess(requested, selection.kind)).toBe(false);
    }
  });
});
