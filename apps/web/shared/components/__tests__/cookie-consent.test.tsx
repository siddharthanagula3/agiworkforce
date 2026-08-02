/**
 * SIX-25 regression: GA4 must not load without analytics consent.
 *
 * The defect: `CookieConsent` was a complete banner whose only occurrence in
 * the repo was its own declaration, while `app/layout.tsx` rendered
 * `<GoogleAnalytics/>` for every visitor whenever NEXT_PUBLIC_GA_TRACKING_ID
 * was set — no consent check anywhere — against a published /cookies policy
 * that says "Analytics is opt-in".
 *
 * These tests assert the shipped behaviour end to end at the component seam:
 * no stored consent → no gtag.js script; opt in → script; opt back out →
 * script removed.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsConsentGate } from '../AnalyticsConsentGate';
import { CookieConsent } from '../CookieConsent';
import {
  ALL_ACCEPTED_PREFERENCES,
  ANALYTICS_REQUIRES_CONSENT,
  COOKIE_CONSENT_OPEN_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  NECESSARY_ONLY_PREFERENCES,
  isAnalyticsAllowed,
  parseCookiePreferences,
  readCookiePreferences,
} from '@shared/lib/cookie-consent';

// next/script renders nothing useful in jsdom; stand in a real <script> so the
// assertions are about an actual gtag.js tag in the document.
vi.mock('next/script', () => ({
  default: ({ src, id, children }: { src?: string; id?: string; children?: string }) =>
    src ? (
      // Test stand-in for next/script. Deliberately NOT `async`: React 19
      // hoists async scripts into <head>, which would move the tag out of the
      // render container and make the assertions test React's hoisting rather
      // than the consent gate.
      <script data-testid="ga-script" src={src} />
    ) : (
      <script data-testid={id ?? 'ga-inline'}>{children}</script>
    ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/pricing',
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const TRACKING_ID = 'G-TESTID0000';

/** Queries the whole document: a real gtag.js tag anywhere counts as loaded. */
function gaScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('[data-testid="ga-script"]'));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('cookie-consent seam', () => {
  it('defaults to opt-in, so an undecided visitor gets no analytics', () => {
    expect(ANALYTICS_REQUIRES_CONSENT).toBe(true);
    expect(isAnalyticsAllowed(null)).toBe(false);
    expect(isAnalyticsAllowed(NECESSARY_ONLY_PREFERENCES)).toBe(false);
    expect(isAnalyticsAllowed(ALL_ACCEPTED_PREFERENCES)).toBe(true);
  });

  it('treats unreadable or malformed storage as undecided, never as consent', () => {
    expect(parseCookiePreferences(null)).toBeNull();
    expect(parseCookiePreferences('not json')).toBeNull();
    expect(parseCookiePreferences('{"analytics":"yes"}')).toBeNull();
    expect(parseCookiePreferences('{"analytics":true}')).toEqual({
      necessary: true,
      analytics: true,
    });
  });
});

describe('AnalyticsConsentGate', () => {
  it('inserts no gtag.js script when nothing is stored', async () => {
    render(<AnalyticsConsentGate trackingId={TRACKING_ID} />);

    // The effect runs on mount; give it a tick and assert it still rendered
    // nothing rather than asserting before the read could have happened.
    await waitFor(() => expect(gaScripts()).toHaveLength(0));
  });

  it('inserts no gtag.js script when the user chose necessary-only', async () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify(NECESSARY_ONLY_PREFERENCES),
    );

    render(<AnalyticsConsentGate trackingId={TRACKING_ID} />);

    await waitFor(() => expect(gaScripts()).toHaveLength(0));
  });

  it('loads gtag.js for the configured measurement id once analytics is allowed', async () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify(ALL_ACCEPTED_PREFERENCES),
    );

    render(<AnalyticsConsentGate trackingId={TRACKING_ID} />);

    await waitFor(() => expect(gaScripts()).toHaveLength(1));
    expect(gaScripts()[0]?.getAttribute('src')).toBe(
      `https://www.googletagmanager.com/gtag/js?id=${TRACKING_ID}`,
    );
  });
});

describe('CookieConsent banner drives the gate', () => {
  it('opting in loads GA without a reload; opting back out unmounts it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <>
          <CookieConsent />
          <AnalyticsConsentGate trackingId={TRACKING_ID} />
        </>,
      );

      // Nothing stored yet: no analytics before the user has said anything.
      expect(gaScripts()).toHaveLength(0);

      // The banner appears after its 1s settle delay.
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      const allow = await screen.findByRole('button', { name: 'Allow analytics' });

      await act(async () => {
        fireEvent.click(allow);
      });

      await waitFor(() => expect(gaScripts()).toHaveLength(1));
      expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });

      // Withdrawal: reopen preferences from /cookies, switch analytics off, save.
      await act(async () => {
        window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_OPEN_EVENT));
      });
      const analyticsSwitch = await screen.findByRole('switch', { name: 'Analytics cookies' });
      await act(async () => {
        fireEvent.click(analyticsSwitch);
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
      });

      await waitFor(() => expect(gaScripts()).toHaveLength(0));
      expect(readCookiePreferences()).toEqual({ necessary: true, analytics: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('"Necessary only" records a real decision and keeps analytics off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <>
          <CookieConsent />
          <AnalyticsConsentGate trackingId={TRACKING_ID} />
        </>,
      );

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      const necessaryOnly = await screen.findByRole('button', { name: 'Necessary only' });
      await act(async () => {
        fireEvent.click(necessaryOnly);
      });

      expect(readCookiePreferences()).toEqual({ necessary: true, analytics: false });
      await waitFor(() => expect(gaScripts()).toHaveLength(0));
      expect(screen.queryByRole('button', { name: 'Necessary only' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('is actually mounted by the root layout, and GA4 only through the gate', () => {
    // The original defect was a mount, not a logic bug: the banner existed and
    // nothing rendered it. Assert the mount, and assert the gate is the sole
    // route to GoogleAnalytics anywhere in the app.
    const webRoot = resolve(__dirname, '../../..');
    const layout = readFileSync(join(webRoot, 'app/layout.tsx'), 'utf8');
    expect(layout).toMatch(/<CookieConsent\s*\/>/);
    expect(layout).toMatch(/<AnalyticsConsentGate\b/);
    expect(layout).not.toMatch(/<GoogleAnalytics\b/);

    const GATE = 'shared/components/AnalyticsConsentGate.tsx';
    const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'e2e', 'coverage', 'test-results']);
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP_DIRS.has(entry) || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.endsWith('.tsx')) continue;
        const relative = full.slice(webRoot.length + 1);
        if (relative === GATE || relative.includes('__tests__')) continue;
        if (/<GoogleAnalytics\b/.test(readFileSync(full, 'utf8'))) offenders.push(relative);
      }
    };
    walk(webRoot);

    expect(offenders, 'GoogleAnalytics must only be mounted by AnalyticsConsentGate').toEqual([]);
  });

  it('does not re-prompt a visitor who already decided', async () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify(NECESSARY_ONLY_PREFERENCES),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CookieConsent />);

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.queryByRole('button', { name: 'Allow analytics' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
