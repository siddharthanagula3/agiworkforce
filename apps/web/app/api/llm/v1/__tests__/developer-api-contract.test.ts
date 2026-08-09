/**
 * The published developer contract must describe the API that actually ships.
 *
 * `public/openapi.json` documented checkout, device linking and `/me` and not a
 * single inference endpoint, while the product advertises an OpenAI-compatible
 * gateway — so the one artifact a developer integrates against said nothing
 * about the endpoints they were being sent to.
 *
 * The subtle half is WHICH credential each endpoint takes. An AGI API key
 * (`sk_live_…`) is opaque: `lib/server/rls-db.ts` refuses to bind it as a
 * database subject because it carries no signed `sub` claim. So any route that
 * reaches `getUserScopedDb` is session-only no matter what scope its auth gate
 * accepts, and advertising an API key there would send integrators at a wall.
 * That reachability rule is asserted in both directions here: a documented
 * `ApiKeyAuth` operation must be free of the RLS dependency, and an operation
 * that withholds `ApiKeyAuth` must still have one — otherwise the endpoint has
 * become usable and the spec is the thing that is stale.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { API_KEY_SCOPE_VALUES } from '@/lib/api-key-scopes';
import { rateLimitConfigs } from '@/lib/rate-limit';

const v1Dir = path.resolve(import.meta.dirname, '..');
const webRoot = path.resolve(v1Dir, '../../../..');
const repoRoot = path.resolve(webRoot, '../..');

const spec = JSON.parse(readFileSync(path.join(webRoot, 'public/openapi.json'), 'utf8')) as {
  paths: Record<
    string,
    Record<string, { security?: Array<Record<string, unknown>> } & Record<string, unknown>>
  >;
};

/** Route sources under `dir`, excluding tests — a test may mention a helper the route never calls. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!full.endsWith('.ts') || /\.test\.ts$/.test(full)) return [];
    return [full];
  });
}

function subtreeFor(specPath: string): string {
  return path.join(v1Dir, specPath.replace('/llm/v1/', ''));
}

function subtreeSource(specPath: string): string {
  return sourceFiles(subtreeFor(specPath))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

const v1Operations = Object.entries(spec.paths)
  .filter(([specPath]) => specPath.startsWith('/llm/v1/'))
  .flatMap(([specPath, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ specPath, method, operation })),
  );

function acceptsApiKey(operation: { security?: Array<Record<string, unknown>> }): boolean {
  return (operation.security ?? []).some((requirement) => 'ApiKeyAuth' in requirement);
}

describe('published OpenAPI spec', () => {
  it('documents every inference route an API key can authenticate to', () => {
    const documented = new Set(v1Operations.map(({ specPath }) => specPath));

    for (const file of sourceFiles(v1Dir)) {
      if (!file.endsWith(`${path.sep}route.ts`)) continue;
      if (!/apiKeyScope:/.test(readFileSync(file, 'utf8'))) continue;
      const specPath = `/llm/v1/${path
        .relative(v1Dir, path.dirname(file))
        .split(path.sep)
        .join('/')}`;
      expect(documented, `${specPath} takes an API key but is not in openapi.json`).toContain(
        specPath,
      );
    }
  });

  it('points each documented operation at a route that exports its method', () => {
    for (const { specPath, method } of v1Operations) {
      const source = readFileSync(path.join(subtreeFor(specPath), 'route.ts'), 'utf8');
      expect(source, `${method.toUpperCase()} ${specPath}`).toMatch(
        new RegExp(`export (const|async function|function) ${method.toUpperCase()}\\b`),
      );
    }
  });

  it('names a real scope on every API-key operation and enforces it in the route', () => {
    for (const { specPath, operation } of v1Operations) {
      if (!acceptsApiKey(operation)) continue;
      const scope = operation['x-agi-api-key-scope'];
      expect(API_KEY_SCOPE_VALUES, `${specPath} declares an unknown scope`).toContain(scope);
      expect(subtreeSource(specPath), `${specPath} does not require ${String(scope)}`).toContain(
        `apiKeyScope: '${String(scope)}'`,
      );
    }
  });

  it('offers API-key auth only where the route never binds an RLS subject', () => {
    for (const { specPath, operation } of v1Operations) {
      const bindsRlsSubject = subtreeSource(specPath).includes('getUserScopedDb');
      expect(
        bindsRlsSubject,
        acceptsApiKey(operation)
          ? `${specPath} is advertised to API keys but reaches getUserScopedDb, which rejects them`
          : `${specPath} no longer reaches getUserScopedDb — an API key can reach it now, so document ApiKeyAuth`,
      ).toBe(!acceptsApiKey(operation));
    }
  });
});

describe('published rate-limit table', () => {
  const doc = readFileSync(path.join(repoRoot, 'docs/api/rate-limits.md'), 'utf8');

  /** Documented endpoint label -> the limiter bucket the route actually applies. */
  const documentedKeys: Record<string, keyof typeof rateLimitConfigs> = {
    '`GET /models`': 'default',
    '`GET /credits/balance`': 'credits-balance',
    '`POST /audio/transcriptions`': 'audio-transcription',
    '`POST /chat/completions` (per IP)': 'llm-completion-ip',
    '`POST /chat/completions`': 'llm-completion',
    '`POST /embeddings`': 'chat-conversation',
  };

  const rows = doc
    .split('\n')
    .filter((line) => line.startsWith('| `'))
    .map((line) => line.split('|').map((cell) => cell.trim()));

  it('lists every developer endpoint', () => {
    expect(rows.map((cells) => cells[1])).toEqual(Object.keys(documentedKeys));
  });

  it.each(Object.entries(documentedKeys))('quotes the shipped ceiling for %s', (label, key) => {
    const cells = rows.find((row) => row[1] === label);
    const config = rateLimitConfigs[key];
    expect(cells?.[2]).toBe(`${config.limit} req`);
    expect(cells?.[3]).toBe(config.window.replace(' m', ' min'));
    expect(cells?.[5]).toBe(config.failClosed ? 'fail closed' : 'fail open');
  });
});
