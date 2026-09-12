import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Pre-release claim audit, 2026-09-12.
 *
 * /api-docs documented `GET /api/llm/v1/credits`, a path that has never had a
 * route handler (the balance lives at `/api/llm/v1/credits/balance`), and split
 * the two credentials as "chat completions and embeddings take a session bearer
 * token". Chat completions accepts an AGI API key: its auth gate passes
 * `apiKeyScope: 'inference:write'` to `getClerkAuthUser`, and `lib/api-auth.ts`
 * admits an `sk_live_` bearer exactly when that option is present. Embeddings is
 * the one operation that omits it, so it is the only session-only endpoint.
 *
 * Both rules below read the deciding source: the published bundle for the paths,
 * and the route handlers for which credential each accepts.
 */

const APP_DIR = path.join(__dirname, '..');
const WEB_ROOT = path.resolve(APP_DIR, '../..');
const SPEC_PATH = path.join(WEB_ROOT, 'public/openapi.json');
const GATEWAY_DIR = path.join(WEB_ROOT, 'app/api/llm/v1');

const pageSource = fs.readFileSync(path.join(APP_DIR, 'page.tsx'), 'utf8');

function specPaths(): Set<string> {
  const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8')) as { paths: Record<string, unknown> };
  return new Set(Object.keys(spec.paths).map((value) => `/api${value}`));
}

function pathsNamedOnThePage(): string[] {
  return [...new Set(pageSource.match(/\/api\/llm\/v1\/[a-z0-9/-]+/gu) ?? [])].filter(
    (value) => !value.endsWith('/'),
  );
}

/** True when the handler tree for this gateway path opts into API-key auth. */
function acceptsApiKey(relativeDir: string): boolean {
  const dir = path.join(GATEWAY_DIR, relativeDir);
  expect(fs.existsSync(dir), `${relativeDir} is gone from the gateway`).toBe(true);
  const files = fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory() && entry.name === 'lib'
        ? fs.readdirSync(path.join(dir, entry.name)).map((name) => path.join(dir, 'lib', name))
        : entry.isFile()
          ? [path.join(dir, entry.name)]
          : [],
    )
    .filter((file) => file.endsWith('.ts') && !file.includes('.test.'));
  return files.some((file) => fs.readFileSync(file, 'utf8').includes('apiKeyScope:'));
}

describe('/api-docs, documented endpoints exist in the published bundle', () => {
  it('names no gateway path the bundle does not document', () => {
    const documented = specPaths();
    const named = pathsNamedOnThePage();
    expect(named.length).toBeGreaterThan(0);

    for (const value of named) {
      expect(
        documented.has(value),
        `/api-docs names ${value}, which openapi.json does not document`,
      ).toBe(true);
    }
  });

  it('gives the credit balance its real path', () => {
    expect(pageSource).toContain('/api/llm/v1/credits/balance');
    expect(
      /\/api\/llm\/v1\/credits(?!\/balance)/u.test(pageSource),
      '/api-docs is back to the bare /api/llm/v1/credits path, which has no route handler',
    ).toBe(false);
  });
});

describe('/api-docs, the credential split matches the route handlers', () => {
  it('keeps embeddings as the only session-only operation', () => {
    expect(acceptsApiKey('embeddings')).toBe(false);
    for (const dir of ['chat/completions', 'audio/transcriptions', 'models', 'credits/balance']) {
      expect(acceptsApiKey(dir), `${dir} no longer accepts an API key`).toBe(true);
    }
  });

  it('does not put chat completions on the session-only side of the split', () => {
    for (const banned of [
      'Chat completions and embeddings take a session bearer token',
      'Two credentials, and they are not interchangeable.',
      'Chat and embeddings',
    ]) {
      expect(
        pageSource.includes(banned),
        `/api-docs claims "${banned}" while chat completions accepts an AGI API key`,
      ).toBe(false);
    }
  });

  it('says plainly which operation refuses the key', () => {
    expect(pageSource).toMatch(/reaches everything except embeddings/u);
    expect(pageSource).toMatch(/Embeddings refuses it/u);
  });
});
