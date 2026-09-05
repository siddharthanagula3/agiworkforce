import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  readServerTelemetryConsent: vi.fn(),
}));

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
  IBM_Plex_Sans: () => ({ variable: '--font-ibm-plex-sans' }),
  JetBrains_Mono: () => ({ variable: '--font-jetbrains' }),
  Newsreader: () => ({ variable: '--font-newsreader' }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => 'test-nonce' })),
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn(), delete: vi.fn() })),
}));

vi.mock('@clerk/nextjs', () => ({ ClerkProvider: 'clerk-provider-stub' }));

vi.mock('@/lib/server/telemetry-consent', () => ({
  readServerTelemetryConsent: (...args: unknown[]) => mocks.readServerTelemetryConsent(...args),
}));

vi.mock('./providers', () => ({ default: 'providers-stub' }));
vi.mock('@shared/components/AnalyticsConsentGate', () => ({ AnalyticsConsentGate: 'gate-stub' }));
vi.mock('@shared/components/CookieConsent', () => ({ CookieConsent: 'cookie-consent-stub' }));
vi.mock('@shared/components/accessibility/SkipLinks', () => ({ SkipLinks: 'skip-links-stub' }));
vi.mock('@shared/components/seo/JsonLd', () => ({ JsonLd: 'json-ld-stub' }));
vi.mock('@/shared/components/seo/theme-init-script', () => ({ THEME_INIT_SCRIPT: '/* noop */' }));
vi.mock('@/lib/seo/site', async (importOriginal) => ({
  ...(await importOriginal()),
  OG_IMAGE: { url: '/og.png', width: 1200, height: 630 },
}));
vi.mock('@/lib/seo/structured-data', () => ({
  organizationSchema: () => ({}),
  softwareApplicationSchema: () => ({}),
  webSiteSchema: () => ({}),
}));
vi.mock('../globals.css', () => ({}));

import RootLayout from '../layout';

const CHILDREN = 'root layout body';

function attributeOf(element: unknown): string | undefined {
  return (element as { props: Record<string, unknown> }).props['data-telemetry-consent'] as
    | string
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// WEB-TELEMETRY-CONSENT-NOT-CROSS-DEVICE-01: the root layout is the only
// place that can put the account's real consent in front of
// instrumentation-client.ts before it decides whether to init Sentry.
describe('root layout renders telemetry consent server-side', () => {
  it('renders true for a signed-in account that opted in', async () => {
    mocks.readServerTelemetryConsent.mockResolvedValue(true);

    const rendered = await RootLayout({ children: CHILDREN });

    expect(attributeOf(rendered)).toBe('true');
  });

  it('renders false whenever the consent read resolves false, signed out, never opted in, or failed closed', async () => {
    mocks.readServerTelemetryConsent.mockResolvedValue(false);

    const rendered = await RootLayout({ children: CHILDREN });

    expect(attributeOf(rendered)).toBe('false');
    expect(mocks.readServerTelemetryConsent).toHaveBeenCalledTimes(1);
  });

  it('delegates entirely to the fail-closed helper instead of calling auth() itself', async () => {
    mocks.readServerTelemetryConsent.mockResolvedValue(false);

    await RootLayout({ children: CHILDREN });

    expect(mocks.readServerTelemetryConsent).toHaveBeenCalledTimes(1);
  });

  it('re-reads consent on every render, so a revoke-then-reload sees the new value', async () => {
    mocks.readServerTelemetryConsent.mockResolvedValueOnce(true);
    const first = await RootLayout({ children: CHILDREN });
    expect(attributeOf(first)).toBe('true');

    mocks.readServerTelemetryConsent.mockResolvedValueOnce(false);
    const second = await RootLayout({ children: CHILDREN });
    expect(attributeOf(second)).toBe('false');
  });
});
