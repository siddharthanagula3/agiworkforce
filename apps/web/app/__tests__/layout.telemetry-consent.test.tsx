import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  readServerTelemetryConsent: vi.fn(),
}));

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
  JetBrains_Mono: () => ({ variable: '--font-jetbrains' }),
  Newsreader: () => ({ variable: '--font-newsreader' }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({ get: () => 'test-nonce' })),
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn(), delete: vi.fn() })),
}));

vi.mock('@clerk/nextjs', () => ({ ClerkProvider: 'clerk-provider-stub' }));
vi.mock('@clerk/nextjs/server', () => ({ auth: (...args: unknown[]) => mocks.auth(...args) }));

vi.mock('@/lib/server/telemetry-consent', () => ({
  readServerTelemetryConsent: (...args: unknown[]) => mocks.readServerTelemetryConsent(...args),
}));

vi.mock('./providers', () => ({ default: 'providers-stub' }));
vi.mock('@shared/components/AnalyticsConsentGate', () => ({ AnalyticsConsentGate: 'gate-stub' }));
vi.mock('@shared/components/CookieConsent', () => ({ CookieConsent: 'cookie-consent-stub' }));
vi.mock('@shared/components/accessibility/SkipLinks', () => ({ SkipLinks: 'skip-links-stub' }));
vi.mock('@shared/components/seo/JsonLd', () => ({ JsonLd: 'json-ld-stub' }));
vi.mock('@/shared/components/seo/theme-init-script', () => ({ THEME_INIT_SCRIPT: '/* noop */' }));
vi.mock('@/lib/seo/site', () => ({ OG_IMAGE: { url: '/og.png', width: 1200, height: 630 } }));
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
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.readServerTelemetryConsent.mockResolvedValue(true);

    const rendered = await RootLayout({ children: CHILDREN });

    expect(attributeOf(rendered)).toBe('true');
  });

  it('renders false for a signed-in account that never opted in', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.readServerTelemetryConsent.mockResolvedValue(false);

    const rendered = await RootLayout({ children: CHILDREN });

    expect(attributeOf(rendered)).toBe('false');
  });

  it('renders false for a signed-out visitor without reading consent at all', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    const rendered = await RootLayout({ children: CHILDREN });

    expect(attributeOf(rendered)).toBe('false');
    expect(mocks.readServerTelemetryConsent).not.toHaveBeenCalled();
  });

  it('renders false when the consent read resolves false after an internal failure', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });
    mocks.readServerTelemetryConsent.mockResolvedValue(false);

    const rendered = await RootLayout({ children: CHILDREN });

    expect(attributeOf(rendered)).toBe('false');
  });

  it('re-reads consent on every render, so a revoke-then-reload sees the new value', async () => {
    mocks.auth.mockResolvedValue({ userId: 'user_1' });

    mocks.readServerTelemetryConsent.mockResolvedValueOnce(true);
    const first = await RootLayout({ children: CHILDREN });
    expect(attributeOf(first)).toBe('true');

    mocks.readServerTelemetryConsent.mockResolvedValueOnce(false);
    const second = await RootLayout({ children: CHILDREN });
    expect(attributeOf(second)).toBe('false');
  });
});
