import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { metadata } from '@/app/api-docs/layout';

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
