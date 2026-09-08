import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class CloudAgentRunNotFoundError extends Error {}
  class CloudAgentRunNotArchivableError extends Error {
    constructor(readonly state: string) {
      super(`A ${state} task cannot be archived`);
    }
  }
  class CloudAgentRunRestoreStateUnknownError extends Error {}
  return {
    getUserScopedDb: vi.fn(),
    requireCsrfToken: vi.fn(async (_request: unknown, _userId?: string) => null),
    archive: vi.fn(),
    unarchive: vi.fn(),
    CloudAgentRunNotFoundError,
    CloudAgentRunNotArchivableError,
    CloudAgentRunRestoreStateUnknownError,
  };
});

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: (request: unknown, userId?: string) => mocks.requireCsrfToken(request, userId),
}));
vi.mock('@/lib/cors', () => ({
  getCorsHeaders: vi.fn(() => ({})),
  getSecurityHeaders: vi.fn(() => ({})),
  handleCorsPreflightRequest: vi.fn(() => null),
  withCorsRoute: vi.fn((handler) => handler),
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/cloud-agent-run-service', () => ({
  archiveCloudAgentRun: mocks.archive,
  unarchiveCloudAgentRun: mocks.unarchive,
  CloudAgentRunNotFoundError: mocks.CloudAgentRunNotFoundError,
  CloudAgentRunNotArchivableError: mocks.CloudAgentRunNotArchivableError,
  CloudAgentRunRestoreStateUnknownError: mocks.CloudAgentRunRestoreStateUnknownError,
}));

import { DELETE, POST } from './route';

const RUN_ID = '0190a000-0000-7000-8000-000000000001';
const db = { query: vi.fn() };

function request(method: string, runId = RUN_ID): NextRequest {
  return new NextRequest(`http://localhost/api/llm/v1/chat/completions/runs/${runId}/archive`, {
    method,
  });
}

function context(runId = RUN_ID) {
  return { params: Promise.resolve({ runId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-owner' });
  mocks.requireCsrfToken.mockResolvedValue(null);
});

describe('POST archives a finished task', () => {
  it('archives through the scoped client and returns the run', async () => {
    mocks.archive.mockResolvedValue({ id: RUN_ID, state: 'archived' });

    const response = await POST(request('POST'), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ run: { id: RUN_ID, state: 'archived' } });
    expect(mocks.getUserScopedDb).toHaveBeenCalled();
    expect(mocks.archive).toHaveBeenCalledWith(db, { userId: 'user-owner', runId: RUN_ID });
  });

  it('refuses a task that has not finished, with a reason', async () => {
    mocks.archive.mockRejectedValue(new mocks.CloudAgentRunNotArchivableError('running'));

    const response = await POST(request('POST'), context());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.message).toContain('finished');
  });

  it('is a 404 for a run the caller does not own', async () => {
    mocks.archive.mockRejectedValue(new mocks.CloudAgentRunNotFoundError());

    const response = await POST(request('POST'), context());

    expect(response.status).toBe(404);
  });

  it('never reaches the service without a csrf token', async () => {
    mocks.requireCsrfToken.mockResolvedValue(
      new Response(null, { status: 403 }) as unknown as null,
    );

    const response = await POST(request('POST'), context());

    expect(response.status).toBe(403);
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it('refuses a run id that is not a uuid before touching the service', async () => {
    const response = await POST(request('POST', 'not-a-uuid'), context('not-a-uuid'));

    expect(response.status).toBe(404);
    expect(mocks.archive).not.toHaveBeenCalled();
  });
});

describe('DELETE restores an archived task', () => {
  it('restores through the scoped client and returns the run', async () => {
    mocks.unarchive.mockResolvedValue({ id: RUN_ID, state: 'completed' });

    const response = await DELETE(request('DELETE'), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ run: { id: RUN_ID, state: 'completed' } });
    expect(mocks.unarchive).toHaveBeenCalledWith(db, { userId: 'user-owner', runId: RUN_ID });
  });

  it('leaves a run archived rather than inventing a state it never had', async () => {
    mocks.unarchive.mockRejectedValue(new mocks.CloudAgentRunRestoreStateUnknownError());

    const response = await DELETE(request('DELETE'), context());

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.message).toContain('stays archived');
  });
});
