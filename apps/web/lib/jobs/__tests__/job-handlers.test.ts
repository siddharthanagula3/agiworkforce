import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const mocks = vi.hoisted(() => ({
  loadSchedulePreferences: vi.fn(),
  notifyScheduleCompleted: vi.fn(),
  sendScheduleCompletionEmail: vi.fn(),
  drainAuditDestination: vi.fn(),
  eraseScheduledAccount: vi.fn(),
  reEraseTombstonedAccount: vi.fn(),
  deleteProjectKnowledgeObject: vi.fn(),
  recordResearchReportSettledCost: vi.fn(),
  enqueueJob: vi.fn(),
  fireEventTriggerJob: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: vi.fn((db: DatabaseAdapter) => db),
}));
vi.mock('@/lib/services/schedule-notification-service', () => ({
  loadSchedulePreferences: mocks.loadSchedulePreferences,
  notifyScheduleCompleted: mocks.notifyScheduleCompleted,
}));
vi.mock('@/lib/services/notification-email-service', () => ({
  sendScheduleCompletionEmail: mocks.sendScheduleCompletionEmail,
}));
vi.mock('@/lib/services/audit-streaming-service', () => ({
  drainAuditDestination: mocks.drainAuditDestination,
}));
vi.mock('@/lib/server/scheduled-account-erasure', () => ({
  eraseScheduledAccount: mocks.eraseScheduledAccount,
  reEraseTombstonedAccount: mocks.reEraseTombstonedAccount,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', () => ({
  deleteProjectKnowledgeObject: mocks.deleteProjectKnowledgeObject,
}));
vi.mock('@/lib/services/research-report-service', () => ({
  recordResearchReportSettledCost: mocks.recordResearchReportSettledCost,
}));
vi.mock('@/lib/triggers/trigger-fire', () => ({ fireEventTriggerJob: mocks.fireEventTriggerJob }));
vi.mock('../job-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../job-service')>();
  return { ...actual, enqueueJob: mocks.enqueueJob };
});

import { BACKGROUND_JOB_HANDLERS } from '../job-handlers';
import { PermanentJobError, type BackgroundJob } from '../job-service';
import type { JobHandlerContext } from '../job-drain';

const db = {} as DatabaseAdapter;

function context(
  payload: Record<string, unknown>,
  overrides: Partial<BackgroundJob> = {},
): JobHandlerContext {
  return {
    db,
    signal: new AbortController().signal,
    isFinalAttempt: false,
    job: {
      id: 'job-1',
      queue: 'notifications',
      kind: 'notifications.schedule-completed',
      userId: 'user-1',
      organizationId: null,
      tenantKey: 'user:user-1',
      payload,
      priority: 0,
      status: 'running',
      attempts: 1,
      maxAttempts: 6,
      runAfter: '2026-09-17T00:00:00.000Z',
      leaseExpiresAt: null,
      workerId: 'worker-a',
      idempotencyKey: null,
      lastError: null,
      retryReason: null,
      deadReason: null,
      deadLetteredAt: null,
      cancelRequestedAt: null,
      cancelRequestedBy: null,
      cancelReason: null,
      usage: null,
      originRegion: null,
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:00:00.000Z',
      ...overrides,
    },
  };
}

const notice = { taskId: 'task-1', taskName: 'Daily brief', status: 'success', runId: 'run-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadSchedulePreferences.mockResolvedValue({
    push: true,
    email: false,
    email_address: null,
  });
  mocks.notifyScheduleCompleted.mockResolvedValue({ pushed: true, emailed: false });
  mocks.enqueueJob.mockResolvedValue({ id: 'job-2', status: 'queued', created: true });
});

describe('notifications.schedule-completed', () => {
  const handler = BACKGROUND_JOB_HANDLERS['notifications.schedule-completed']!;

  it('records the in-app notice and leaves the email to its own job', async () => {
    mocks.loadSchedulePreferences.mockResolvedValue({
      push: true,
      email: true,
      email_address: 'user@example.test',
    });

    await expect(handler(context(notice))).resolves.toEqual({ pushed: true, emailQueued: true });
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        kind: 'email.schedule-completed',
        idempotencyKey: 'schedule-email:run-1',
      }),
    );
    expect(mocks.notifyScheduleCompleted).toHaveBeenCalledWith(db, expect.anything(), {
      email: false,
    });
  });

  it('queues no email for an account that did not ask for one', async () => {
    await expect(handler(context(notice))).resolves.toEqual({ pushed: true, emailQueued: false });
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it('refuses a payload that names no run instead of retrying it', async () => {
    await expect(handler(context({ taskId: 'task-1' }))).rejects.toBeInstanceOf(PermanentJobError);
  });
});

