import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => ({
  getClerkAuthUser: vi.fn(),
  requireCsrfToken: vi.fn(async () => null as unknown),
  withRateLimit: vi.fn(async () => null as unknown),
  releaseSha: vi.fn(() => 'server-sha'),
  deployEnvironment: vi.fn(() => 'production'),
}));

vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.getClerkAuthUser }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/hosting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/hosting')>()),
  releaseSha: mocks.releaseSha,
  deployEnvironment: mocks.deployEnvironment,
}));

import { createError } from '@/lib/errors';
import { supportDiagnosticsSchema } from '@/lib/support/diagnostics/schema';
import { POST as exportDiagnostics } from '../route';

function post(body: unknown): Request {
  return new Request('https://agiworkforce.com/api/support/diagnostics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function bundle(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    collectedAt: '2026-09-18T10:00:00.000Z',
    surface: 'desktop',
    appVersion: '1.2.0',
    releaseSha: 'client-claimed',
    deployEnv: 'client-claimed',
    platform: 'Mac OS X 15.6',
    locale: 'en-GB',
    timeZone: 'Europe/London',
    viewport: { width: 1440, height: 900 },
    online: true,
    pagePath: '/chat',
    conversationId: null,
    recentEvents: [],
    ...overrides,
  };
}

describe('POST /api/support/diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClerkAuthUser.mockResolvedValue({ userId: 'user_1', email: 'a@b.com' });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.releaseSha.mockReturnValue('server-sha');
    mocks.deployEnvironment.mockReturnValue('production');
  });

  it('returns a schema-valid bundle for every surface', async () => {
    for (const surface of ['web', 'desktop', 'mobile', 'extension-chrome', 'extension-vscode']) {
      const response = await exportDiagnostics(post({ diagnostics: bundle({ surface }) }) as never);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { diagnostics: unknown; summary: string };
      expect(supportDiagnosticsSchema.safeParse(body.diagnostics).success).toBe(true);
      expect(body.summary).toContain(`surface: ${surface}`);
    }
  });

  it('redacts secrets a surface left in a recent event', async () => {
    const response = await exportDiagnostics(
      post({
        diagnostics: bundle({
          recentEvents: [
            {
              at: '2026-09-18T09:59:00.000Z',
              kind: 'request_failed',
              message:
                'POST /api/chat failed for owner@example.com with Bearer sk_live_abcdef123456',
            },
          ],
        }),
      }) as never,
    );

    const body = (await response.json()) as {
      diagnostics: { recentEvents: { message: string }[] };
    };
    const message = body.diagnostics.recentEvents[0]?.message ?? '';
    expect(message).not.toContain('owner@example.com');
    expect(message).not.toContain('sk_live_abcdef123456');
    expect(message).toMatch(/\[redacted/u);
  });

  it('overrides the build facts a client cannot know and strips the query string', async () => {
    const response = await exportDiagnostics(
      post({ diagnostics: bundle({ pagePath: '/share/abc?token=secret-share-token' }) }) as never,
    );

    const body = (await response.json()) as {
      diagnostics: { releaseSha: string; deployEnv: string; pagePath: string };
      filename: string;
    };
    expect(body.diagnostics.releaseSha).toBe('server-sha');
    expect(body.diagnostics.deployEnv).toBe('production');
    expect(body.diagnostics.pagePath).toBe('/share/abc');
    expect(body.filename).toMatch(/^agi-diagnostics-desktop-.*\.json$/u);
  });

  it('refuses a bundle that does not validate rather than exporting it', async () => {
    const response = await exportDiagnostics(
      post({ diagnostics: { surface: 'toaster' } }) as never,
    );
    expect(response.status).toBe(400);
  });

  it('refuses an unauthenticated caller', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized('Authentication required'));
    const response = await exportDiagnostics(post({ diagnostics: bundle() }) as never);
    expect(response.status).toBe(401);
  });
});
