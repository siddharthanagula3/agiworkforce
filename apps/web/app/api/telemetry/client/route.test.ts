import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getClerkAuthUser: vi.fn(),
  readServerTelemetryConsent: vi.fn(),
  recordClientFailure: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/api-auth', () => ({ getClerkAuthUser: mocks.getClerkAuthUser }));
vi.mock('@/lib/server/telemetry-consent', () => ({
  readServerTelemetryConsent: mocks.readServerTelemetryConsent,
}));
vi.mock('@/lib/observability/metrics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/observability/metrics')>()),
  recordClientFailure: mocks.recordClientFailure,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import {
  CLIENT_FAILURE_CLASSES,
  CLIENT_FAILURE_MAX_BATCH,
  CLIENT_FAILURE_MAX_BODY_BYTES,
} from '@/lib/observability/client-failures';
import { UNKNOWN_CLIENT_VERSION_LABEL } from '@/lib/observability/client-versions';
import { SURFACE_REQUEST_HEADER } from '@/lib/observability/request-labels';

import { POST } from './route';

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/telemetry/client', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getClerkAuthUser.mockResolvedValue({ userId: 'usr_1' });
  mocks.readServerTelemetryConsent.mockResolvedValue(true);
});

describe('POST /api/telemetry/client', () => {
  it('refuses a signed-out caller', async () => {
    mocks.getClerkAuthUser.mockRejectedValue(createError.unauthorized('Sign in'));

    const response = await POST(request({ events: [{ failure: 'mermaid_render' }] }));

    expect(response.status).toBe(401);
    expect(mocks.recordClientFailure).not.toHaveBeenCalled();
  });

  it('records nothing when the account has not consented to telemetry', async () => {
    mocks.readServerTelemetryConsent.mockResolvedValue(false);

    const response = await POST(request({ events: [{ failure: 'stream_stall' }] }));

    await expect(response.json()).resolves.toEqual({ accepted: 0, consent: 'withheld' });
    expect(mocks.recordClientFailure).not.toHaveBeenCalled();
  });

  it('stops before the handler when CSRF or the rate limit refuses', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await POST(request({ events: [{ failure: 'code_copy' }] }))).status).toBe(403);

    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(
      new Response(null, { status: 429 }) as unknown as ReturnType<typeof Response.json>,
    );
    expect((await POST(request({ events: [{ failure: 'code_copy' }] }))).status).toBe(429);

    expect(mocks.getClerkAuthUser).not.toHaveBeenCalled();
    expect(mocks.recordClientFailure).not.toHaveBeenCalled();
  });

  it('counts every class the vocabulary names, stamped with the declared surface', async () => {
    const response = await POST(
      request(
        { events: CLIENT_FAILURE_CLASSES.map((failure) => ({ failure })) },
        { [SURFACE_REQUEST_HEADER]: 'web' },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: CLIENT_FAILURE_CLASSES.length,
      consent: 'granted',
    });
    expect(mocks.recordClientFailure).toHaveBeenCalledTimes(CLIENT_FAILURE_CLASSES.length);
    for (const call of mocks.recordClientFailure.mock.calls) {
      expect(call[0].surface).toBe('web');
    }
  });

  it('drops a surface the platform does not know rather than opening a series for it', async () => {
    await POST(
      request(
        { events: [{ failure: 'attachment', detail: 'too_large' }] },
        {
          [SURFACE_REQUEST_HEADER]: 'smart-fridge',
        },
      ),
    );

    expect(mocks.recordClientFailure).toHaveBeenCalledWith({
      failure: 'attachment',
      detail: 'too_large',
      surface: undefined,
      clientVersion: UNKNOWN_CLIENT_VERSION_LABEL,
    });
  });

  it('refuses a class or a reason outside the closed vocabulary', async () => {
    for (const body of [
      { events: [{ failure: 'whatever_broke' }] },
      { events: [{ failure: 'code_copy', detail: 'a very specific reason' }] },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(mocks.recordClientFailure).not.toHaveBeenCalled();
  });

  // The one property that makes this route safe to call from a browser: there
  // is no field a prompt, a message or a stack trace can travel in.
  it('refuses a report carrying any field beyond the class and the reason', async () => {
    const response = await POST(
      request({
        events: [
          {
            failure: 'markdown_render',
            detail: 'parse',
            message: 'TypeError: cannot read property of undefined',
            stack: 'at renderMarkdown (chunk.js:1:1)',
          },
        ],
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.recordClientFailure).not.toHaveBeenCalled();
  });

  it('refuses a batch larger than the cap and a body larger than the cap', async () => {
    const oversizedBatch = {
      events: Array.from({ length: CLIENT_FAILURE_MAX_BATCH + 1 }, () => ({
        failure: 'code_copy' as const,
      })),
    };
    expect((await POST(request(oversizedBatch))).status).toBe(400);

    const padded = `{"events":[{"failure":"code_copy"}],"_":"${'x'.repeat(
      CLIENT_FAILURE_MAX_BODY_BYTES,
    )}"}`;
    expect((await POST(request(padded))).status).toBe(400);
    expect(mocks.recordClientFailure).not.toHaveBeenCalled();
  });
});
