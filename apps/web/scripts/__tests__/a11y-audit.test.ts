// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const scriptsDir = dirname(dirname(fileURLToPath(import.meta.url)));
const webDir = dirname(scriptsDir);

const CLEAN_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Audit fixture</title></head><body><main><h1>Audit fixture</h1></main></body></html>`;

type PageDefinition = { path: string; name: string };
type AuditModule = {
  auditedPages: PageDefinition[];
  auditPage: (
    browser: Browser,
    page: PageDefinition,
    colorScheme: string,
  ) => Promise<{ summary: { totalViolations: number } }>;
  findUnexpectedRedirect: (requestedUrl: string, landedUrl: string) => string | null;
};

let server: Server;
let browser: Browser;
let audit: AuditModule;

function protectedRoutePrefixes(): string[] {
  const proxySource = readFileSync(join(webDir, 'proxy.ts'), 'utf8');
  const matcher =
    /const isProtectedAppRoute = (?:identityMiddleware\.)?createRouteMatcher\(\[([\s\S]*?)\]\)/.exec(
      proxySource,
    );
  if (!matcher) throw new Error('isProtectedAppRoute route list not found in proxy.ts');
  return [...matcher[1]!.matchAll(/'([^']+)'/g)].map((entry) => entry[1]!.replace(/\(\.\*\)$/, ''));
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (requestPath === '/chat') {
      response.writeHead(307, { location: '/login' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(CLEAN_PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  // the runner freezes its base URL at import time, so the fixture port must be set first
  process.env['A11Y_BASE_URL'] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  audit = (await import('../a11y-audit.mjs')) as unknown as AuditModule;
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('a11y audit route list', () => {
  it('never lists a route the signed-out proxy redirects to /login', () => {
    const prefixes = protectedRoutePrefixes();
    expect(prefixes.length).toBeGreaterThan(0);

    const gated = audit.auditedPages.filter((page) =>
      prefixes.some((prefix) => page.path === prefix || page.path.startsWith(`${prefix}/`)),
    );

    expect(gated.map((page) => `${page.name} (${page.path})`)).toEqual([]);
  });
});

describe('a11y audit navigation', () => {
  it('fails a route that lands on a different path instead of auditing the redirect target', async () => {
    await expect(
      audit.auditPage(browser, { path: '/chat', name: 'Chat' }, 'light'),
    ).rejects.toThrow(/redirected to \/login; \/chat was never audited/);
  }, 60_000);

  it('audits a route that serves its own path', async () => {
    const result = await audit.auditPage(browser, { path: '/login', name: 'Sign in' }, 'light');
    expect(result.summary.totalViolations).toBe(0);
  }, 60_000);
});

describe('findUnexpectedRedirect', () => {
  it('ignores trailing-slash-only differences', () => {
    expect(audit.findUnexpectedRedirect('http://x/pricing', 'http://x/pricing/')).toBeNull();
  });

  it('reports the landed path when the route changed', () => {
    expect(audit.findUnexpectedRedirect('http://x/chat', 'http://x/login?redirectTo=%2Fchat')).toBe(
      '/login',
    );
  });
});
