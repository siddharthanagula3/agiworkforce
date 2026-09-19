import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextResponse } from 'next/server';

import { withErrorHandler } from '@/lib/error-handler';
import {
  isSensitiveNoStorePath,
  SENSITIVE_NO_STORE_ROUTE_FILES,
  withPrivateNoStore,
} from '@/lib/private-cache-policy';

describe('authenticated API cache policy', () => {
  it('defaults maintained sensitive responses to private no-store', async () => {
    const handler = withErrorHandler(async (_request: Request) =>
      NextResponse.json({ account: 'private' }),
    );
    const response = await handler(new Request('https://agiworkforce.com/api/me'));

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('preserves a route-owned cache policy', async () => {
    const handler = withErrorHandler(async (_request: Request) =>
      NextResponse.json(
        { catalogue: true },
        { headers: { 'Cache-Control': 'public, max-age=60' } },
      ),
    );
    const response = await handler(
      new Request('https://agiworkforce.com/api/catalogue', {
        headers: { cookie: '__session=fixture' },
      }),
    );

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('protects credentialed API responses outside the explicit inventory', async () => {
    const handler = withErrorHandler(async (_request: Request) =>
      NextResponse.json({ private: true }),
    );
    const cookieResponse = await handler(
      new Request('https://agiworkforce.com/api/future-route', {
        headers: { cookie: '__session=fixture' },
      }),
    );
    const bearerResponse = await handler(
      new Request('https://agiworkforce.com/api/future-route', {
        headers: { authorization: 'Bearer fixture' },
      }),
    );

    expect(cookieResponse.headers.get('Cache-Control')).toBe('private, no-store');
    expect(bearerResponse.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('matches dynamic sensitive routes without covering unrelated APIs', () => {
    expect(isSensitiveNoStorePath('/api/projects/project-1')).toBe(true);
    expect(isSensitiveNoStorePath('/api/projects/project-1/knowledge-files')).toBe(true);
    expect(isSensitiveNoStorePath('/api/chat/conversations/conversation-1/messages')).toBe(true);
    expect(isSensitiveNoStorePath('/api/models/catalogue')).toBe(false);
  });

  it('covers the maintained sensitive-route inventory', () => {
    for (const route of SENSITIVE_NO_STORE_ROUTE_FILES) {
      const source = readFileSync(join(process.cwd(), route), 'utf8');
      expect(
        source.includes('withErrorHandler(') ||
          source.includes('withPrivateNoStore(') ||
          /Cache-Control['"]?\s*:\s*['"]private, no-store/.test(source),
        `${route} must use a private cache policy`,
      ).toBe(true);
    }
  });

  it('can protect authenticated handlers that do not use the API gateway wrapper', async () => {
    const handler = withPrivateNoStore(async () => Response.json({ ok: true }));
    expect((await handler()).headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('requires standalone authenticated GET routes to declare their cache boundary', () => {
    const apiRoot = join(process.cwd(), 'app/api');
    const routeFiles: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (entry.name === 'route.ts') routeFiles.push(path);
      }
    };
    visit(apiRoot);

    const failures = routeFiles
      .filter((path) => !path.includes('/app/api/cron/'))
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        const exposesGet = /export\s+(?:async\s+function|const)\s+GET\b/.test(source);
        const readsIdentity =
          /getClerkAuthUser|getUserScopedDb|requireAdmin|requireAuth|getAuth|authenticate|withAuth/.test(
            source,
          );
        const protectedResponse =
          /withErrorHandler\(|withPrivateNoStore\(|cache-control['"]?\s*:\s*['"][^'"]*(?:private|no-store)/i.test(
            source,
          );
        return exposesGet && readsIdentity && !protectedResponse;
      })
      .map((path) => path.slice(process.cwd().length + 1));

    expect(failures).toEqual([]);
    const nextConfig = readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8');
    expect(nextConfig).toMatch(
      /source:\s*['"]\/api\/cron\/:path\*['"][\s\S]*?Cache-Control[\s\S]*?private, no-store/,
    );
  });
});
