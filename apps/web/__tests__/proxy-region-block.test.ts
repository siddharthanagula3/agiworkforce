import { readdirSync } from 'node:fs';
import { basename, dirname, join, posix, sep } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@clerk/nextjs/server', () => ({
  createRouteMatcher:
    (patterns: string[]) =>
    (request: NextRequest): boolean => {
      const pathname = request.nextUrl.pathname;
      return patterns.some((pattern) => {
        const prefix = pattern.replace(/\(\.\*\)$/u, '');
        if (prefix.endsWith('/')) return pathname.startsWith(prefix);
        return pathname === prefix || pathname.startsWith(`${prefix}/`);
      });
    },
  clerkMiddleware:
    (handler: (auth: unknown, request: NextRequest, event: unknown) => Response) =>
    (request: NextRequest, event: unknown) =>
      handler({}, request, event),
}));

const EVENT = {} as never;
const TRIGGER_ID = '3f2c9a1e-5b7d-4c8e-9a0b-1d2e3f4a5b6c';

function fromTheEea(path: string, method = 'GET'): NextRequest {
  return new NextRequest(
    new Request(`https://agiworkforce.com${path}`, {
      method,
      headers: { 'x-vercel-ip-country': 'DE' },
    }),
  );
}

function routesUnder(directory: string): string[] {
  return readdirSync(join(process.cwd(), 'app', directory), { recursive: true, encoding: 'utf8' })
    .filter((entry) => basename(entry) === 'route.ts')
    .map((entry) =>
      posix
        .join('/', directory, dirname(entry).split(sep).join('/'))
        .replace(/\[[^\]]+\]/gu, TRIGGER_ID),
    )
    .sort();
}

describe('the EEA block refuses people, not the servers that call back', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('AGI_BLOCK_EEA_TRAFFIC', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('lets every signed webhook and cron job on disk reach its handler from an EEA address', async () => {
    const machineRoutes = [
      ...routesUnder('api/webhooks'),
      ...routesUnder('api/github/webhook'),
      ...routesUnder('api/cron'),
    ];
    expect(machineRoutes).toEqual(
      expect.arrayContaining([
        '/api/webhooks/slack',
        '/api/webhooks/gmail',
        '/api/webhooks/google-calendar',
        `/api/webhooks/connectors/${TRIGGER_ID}`,
        '/api/github/webhook',
        '/api/cron/run-schedules',
      ]),
    );
    const { proxy } = await import('../proxy');

    for (const path of machineRoutes) {
      const response = await proxy(
        fromTheEea(path, path.startsWith('/api/cron/') ? 'GET' : 'POST'),
        EVENT,
      );

      expect(response?.status, path).toBe(200);
      expect(response?.headers.get('x-middleware-next'), path).toBe('1');
      expect(response?.headers.get('x-agi-region-block'), path).toBeNull();
      expect(response?.headers.get('Content-Security-Policy'), path).toContain(
        "default-src 'self'",
      );
      expect(response?.headers.get('Access-Control-Allow-Methods'), path).toContain('POST');
    }
  });

  it('keeps refusing what a person opens in a browser', async () => {
    const { proxy } = await import('../proxy');

    for (const path of [
      '/',
      '/chat',
      '/login',
      '/api/chat/conversations',
      '/api/waitlist',
      '/api/developers/webhooks',
      '/api/github/install/start',
    ]) {
      const response = await proxy(fromTheEea(path), EVENT);

      expect(response?.status, path).toBe(451);
      expect(response?.headers.get('x-agi-region-block'), path).toBe('DE');
    }
  });

  it('does not let a look-alike path borrow the exemption', async () => {
    const { proxy } = await import('../proxy');

    for (const path of [
      '/api/webhooksx',
      '/api/webhooks',
      '/api/webhooks/',
      '/api/webhooks/slack/extra',
      `/api/webhooks/connectors/${TRIGGER_ID}/extra`,
      '/api/github/webhook/extra',
      '/api/github/webhooks',
      '/api/cron',
      '/api/cron/',
      '/api/cron/run-schedules/extra',
      '/api/webhooks%2Fslack',
      '/api/github%2Fwebhook',
      '/api/cron%2Frun-schedules',
      '/api/cron/run-schedules%2F..%2F..%2Fchat',
      '//api/webhooks/slack',
      '/api/webhooks//slack',
      '/api//github/webhook',
      '/api/cron//run-schedules',
    ]) {
      const response = await proxy(fromTheEea(path, 'POST'), EVENT);

      expect(response?.status, path).toBe(451);
      expect(response?.headers.get('x-agi-region-block'), path).toBe('DE');
    }
  });

  it('still serves the page that explains the block', async () => {
    const { proxy } = await import('../proxy');

    const response = await proxy(fromTheEea('/region-unavailable'), EVENT);

    expect(response?.status).not.toBe(451);
    expect(response?.headers.get('x-agi-region-block')).toBeNull();
  });
});
