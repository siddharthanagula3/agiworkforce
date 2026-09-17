import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
const sentryConfigured = vi.fn(() => true);

vi.mock('@sentry/nextjs', () => ({
  captureException: (...args: unknown[]) => captureException(...args) as unknown,
}));

vi.mock('@/lib/sentry-shared', () => ({
  isSentryConfigured: () => sentryConfigured(),
}));

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { captureWorkerFailure, isReportableServerError } from '@/lib/observability/error-capture';

function request(): Request {
  return new Request('https://app.example.com/api/things/42?token=secret-value', {
    method: 'POST',
  });
}

async function settleCapture(): Promise<void> {
  await vi.waitFor(() => {
    expect(captureException).toHaveBeenCalled();
  });
}

beforeEach(() => {
  captureException.mockReset();
  sentryConfigured.mockReset();
  sentryConfigured.mockReturnValue(true);
});

describe('withErrorHandler error monitoring', () => {
  it('reports an unexpected server error with the request id and a query-free route', async () => {
    const failure = new Error('database connection dropped');
    const handler = withErrorHandler(async (_request: Request) => {
      throw failure;
    });

    const response = await handler(request());
    await settleCapture();

    expect(response.status).toBe(500);
    const [error, hint] = captureException.mock.calls[0] as [
      unknown,
      { tags: Record<string, string> },
    ];
    expect(error).toBe(failure);
    expect(hint.tags['request_id']).toBe(response.headers.get('x-request-id'));
    expect(hint.tags['http.route']).toBe('/api/things/42');
    expect(hint.tags['http.method']).toBe('POST');
  });

  it('reports an AppError that is a server fault', async () => {
    const handler = withErrorHandler(async (_request: Request) => {
      throw createError.internal('ledger write failed');
    });

    await handler(request());
    await settleCapture();
  });

  it('never reports a user error', async () => {
    const handler = withErrorHandler(async (_request: Request) => {
      throw createError.notFound('No such thing');
    });
    const validation = withErrorHandler(async (_request: Request) => {
      throw { issues: [{ path: ['name'], message: 'Required' }] };
    });

    expect((await handler(request())).status).toBe(404);
    expect((await validation(request())).status).toBe(400);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('sends nothing when no DSN is configured', async () => {
    sentryConfigured.mockReturnValue(false);
    const handler = withErrorHandler(async (_request: Request) => {
      throw new Error('unexpected');
    });

    expect((await handler(request())).status).toBe(500);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captureException).not.toHaveBeenCalled();
  });

  it('does not report a handled response', async () => {
    const handler = withErrorHandler(async (_request: Request) =>
      NextResponse.json({ ok: true }, { status: 200 }),
    );
    await handler(request());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe('isReportableServerError', () => {
  it('treats a declared client status as a user error and anything undeclared as a fault', () => {
    expect(isReportableServerError(Object.assign(new Error('x'), { status: 403 }))).toBe(false);
    expect(isReportableServerError(Object.assign(new Error('x'), { statusCode: 502 }))).toBe(true);
    expect(isReportableServerError(new TypeError('undefined is not a function'))).toBe(true);
  });
});

describe('captureWorkerFailure', () => {
  it('reports a failed background job tagged with its worker and job id', async () => {
    const failure = new Error('step exhausted its retries');

    captureWorkerFailure(failure, { worker: 'cloud-agent-turn', jobId: 'run-42' });
    await settleCapture();

    const [error, hint] = captureException.mock.calls[0] as [
      unknown,
      { tags: Record<string, string> },
    ];
    expect(error).toBe(failure);
    expect(hint.tags).toEqual({
      'agi.failure.kind': 'worker',
      'worker.name': 'cloud-agent-turn',
      'worker.job_id': 'run-42',
    });
  });

  it('sends nothing without a DSN', async () => {
    sentryConfigured.mockReturnValue(false);
    captureWorkerFailure(new Error('x'), { worker: 'scheduled-task', jobId: 'run-1' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captureException).not.toHaveBeenCalled();
  });
});
