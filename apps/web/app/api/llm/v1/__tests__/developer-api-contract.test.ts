import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { API_KEY_SCOPE_VALUES } from '@/lib/api-key-scopes';
import { rateLimitConfigs } from '@/lib/rate-limit';

const v1Dir = path.resolve(import.meta.dirname, '..');
const apiDir = path.resolve(v1Dir, '../..');
const webRoot = path.resolve(apiDir, '../..');
const repoRoot = path.resolve(webRoot, '../..');

interface SpecResponse {
  description?: string;
  content?: Record<string, { schema?: { $ref?: string } }>;
}

interface SpecOperation extends Record<string, unknown> {
  security?: Array<Record<string, unknown>>;
  responses?: Record<string, SpecResponse>;
}

const spec = JSON.parse(readFileSync(path.join(webRoot, 'public/openapi.json'), 'utf8')) as {
  components: { schemas: Record<string, unknown> };
  paths: Record<string, Record<string, SpecOperation>>;
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    if (!full.endsWith('.ts') || /\.test\.ts$/.test(full)) return [];
    return [full];
  });
}

function routeDirOf(specPath: string): string {
  return path.join(
    apiDir,
    ...specPath
      .slice(1)
      .split('/')
      .map((segment) => segment.replace(/^\{(.+)\}$/, '[$1]')),
  );
}

function specPathOf(routeDir: string): string {
  return `/${path
    .relative(apiDir, routeDir)
    .split(path.sep)
    .map((segment) => segment.replace(/^\[(.+)\]$/, '{$1}'))
    .join('/')}`;
}

function nearestRouteDir(file: string): string | null {
  for (let dir = path.dirname(file); dir.startsWith(apiDir); dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'route.ts'))) return dir;
  }
  return null;
}

function routeSource(specPath: string): string {
  const routeDir = routeDirOf(specPath);
  return sourceFiles(routeDir)
    .filter((file) => nearestRouteDir(file) === routeDir)
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

const scopesByRoute = new Map<string, Set<string>>();
for (const file of sourceFiles(apiDir)) {
  const scopes = [...readFileSync(file, 'utf8').matchAll(/apiKeyScope:\s*'([^']+)'/g)].flatMap(
    (match) => match[1] ?? [],
  );
  if (scopes.length === 0) continue;
  const routeDir = nearestRouteDir(file);
  if (!routeDir) continue;
  const specPath = specPathOf(routeDir);
  const bucket = scopesByRoute.get(specPath) ?? new Set<string>();
  for (const scope of scopes) bucket.add(scope);
  scopesByRoute.set(specPath, bucket);
}

const operations = Object.entries(spec.paths).flatMap(([specPath, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ specPath, method, operation })),
);

function acceptsApiKey(operation: { security?: Array<Record<string, unknown>> }): boolean {
  return (operation.security ?? []).some((requirement) => 'ApiKeyAuth' in requirement);
}

function errorStatuses(operation: SpecOperation): string[] {
  return Object.keys(operation.responses ?? {}).filter((code) => Number(code) >= 400);
}

/** Every 4xx and 5xx a route module returns with a status literal of its own. */
function emittedErrorStatuses(specPath: string): string[] {
  const source = routeSource(specPath);
  return [
    ...new Set([...source.matchAll(/status:\s*([45]\d{2})\b/g)].flatMap((match) => match[1] ?? [])),
  ].sort();
}

const schemaNames = new Set(Object.keys(spec.components.schemas));

