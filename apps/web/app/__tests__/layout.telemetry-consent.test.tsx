import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/font/google', () => ({
  Geist: () => ({ variable: '--font-geist-sans' }),
  Geist_Mono: () => ({ variable: '--font-geist-mono' }),
  JetBrains_Mono: () => ({ variable: '--font-jetbrains' }),
  Newsreader: () => ({ variable: '--font-newsreader' }),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => (name === 'x-nonce' ? 'test-nonce' : null),
  })),
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn(), delete: vi.fn() })),
}));

vi.mock('./providers', () => ({ default: 'providers-stub' }));
vi.mock('../BrowserIdentityBoundary', () => ({
  BrowserIdentityBoundary: 'browser-identity-boundary-stub',
}));
vi.mock('../ProductRuntimeProviders', () => ({ default: 'product-runtime-providers-stub' }));
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('root layout keeps account consent out of public rendering', () => {
  it('does not publish an account telemetry decision on the site-wide html element', async () => {
    const rendered = await RootLayout({ children: CHILDREN });
    const attributes = (rendered as { props: Record<string, unknown> }).props;

    expect(attributes['data-telemetry-consent']).toBeUndefined();
  });
});
