import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/script', () => ({
  default: ({ src, id, children }: { src?: string; id?: string; children?: string }) =>
    src ? (
      <script data-testid="ga-script" src={src} defer />
    ) : (
      <script data-testid={id ?? 'ga-inline'}>{children}</script>
    ),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/privacy/requests' }));

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

import { AnalyticsConsentGate } from '@shared/components/AnalyticsConsentGate';
import {
  ALL_ACCEPTED_PREFERENCES,
  COOKIE_CONSENT_STORAGE_KEY,
  buildCookieConsentRecord,
  readCookiePreferences,
  type CookiePreferences,
} from '@shared/lib/cookie-consent';
import { CONSENT_PURPOSES } from '@/lib/consent-purposes';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { ConsentCentre } from '../requests/ConsentCentre';

const TRACKING_ID = 'G-TESTID0000';
const ANALYTICS_PURPOSE = 'product_analytics';

function gaScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>('[data-testid="ga-script"]'));
}

function storeDecision(preferences: CookiePreferences): void {
  window.localStorage.setItem(
    COOKIE_CONSENT_STORAGE_KEY,
    JSON.stringify(buildCookieConsentRecord(preferences)),
  );
}

function analyticsDisabledFlag(): unknown {
  return (window as unknown as Record<string, unknown>)[`ga-disable-${TRACKING_ID}`];
}

interface StoredConsent {
  purpose: string;
  granted: boolean;
}

function stubConsentApi(initial: StoredConsent[]) {
  const consents = new Map(initial.map((entry) => [entry.purpose, entry.granted]));
  const posted: Array<{ purpose: string; granted: boolean }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/consent' && init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as {
        decisions: Array<{ purpose: string; granted: boolean }>;
      };
      for (const decision of body.decisions) {
        consents.set(decision.purpose, decision.granted);
        posted.push(decision);
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url === '/api/consent') {
      return new Response(
        JSON.stringify({
          noticeVersion: POLICY_LAST_UPDATED.privacy,
          purposes: CONSENT_PURPOSES,
          consents: [...consents.entries()].map(([purpose, granted]) => ({
            purpose,
            granted,
            noticeVersion: POLICY_LAST_UPDATED.privacy,
            surface: 'web-consent-centre',
            recordedAt: '2026-09-01T00:00:00.000Z',
          })),
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);
  return { posted };
}

function analyticsButton(): HTMLElement {
  const purpose = CONSENT_PURPOSES.find((entry) => entry.id === ANALYTICS_PURPOSE);
  const row = screen.getByText(purpose?.description ?? '').closest('td, li, div');
  if (!row) throw new Error('analytics consent row not found');
  const button = row.querySelector('button');
  if (!button) throw new Error('analytics consent button not found');
  return button;
}

beforeEach(() => {
  window.localStorage.clear();
  delete (window as unknown as Record<string, unknown>)[`ga-disable-${TRACKING_ID}`];
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('consent centre analytics withdrawal reaches the analytics gate', () => {
  it('stops analytics in the same open tab when consent is withdrawn', async () => {
    storeDecision(ALL_ACCEPTED_PREFERENCES);
    const { posted } = stubConsentApi([{ purpose: ANALYTICS_PURPOSE, granted: true }]);

    render(
      <>
        <ConsentCentre />
        <AnalyticsConsentGate trackingId={TRACKING_ID} />
      </>,
    );

    await waitFor(() => expect(gaScripts()).toHaveLength(1));

    await act(async () => {
      fireEvent.click(analyticsButton());
    });

    await waitFor(() => expect(gaScripts()).toHaveLength(0));
    expect(posted).toContainEqual({ purpose: ANALYTICS_PURPOSE, granted: false });
    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: false });
    expect(analyticsDisabledFlag()).toBe(true);
  });

  it('turns analytics back on in the same tab when consent is given again', async () => {
    stubConsentApi([{ purpose: ANALYTICS_PURPOSE, granted: false }]);

    render(
      <>
        <ConsentCentre />
        <AnalyticsConsentGate trackingId={TRACKING_ID} />
      </>,
    );

    await waitFor(() => expect(screen.getAllByRole('button').length).toBeGreaterThan(0));
    expect(gaScripts()).toHaveLength(0);

    await act(async () => {
      fireEvent.click(analyticsButton());
    });

    await waitFor(() => expect(gaScripts()).toHaveLength(1));
    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });
    expect(analyticsDisabledFlag()).toBe(false);
  });

  it('reconciles a browser that still allows analytics with an account that withdrew it', async () => {
    storeDecision(ALL_ACCEPTED_PREFERENCES);
    stubConsentApi([{ purpose: ANALYTICS_PURPOSE, granted: false }]);

    render(
      <>
        <ConsentCentre />
        <AnalyticsConsentGate trackingId={TRACKING_ID} />
      </>,
    );

    await waitFor(() => expect(readCookiePreferences()?.analytics).toBe(false));
    await waitFor(() => expect(gaScripts()).toHaveLength(0));
  });

  it('leaves the analytics preference alone when another purpose changes', async () => {
    storeDecision(ALL_ACCEPTED_PREFERENCES);
    stubConsentApi([
      { purpose: ANALYTICS_PURPOSE, granted: true },
      { purpose: 'product_updates', granted: true },
    ]);

    render(
      <>
        <ConsentCentre />
        <AnalyticsConsentGate trackingId={TRACKING_ID} />
      </>,
    );

    await waitFor(() => expect(gaScripts()).toHaveLength(1));

    const updates = CONSENT_PURPOSES.find((entry) => entry.id === 'product_updates');
    const row = screen.getByText(updates?.description ?? '').closest('td, li, div');
    const button = row?.querySelector('button');
    if (!button) throw new Error('product updates consent button not found');

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(gaScripts()).toHaveLength(1));
    expect(readCookiePreferences()).toEqual({ necessary: true, analytics: true });
  });
});
