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
  buildCookieConsentRecord,
  isAnalyticsAllowed,
  parseCookiePreferences,
  readCookiePreferences,
  type CookiePreferences,
} from '@shared/lib/cookie-consent';

vi.mock('next/script', () => ({
  default: ({ src, id, children }: { src?: string; id?: string; children?: string }) =>
    src ? (
      <script data-testid="ga-script" src={src} defer />
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

function gaScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('[data-testid="ga-script"]'));
}

function storeDecision(preferences: CookiePreferences): void {
  window.localStorage.setItem(
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify(buildCookieConsentRecord(preferences)),
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.style.removeProperty('--agi-consent-inset');
});

const consentInset = () => document.documentElement.style.getPropertyValue('--agi-consent-inset');

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

    await waitFor(() => expect(gaScripts()).toHaveLength(0));
  });

  it('inserts no gtag.js script when the user chose necessary-only', async () => {
    storeDecision(NECESSARY_ONLY_PREFERENCES);

    render(<AnalyticsConsentGate trackingId={TRACKING_ID} />);

    await waitFor(() => expect(gaScripts()).toHaveLength(0));
  });

  it('loads gtag.js for the configured measurement id once analytics is allowed', async () => {
    storeDecision(ALL_ACCEPTED_PREFERENCES);

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

      expect(gaScripts()).toHaveLength(0);

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      const allow = await screen.findByRole('button', { name: 'Allow analytics' });

      await act(async () => {
        fireEvent.click(allow);
      });

      await waitFor(() => expect(gaScripts()).toHaveLength(1));
      expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });

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

  it('closing records necessary-only rather than leaving the visitor undecided', async () => {
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
      const close = await screen.findByRole('button', {
        name: 'Close and reject non-essential cookies',
      });
      await act(async () => {
        fireEvent.click(close);
      });

      expect(readCookiePreferences()).toEqual({ necessary: true, analytics: false });
      await waitFor(() => expect(gaScripts()).toHaveLength(0));
      expect(screen.queryByRole('button', { name: 'Allow analytics' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // Dismissing used to write nothing at all, so the banner came back on every
  // reload and covered the composer again each time.
  it('stays gone on the next visit after the banner was closed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const first = render(<CookieConsent />);
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      await act(async () => {
        fireEvent.click(
          screen.getByRole('button', { name: 'Close and reject non-essential cookies' }),
        );
      });
      first.unmount();

      render(<CookieConsent />);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.queryByRole('button', { name: 'Allow analytics' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Close and reject non-essential cookies' }),
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // The banner is fixed at z-50 over the composer. Both shells end at
  // `--agi-consent-inset`, so publishing it while up and releasing it once
  // answered is what keeps the composer out from under the card.
  it('publishes its height while up and releases it once answered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<CookieConsent />);
      expect(consentInset(), 'nothing to clear before the banner appears').toBe('');

      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      expect(consentInset(), 'the shells need a height to end at while it is up').not.toBe('');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Necessary only' }));
      });

      await waitFor(() =>
        expect(consentInset(), 'an answered banner must give the space back').toBe(''),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not re-prompt a visitor who already decided', async () => {
    storeDecision(NECESSARY_ONLY_PREFERENCES);
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

  it('re-prompts, and keeps analytics off, when the stored consent predates the notice', async () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_STORAGE_KEY,
      JSON.stringify({
        ...buildCookieConsentRecord(ALL_ACCEPTED_PREFERENCES),
        noticeVersion: 'cookies:1999-01-01+privacy:1999-01-01',
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <>
          <CookieConsent />
          <AnalyticsConsentGate trackingId={TRACKING_ID} />
        </>,
      );

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(await screen.findByRole('button', { name: 'Allow analytics' })).toBeTruthy();
      expect(gaScripts()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
