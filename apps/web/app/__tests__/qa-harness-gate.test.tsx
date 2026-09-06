import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { DISALLOW_APP, SITE_URL } from '@/lib/seo/site';

const APP_DIR = resolve(__dirname, '..');

const HARNESS_SEGMENT = /^(dev|debug|qa[-a-z0-9]*|.*-(demo|harness|preview))$/;

function harnessSegments(): string[] {
  return readdirSync(APP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && HARNESS_SEGMENT.test(entry.name))
    .map((entry) => entry.name);
}

function segmentPages(segment: string): string[] {
  const segmentDir = resolve(APP_DIR, segment);
  return readdirSync(segmentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((page) => existsSync(resolve(segmentDir, page, 'page.tsx')));
}

const PRODUCTION_GUARD = /process\.env(\.NODE_ENV|\[['"]NODE_ENV['"]\])\s*===\s*['"]production['"]/;

describe('SIX-24, /dev harness segment layout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('answers 404 in production, so no harness page under it is reachable there', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { default: DevHarnessLayout } = await import('../dev/layout');

    expect(() => DevHarnessLayout({ children: <div data-testid="harness">harness</div> })).toThrow(
      /NEXT_HTTP_ERROR_FALLBACK;404/,
    );
  });

  it('renders the harness outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { default: DevHarnessLayout } = await import('../dev/layout');

    render(DevHarnessLayout({ children: <div data-testid="harness">harness</div> }));

    expect(screen.getByTestId('harness')).toBeInTheDocument();
  });
});

describe('SIX-24, every harness route segment carries a production guard', () => {
  const segments = harnessSegments();

  it('finds at least the /dev segment (guards the sweep itself)', () => {
    expect(segments).toContain('dev');
  });

  it.each(segments)(
    '%s guards every non-public page at the segment or page boundary',
    (segment) => {
      const layoutPath = resolve(APP_DIR, segment, 'layout.tsx');
      const layoutSource = existsSync(layoutPath) ? readFileSync(layoutPath, 'utf8') : '';
      const layoutGuarded =
        PRODUCTION_GUARD.test(layoutSource) && /notFound\(\)/.test(layoutSource);

      if (layoutGuarded) {
        return;
      }

      for (const page of segmentPages(segment)) {
        const route = `${segment}/${page}`;
        const pagePath = resolve(APP_DIR, segment, page, 'page.tsx');
        const source = readFileSync(pagePath, 'utf8');
        expect(
          source,
          `${route}/page.tsx is missing a production guard, the segment layout does not gate it`,
        ).toMatch(PRODUCTION_GUARD);
        expect(source).toMatch(/notFound\(\)/);
      }
    },
  );
});

describe('SIX-24, harness paths are not crawlable', () => {
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
