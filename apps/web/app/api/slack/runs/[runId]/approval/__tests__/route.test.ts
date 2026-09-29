import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  class SlackRunApprovalError extends Error {
    constructor(
      message: string,
      readonly reason: string,
    ) {
      super(message);
    }
  }
  class SlackApprovalUnavailableError extends Error {}
  return {
    SlackRunApprovalError,
    SlackApprovalUnavailableError,
    getUserScopedDb: vi.fn(),
    requireCsrfToken: vi.fn(),
    withRateLimit: vi.fn(),
    recordAuditEvent: vi.fn(),
    claimSlackApproval: vi.fn(),
    after: vi.fn(),
    serviceDb: { query: vi.fn() },
    db: { query: vi.fn() },
  };
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: mocks.after,
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn(() => mocks.serviceDb) }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock('@/lib/slack/slack-assistant', () => ({
  SlackApprovalUnavailableError: mocks.SlackApprovalUnavailableError,
  claimSlackApproval: mocks.claimSlackApproval,
}));
vi.mock('@/lib/slack/slack-runs', () => ({ SlackRunApprovalError: mocks.SlackRunApprovalError }));

import { createError } from '@/lib/errors';

import { POST } from '../route';

const ORG = '11111111-1111-4111-8111-111111111111';
const RUN = '55555555-5555-4555-8555-555555555555';
const approval = { decision: 'approved', toolCallIds: ['call-1', 'call-2'] };

function request(body: unknown = approval): NextRequest {
  return new NextRequest(`http://localhost/api/slack/runs/${RUN}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function context(runId = RUN) {
  return { params: Promise.resolve({ runId }) };
}

describe('POST /api/slack/runs/[runId]/approval', () => {
  const resume = vi.fn(async () => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({
      db: mocks.db,
      userId: 'user-1',
      organizationId: ORG,
    });
    mocks.requireCsrfToken.mockResolvedValue(null);
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.claimSlackApproval.mockResolvedValue(resume);
  });

  it('returns 401 without a session', async () => {
    mocks.getUserScopedDb.mockRejectedValue(createError.unauthorized());
    const response = await POST(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal and decides nothing', async () => {
    mocks.requireCsrfToken.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(request(), context());
    expect(response.status).toBe(403);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('rejects a run id that is not a uuid', async () => {
    const response = await POST(request(), context('run-1'));
    expect(response.status).toBe(400);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('rejects a body without tool call ids', async () => {
    const response = await POST(request({ decision: 'approved', toolCallIds: [] }), context());
    expect(response.status).toBe(400);
    expect(mocks.claimSlackApproval).not.toHaveBeenCalled();
  });

  it('returns 404 when the run is not the caller', async () => {
    mocks.claimSlackApproval.mockRejectedValue(
      new mocks.SlackRunApprovalError('missing', 'not_found'),
    );
    const response = await POST(request(), context());
    expect(response.status).toBe(404);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it('returns 409 when the approval is stale', async () => {
    mocks.claimSlackApproval.mockRejectedValue(new mocks.SlackRunApprovalError('stale', 'stale'));
    const response = await POST(request(), context());
    expect(response.status).toBe(409);
  });

  it('returns 409 when the approval cannot be resumed', async () => {
    mocks.claimSlackApproval.mockRejectedValue(new mocks.SlackApprovalUnavailableError('gone'));
    const response = await POST(request(), context());
    expect(response.status).toBe(409);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('claims the approval as the caller, audits it and resumes after the response', async () => {
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      runId: RUN,
      decision: 'approved',
      status: 'resuming',
    });
    expect(mocks.claimSlackApproval).toHaveBeenCalledWith({
      serviceDb: mocks.serviceDb,
      scopedDb: mocks.db,
      userId: 'user-1',
      runId: RUN,
      approval,
    });
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        eventType: 'tool_approval_decided',
        organizationId: ORG,
        detail: expect.objectContaining({ resourceId: RUN, status: 'approved', count: 2 }),
      }),
    );
    expect(mocks.after).toHaveBeenCalledWith(resume);
  });
});