describe('email.schedule-completed', () => {
  const handler = BACKGROUND_JOB_HANDLERS['email.schedule-completed']!;

  beforeEach(() => {
    mocks.loadSchedulePreferences.mockResolvedValue({
      push: false,
      email: true,
      email_address: 'user@example.test',
    });
  });

  it('sends to the address on the account at send time', async () => {
    mocks.sendScheduleCompletionEmail.mockResolvedValue({
      delivered: true,
      providerMessageId: 'm1',
    });

    await expect(handler(context(notice))).resolves.toMatchObject({ delivered: true });
    expect(mocks.sendScheduleCompletionEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.test', status: 'success' }),
    );
  });

  it('does nothing for an account that turned the email off after the run', async () => {
    mocks.loadSchedulePreferences.mockResolvedValue({
      push: false,
      email: false,
      email_address: null,
    });

    await expect(handler(context(notice))).resolves.toEqual({ skipped: 'opted_out' });
    expect(mocks.sendScheduleCompletionEmail).not.toHaveBeenCalled();
  });

  it('settles quietly when no email provider is configured', async () => {
    mocks.sendScheduleCompletionEmail.mockResolvedValue({
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY is required',
    });

    await expect(handler(context(notice))).resolves.toEqual({ skipped: 'not_configured' });
  });

  it('retries a transient provider failure and gives up on a refusal', async () => {
    mocks.sendScheduleCompletionEmail.mockResolvedValue({
      delivered: false,
      reason: 'timeout',
      detail: 'the provider timed out',
    });
    await expect(handler(context(notice))).rejects.not.toBeInstanceOf(PermanentJobError);

    mocks.sendScheduleCompletionEmail.mockResolvedValue({
      delivered: false,
      reason: 'invalid_recipient',
      detail: 'not a mailbox',
    });
    await expect(handler(context(notice))).rejects.toBeInstanceOf(PermanentJobError);
  });
});

describe('webhooks.audit-stream-delivery', () => {
  const handler = BACKGROUND_JOB_HANDLERS['webhooks.audit-stream-delivery']!;
  const organizationId = '11111111-1111-4111-8111-111111111111';

  it('delivers to the workspace destination and reports what went', async () => {
    mocks.drainAuditDestination.mockResolvedValue({
      organizationId,
      delivered: 12,
      status: 'delivered',
      error: null,
    });

    await expect(
      handler(context({ organizationId }, { queue: 'webhooks', organizationId, userId: null })),
    ).resolves.toMatchObject({ delivered: 12, status: 'delivered' });
  });

  it('throws on a failed delivery so the queue backs off instead of dropping events', async () => {
    mocks.drainAuditDestination.mockResolvedValue({
      organizationId,
      delivered: 0,
      status: 'failed',
      error: 'endpoint answered 500',
    });

    await expect(
      handler(context({ organizationId }, { queue: 'webhooks', organizationId, userId: null })),
    ).rejects.toThrow('endpoint answered 500');
  });

  it('refuses a job with no workspace instead of retrying it', async () => {
    await expect(
      handler(context({}, { queue: 'webhooks', organizationId: null, userId: null })),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});

describe('data-deletion.scheduled-account-erasure', () => {
  const handler = BACKGROUND_JOB_HANDLERS['data-deletion.scheduled-account-erasure']!;

  it('erases a due account and reports the outcome', async () => {
    mocks.eraseScheduledAccount.mockResolvedValue({ status: 'purged', resurrected: false });

    await expect(
      handler(context({ subjectUserId: 'user-9', mode: 'scheduled' }, { queue: 'data-deletion' })),
    ).resolves.toMatchObject({ status: 'purged', mode: 'scheduled' });
    expect(mocks.eraseScheduledAccount).toHaveBeenCalledWith('user-9');
  });

  it('re-erases a tombstoned subject on the resweep', async () => {
    mocks.reEraseTombstonedAccount.mockResolvedValue({ status: 'purged', resurrected: true });

    await expect(
      handler(context({ subjectUserId: 'ghost-1', mode: 'resweep' }, { queue: 'data-deletion' })),
    ).resolves.toMatchObject({ resurrected: true });
  });

  it('names the stage that refused so the dead letter says where it stopped', async () => {
    mocks.eraseScheduledAccount.mockResolvedValue({
      status: 'failed',
      stage: 'identity',
      detail: 'clerk is down',
    });

    await expect(
      handler(context({ subjectUserId: 'user-9' }, { queue: 'data-deletion' })),
    ).rejects.toThrow(/identity stage: clerk is down/);
  });
});

describe('file-processing and research settlement', () => {
  it('deletes the uploaded object the request could not', async () => {
    const handler = BACKGROUND_JOB_HANDLERS['file-processing.purge-upload-object']!;

    await expect(
      handler(context({ objectKey: 'knowledge/u1/p1/file' }, { queue: 'file-processing' })),
    ).resolves.toMatchObject({ deleted: true });
    expect(mocks.deleteProjectKnowledgeObject).toHaveBeenCalledWith('knowledge/u1/p1/file');
  });

  it('writes the settled research cost onto the report it paid for', async () => {
    const handler = BACKGROUND_JOB_HANDLERS['research.settle-report-cost']!;

    await expect(
      handler(context({ requestId: 'req-1', settledCostMicrousd: 1234 }, { queue: 'research' })),
    ).resolves.toMatchObject({ requestId: 'req-1' });
    expect(mocks.recordResearchReportSettledCost).toHaveBeenCalledWith(db, {
      userId: 'user-1',
      requestId: 'req-1',
      settledCostMicrousd: 1234,
    });
  });

  it('refuses a settlement with no cost rather than retrying it forever', async () => {
    const handler = BACKGROUND_JOB_HANDLERS['research.settle-report-cost']!;

    await expect(
      handler(context({ requestId: 'req-1' }, { queue: 'research' })),
    ).rejects.toBeInstanceOf(PermanentJobError);
  });
});

describe('the registry', () => {
  it('registers a handler for every kind a producer can enqueue', () => {
    expect(Object.keys(BACKGROUND_JOB_HANDLERS).sort()).toEqual(
      [
        'data-deletion.scheduled-account-erasure',
        'email.schedule-completed',
        'event-triggers.fire',
        'file-processing.purge-upload-object',
        'media-generation.image-attempt',
        'notifications.schedule-completed',
        'research.settle-report-cost',
        'webhooks.audit-stream-delivery',
      ].sort(),
    );
  });
});
