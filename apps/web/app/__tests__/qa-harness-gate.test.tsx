
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { DISALLOW_APP, SITE_URL } from '@/lib/seo/site';

const NOT_FOUND = new Error('NEXT_NOT_FOUND');

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

const APP_DIR = resolve(__dirname, '..');

const HARNESS_SEGMENT = /^(dev|debug|qa[-a-z0-9]*|.*-(demo|harness|preview))$/;

function harnessSegments(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && HARNESS_SEGMENT.test(entry.name))
    .map((entry) => entry.name);
}

const PRODUCTION_GUARD = /process\.env(\.NODE_ENV|\[['"]NODE_ENV['"]\])\s*===\s*['"]production['"]/;

describe('SIX-24 — /dev harness segment gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('404s the whole segment when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { default: DevHarnessLayout } = await import('../dev/layout');

    expect(() => DevHarnessLayout({ children: <div>harness</div> })).toThrow(NOT_FOUND);
  });

  it('renders the harness outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { default: DevHarnessLayout } = await import('../dev/layout');

    render(DevHarnessLayout({ children: <div data-testid="harness">harness</div> }));

    expect(screen.getByTestId('harness')).toBeInTheDocument();
  });
});

describe('SIX-24 — every harness route segment carries a production guard', () => {
  const segments = harnessSegments();

  it('finds at least the /dev segment (guards the sweep itself)', () => {
    expect(segments).toContain('dev');
  });

  it.each(segments)('%s has a production guard at the segment boundary', (segment) => {
    const layoutPath = resolve(APP_DIR, segment, 'layout.tsx');
    expect(
      existsSync(layoutPath),
      `app/${segment}/layout.tsx is missing — a harness segment must 404 in production`,
    ).toBe(true);

    const source = readFileSync(layoutPath, 'utf8');
    expect(source).toMatch(PRODUCTION_GUARD);
    expect(source).toMatch(/notFound\(\)/);
  });
});

describe('SIX-24 — harness paths are not crawlable', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const ALLOWED_BOTS = ['*', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Googlebot', 'bingbot'];

  it.each(ALLOWED_BOTS)('disallows /dev/ and /qa-artifacts for %s', (bot) => {
    const rule = rules.find((r) => r.userAgent === bot);
    const disallow = (rule?.disallow ?? []) as string[];
    expect(disallow, `${bot} should disallow /dev/`).toContain('/dev/');
    expect(disallow, `${bot} should disallow /qa-artifacts`).toContain('/qa-artifacts');
  });

  it('never lists a disallowed path in the sitemap', () => {
    const paths = sitemap().map((entry) => entry.url.replace(SITE_URL, '') || '/');
    for (const disallowed of DISALLOW_APP) {
      const normalized = disallowed.endsWith('/') ? disallowed.slice(0, -1) : disallowed;
      expect(
        paths.some((path) => path === normalized || path.startsWith(`${normalized}/`)),
        `sitemap must not list ${disallowed}`,
      ).toBe(false);
    }
  });
});