describe('published OpenAPI spec', () => {
  it('documents every route in the API tree an API key can authenticate to', () => {
    for (const [specPath, scopes] of scopesByRoute) {
      const methods = spec.paths[specPath];
      expect(
        methods,
        `${specPath} passes apiKeyScope to the auth gate but openapi.json does not document it`,
      ).toBeDefined();
      const advertised = Object.values(methods ?? {}).filter(acceptsApiKey);
      expect(
        advertised.length,
        `${specPath} accepts an API key scoped ${[...scopes].join(', ')} but no documented operation declares ApiKeyAuth`,
      ).toBeGreaterThan(0);
    }
  });

  it('advertises API-key auth only where the route asks the auth gate for a scope', () => {
    for (const { specPath, operation } of operations) {
      if (!acceptsApiKey(operation)) continue;
      expect(
        scopesByRoute.has(specPath),
        `${specPath} is advertised to API keys but no source under it passes apiKeyScope, so the gate refuses every key`,
      ).toBe(true);
    }
  });

  it('points each documented operation at a route that exports its method', () => {
    for (const { specPath, method } of operations) {
      const source = readFileSync(path.join(routeDirOf(specPath), 'route.ts'), 'utf8');
      expect(source, `${method.toUpperCase()} ${specPath}`).toMatch(
        new RegExp(`export (const|async function|function) ${method.toUpperCase()}\\b`),
      );
    }
  });

  it('names a real scope on every API-key operation and enforces it in the route', () => {
    for (const { specPath, operation } of operations) {
      if (!acceptsApiKey(operation)) continue;
      const scope = operation['x-agi-api-key-scope'];
      expect(API_KEY_SCOPE_VALUES, `${specPath} declares an unknown scope`).toContain(scope);
      expect(
        [...(scopesByRoute.get(specPath) ?? [])],
        `${specPath} advertises ${String(scope)} but the route requires a different scope`,
      ).toContain(scope);
      expect(routeSource(specPath), `${specPath} does not require ${String(scope)}`).toContain(
        `apiKeyScope: '${String(scope)}'`,
      );
    }
  });

  it('enumerates at least one operation, so an empty spec cannot pass vacuously', () => {
    expect(operations.length).toBeGreaterThan(10);
  });

  it('gives every documented error response a described JSON body', () => {
    for (const { specPath, method, operation } of operations) {
      const where = `${method.toUpperCase()} ${specPath}`;
      const statuses = errorStatuses(operation);
      expect(statuses.length, `${where} documents no error response at all`).toBeGreaterThan(0);
      for (const status of statuses) {
        const response = operation.responses?.[status];
        expect(response?.description?.trim(), `${where} ${status} has no description`).toBeTruthy();
        const schema = response?.content?.['application/json']?.schema;
        expect(
          schema?.$ref,
          `${where} ${status} documents no application/json schema, so a caller cannot parse the failure`,
        ).toBeTruthy();
        const name = schema?.$ref?.replace('#/components/schemas/', '') ?? '';
        expect(
          schemaNames,
          `${where} ${status} names schema ${name}, which is not defined`,
        ).toContain(name);
      }
    }
  });

  it('documents every error status the route handler itself returns', () => {
    for (const { specPath, method, operation } of operations) {
      const documented = new Set(errorStatuses(operation));
      const undocumented = emittedErrorStatuses(specPath).filter(
        (status) => !documented.has(status),
      );
      expect(
        undocumented,
        `${method.toUpperCase()} ${specPath} returns ${undocumented.join(', ')} but openapi.json does not document it`,
      ).toEqual([]);
    }
  });

  it('answers a rate limit with the rate-limit body wherever the route is limited', () => {
    for (const { specPath, method, operation } of operations) {
      if (!/\b(?:rateLimit|checkRateLimit|rateLimitConfigs)\b/.test(routeSource(specPath)))
        continue;
      const response = operation.responses?.['429'];
      const where = `${method.toUpperCase()} ${specPath}`;
      expect(response, `${where} is rate limited but documents no 429`).toBeDefined();
      expect(
        response?.content?.['application/json']?.schema?.$ref,
        `${where} documents a 429 without the rate-limit body`,
      ).toBe('#/components/schemas/RateLimitError');
    }
  });

  it('keeps a bearer-only inference operation out of reach of an API key', () => {
    for (const { specPath, operation } of operations) {
      if (!specPath.startsWith('/llm/v1/') || acceptsApiKey(operation)) continue;
      expect(
        scopesByRoute.has(specPath),
        `${specPath} is documented as bearer-only but its route passes apiKeyScope, so a key now works there`,
      ).toBe(false);
    }
  });
});

describe('published rate-limit table', () => {
  const doc = readFileSync(path.join(repoRoot, 'docs/standards/api-rate-limits.md'), 'utf8');

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
