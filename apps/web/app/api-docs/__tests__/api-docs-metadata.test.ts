import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/api-docs/layout';

/**
 * `/api-docs` is the page a third-party integrator lands on, so it may name
 * only the developer surface that `apps/web/public/openapi.json` documents and
 * the repository actually ships.
 *
 * Two claims failed that before this test existed. The layout metadata sold
 * "webhooks, and SDK guides" — the published spec has no webhook path and every
 * workspace package is `private: true`, so neither is installable or callable.
 * And the page said the OpenAPI bundle "publish[es] at public launch" while
 * `public/openapi.json` was already being served, which hid the one artifact a
 * developer integrates against.
 *
 * Every allowance below is derived, not hardcoded: document a webhook path in
 * the spec, or publish a non-private package, and the matching term becomes
 * legal copy again.
 */
const APP_DIR = path.join(__dirname, '..');
const WEB_ROOT = path.resolve(APP_DIR, '../..');
const REPO_ROOT = path.resolve(WEB_ROOT, '../..');

const SPEC_PATH = path.join(WEB_ROOT, 'public/openapi.json');

function specPaths(): string[] {
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8')) as {
    paths: Record<string, unknown>;
  };
  return Object.keys(spec.paths).map((value) => value.toLowerCase());
}

/** A package a developer could `npm install` — i.e. one that is not private. */
function publishablePackages(): string[] {
  const packagesDir = path.join(REPO_ROOT, 'packages');
  if (!fs.existsSync(packagesDir)) return [];

  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifest = path.join(packagesDir, entry.name, 'package.json');
      if (!fs.existsSync(manifest)) return [];
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
        name?: string;
        private?: boolean;
      };
      return parsed.private === true ? [] : [parsed.name ?? entry.name];
    });
}

function metadataText(): string {
  const openGraph = metadata.openGraph as { title?: string; description?: string } | undefined;
  const twitter = metadata.twitter as { title?: string; description?: string } | undefined;
  return [
    metadata.title,
    metadata.description,
    ...((metadata.keywords as string[] | undefined) ?? []),
    openGraph?.title,
    openGraph?.description,
    twitter?.title,
    twitter?.description,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' | ')
    .toLowerCase();
}

const pageSource = fs.readFileSync(path.join(APP_DIR, 'page.tsx'), 'utf8');

describe('/api-docs metadata', () => {
  const text = metadataText();

  /**
   * Endpoint families an integrator would go looking for after reading the
   * copy. Each is claimable only once the published spec has a path for it.
   */
  it.each(['webhook', 'batch', 'rerank', 'realtime', 'fine-tun'])(
    'does not advertise "%s" without a documented endpoint',
    (term) => {
      if (specPaths().some((specPath) => specPath.includes(term))) return;
      expect(
        text,
        `metadata names "${term}" but openapi.json documents no such path`,
      ).not.toContain(term);
    },
  );

  it('does not advertise an SDK while every package is private', () => {
    if (publishablePackages().length > 0) return;
    expect(text, 'metadata names an SDK but no publishable package exists').not.toContain('sdk');
  });
});

describe('/api-docs page', () => {
  it('links to the OpenAPI bundle it describes', () => {
    expect(pageSource).toContain('/openapi.json');
  });

  it('serves the bundle it links to', () => {
    expect(fs.existsSync(SPEC_PATH), `${SPEC_PATH} is linked from /api-docs but absent`).toBe(true);
  });

  it('does not promise the bundle for a future launch now that it ships', () => {
    expect(pageSource).not.toMatch(/OpenAPI bundle[^<]*publish at public launch/i);
  });
});
