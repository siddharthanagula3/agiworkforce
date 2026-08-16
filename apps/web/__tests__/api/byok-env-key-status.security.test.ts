
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/error-handler', () => ({
  withErrorHandler: (handler: (req: NextRequest) => Promise<Response>) => (req: NextRequest) =>
    handler(req),
}));

vi.mock('@/lib/api-auth', () => ({
  getClerkAuthUser: vi.fn().mockResolvedValue({ userId: 'user_test' }),
}));

import { GET } from '@/app/api/byok/env-key-status/route';

function makeGetRequest(searchParams?: string): NextRequest {
  const url = searchParams
    ? `http://localhost/api/byok/env-key-status?${searchParams}`
    : 'http://localhost/api/byok/env-key-status';
  return new NextRequest(url, { method: 'GET' });
}

const TEST_KEY_VALUE = 'sk-test-anthropic-key-1234567890abcdef';

describe('GET /api/byok/env-key-status — key leak prevention', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    for (const { envVar } of BYOK_PROVIDERS) {
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe('response body shape', () => {
    it('returns providers array with id and isSet only', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest());
      const data = (await response.json()) as { providers: unknown[] };

      expect(response.status).toBe(200);
      expect(Array.isArray(data.providers)).toBe(true);

      for (const provider of data.providers) {
        const p = provider as Record<string, unknown>;
        expect(typeof p['id']).toBe('string');
        expect(typeof p['isSet']).toBe('boolean');
        expect(p).not.toHaveProperty('envVar');
        expect(p).not.toHaveProperty('env');
        expect(p).not.toHaveProperty('environmentVariable');
        expect(p).not.toHaveProperty('value');
        expect(p).not.toHaveProperty('key');
        expect(p).not.toHaveProperty('secret');
        expect(p).not.toHaveProperty('apiKey');
        expect(p).not.toHaveProperty('token');
        expect(p).not.toHaveProperty('keyValue');
        expect(p).not.toHaveProperty('rawValue');
        expect(p).not.toHaveProperty('hash');
        expect(p).not.toHaveProperty('length');
        expect(p).not.toHaveProperty('prefix');
        expect(p).not.toHaveProperty('masked');
      }
    });

    it('no string value in any provider field exceeds 8 chars except id and envVar', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest());
      const data = (await response.json()) as { providers: Record<string, unknown>[] };

      for (const provider of data.providers) {
        for (const [field, value] of Object.entries(provider)) {
          if (field === 'id') continue;
          if (typeof value === 'string') {
            expect(value.length).toBeLessThanOrEqual(8);
          }
        }
      }
    });

    it('isSet is true when key is configured, false when absent', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest());
      const data = (await response.json()) as { providers: { id: string; isSet: boolean }[] };

      const anthropic = data.providers.find((p) => p.id === 'anthropic');
      const openai = data.providers.find((p) => p.id === 'openai');

      expect(anthropic?.isSet).toBe(true);
      expect(openai?.isSet).toBe(false);
    });

    it('whitespace-only key is treated as absent (isSet: false)', async () => {
      process.env['ANTHROPIC_API_KEY'] = '   ';

      const response = await GET(makeGetRequest());
      const data = (await response.json()) as { providers: { id: string; isSet: boolean }[] };

      const anthropic = data.providers.find((p) => p.id === 'anthropic');
      expect(anthropic?.isSet).toBe(false);
    });

    it('key longer than 256 chars is detected as set without leaking the value', async () => {
      const longKey = 'sk-' + 'a'.repeat(256);
      process.env['ANTHROPIC_API_KEY'] = longKey;

      const response = await GET(makeGetRequest());
      const body = await response.text();
      const data = JSON.parse(body) as { providers: { id: string; isSet: boolean }[] };

      const anthropic = data.providers.find((p) => p.id === 'anthropic');
      expect(anthropic?.isSet).toBe(true);
      expect(body).not.toContain(longKey);
      expect(body).not.toContain('aaaaaaaaaaaa');
    });

    it('Unicode in key value — isSet true, no value leaked', async () => {
      const unicodeKey = '日本語キー-abc123';
      process.env['ANTHROPIC_API_KEY'] = unicodeKey;

      const response = await GET(makeGetRequest());
      const body = await response.text();
      const data = JSON.parse(body) as { providers: { id: string; isSet: boolean }[] };

      const anthropic = data.providers.find((p) => p.id === 'anthropic');
      expect(anthropic?.isSet).toBe(true);
      expect(body).not.toContain('日本語');
      expect(body).not.toContain(unicodeKey);
    });

    it('all keys absent — all providers have isSet: false, no error', async () => {
      const response = await GET(makeGetRequest());
      const data = (await response.json()) as { providers: { id: string; isSet: boolean }[] };

      expect(response.status).toBe(200);
      for (const provider of data.providers) {
        expect(provider.isSet).toBe(false);
      }
    });

    it('response is not a stack trace or env var dump when keys are absent', async () => {
      const response = await GET(makeGetRequest());
      const body = await response.text();

      expect(body).not.toContain('process.env');
      for (const { envVar } of BYOK_PROVIDERS) {
        expect(body).not.toContain(envVar);
      }
      expect(body).not.toContain('Error:');
      expect(body).not.toContain('stack');
      expect(body).not.toContain('at ');
    });
  });

  describe('response headers — no key-leaking headers', () => {
    it('no header contains the key value', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest());

      const allHeaders: string[] = [];
      response.headers.forEach((value) => allHeaders.push(value));

      for (const headerValue of allHeaders) {
        expect(headerValue).not.toContain(TEST_KEY_VALUE);
        expect(headerValue).not.toContain('sk-test');
      }
    });

    it('no X-Key-Value or X-Api-Key-* custom headers present', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest());

      const forbiddenHeaderPrefixes = [
        'x-key-value',
        'x-api-key-value',
        'x-secret',
        'x-provider-key',
      ];
      for (const prefix of forbiddenHeaderPrefixes) {
        const header = response.headers.get(prefix);
        expect(header).toBeNull();
      }
    });
  });

  describe('query param injection must not reveal key', () => {
    it('?reveal=true does NOT add any value field to response', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest('reveal=true'));
      const body = await response.text();
      const data = JSON.parse(body) as { providers: Record<string, unknown>[] };

      expect(body).not.toContain(TEST_KEY_VALUE);
      for (const provider of data.providers) {
        expect(provider).not.toHaveProperty('value');
      }
    });

    it('?debug=1 does NOT change response shape', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const [normalResponse, debugResponse] = await Promise.all([
        GET(makeGetRequest()),
        GET(makeGetRequest('debug=1')),
      ]);

      const normalData = await normalResponse.json();
      const debugData = await debugResponse.json();

      expect(Object.keys(debugData)).toEqual(Object.keys(normalData));

      const debugBody = JSON.stringify(debugData);
      expect(debugBody).not.toContain(TEST_KEY_VALUE);
    });

    it('?provider=anthropic does NOT narrow to expose value', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest('provider=anthropic'));
      const body = await response.text();

      expect(body).not.toContain(TEST_KEY_VALUE);
      expect(body).not.toContain('sk-test');
    });

    it('?format=raw does NOT change response shape', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest('format=raw'));
      const body = await response.text();

      expect(body).not.toContain(TEST_KEY_VALUE);
    });
  });

  // ─── (d) Method coverage — only GET exported ──────────────────────────────
  describe('only GET is exported (no other verb handler)', () => {
    it('GET is exported from the route module', async () => {
      const routeModule = await import('@/app/api/byok/env-key-status/route');
      expect(typeof routeModule.GET).toBe('function');
    });

    it('POST, PUT, DELETE, PATCH are NOT exported from the route module', async () => {
      const routeModule = (await import('@/app/api/byok/env-key-status/route')) as Record<
        string,
        unknown
      >;
      expect(routeModule['POST']).toBeUndefined();
      expect(routeModule['PUT']).toBeUndefined();
      expect(routeModule['DELETE']).toBeUndefined();
      expect(routeModule['PATCH']).toBeUndefined();
    });
  });

  describe('error path — missing keys', () => {
    it('returns 200 with isSet: false when key missing, not an error response', async () => {
      const response = await GET(makeGetRequest());
      expect(response.status).toBe(200);

      const data = (await response.json()) as { providers: { isSet: boolean }[] };
      for (const p of data.providers) {
        expect(p.isSet).toBe(false);
      }
    });

    it('response body shape contains no unexpected fields beyond id and isSet', async () => {
      const response = await GET(makeGetRequest());
      const data = (await response.json()) as { providers: Record<string, unknown>[] };

      const ALLOWED_KEYS = new Set(['id', 'isSet']);
      for (const provider of data.providers) {
        const actualKeys = Object.keys(provider);
        for (const key of actualKeys) {
          expect(ALLOWED_KEYS.has(key)).toBe(true);
        }
      }
    });

    it('rate-limit bypassed during test does not expose keys', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const response = await GET(makeGetRequest());
      const body = await response.text();

      expect(body).not.toContain(TEST_KEY_VALUE);
    });
  });

  describe('rate limit enforcement', () => {
    it('returns 429 when rate limiter signals exceeded', async () => {
      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');
      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json({ error: { code: 'RATE_LIMIT_EXCEEDED' } }, { status: 429 }),
      );

      const response = await GET(makeGetRequest());
      expect(response.status).toBe(429);
    });

    it('429 response does not contain any key value', async () => {
      process.env['ANTHROPIC_API_KEY'] = TEST_KEY_VALUE;

      const { withRateLimit } = await import('@/lib/rate-limit');
      const { NextResponse } = await import('next/server');
      vi.mocked(withRateLimit).mockResolvedValueOnce(
        NextResponse.json({ error: { code: 'RATE_LIMIT_EXCEEDED' } }, { status: 429 }),
      );

      const response = await GET(makeGetRequest());
      const body = await response.text();
      expect(body).not.toContain(TEST_KEY_VALUE);
    });
  });

  describe('authentication', () => {
    it('requires an authenticated user before returning provider status', async () => {
      const { getClerkAuthUser } = await import('@/lib/api-auth');
      vi.mocked(getClerkAuthUser).mockRejectedValueOnce(new Error('Unauthorized'));

      await expect(GET(makeGetRequest())).rejects.toThrow('Unauthorized');
    });
  });
});
