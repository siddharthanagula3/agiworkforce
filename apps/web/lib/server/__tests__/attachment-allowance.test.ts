import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CHAT_ATTACHMENT_BYTES } from '@agiworkforce/cloud-contracts';
import {
  MAX_PLAN_ATTACHMENT_BYTES,
  getPlanDailyAttachmentUploads,
  getPlanMaxAttachmentBytes,
  getPlanMaxAttachmentsPerMessage,
} from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  planTier: vi.fn(),
  store: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/entitlement-resolution', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveEntitledPlanTier: (...args: unknown[]) => mocks.planTier(...args),
}));
vi.mock('@/lib/server/key-value', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getKeyValueStore: () => mocks.store(),
}));

import {
  ATTACHMENT_TOO_LARGE_CODE,
  CHAT_ATTACHMENT_NEEDS_PROJECT_CODE,
  DAILY_UPLOAD_LIMIT_CODE,
  admitAttachmentUpload,
  attachmentLimitBytes,
  attachmentSizeRefusal,
} from '../attachment-allowance';

const MIB = 1024 * 1024;
const db = {} as never;

function memoryStore() {
  const values = new Map<string, number>();
  return {
    values,
    increment: vi.fn(async (key: string, amount = 1) => {
      const next = (values.get(key) ?? 0) + amount;
      values.set(key, next);
      return next;
    }),
    expire: vi.fn(async () => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.mockReturnValue(memoryStore());
});

describe('per-plan attachment limits', () => {
  it.each([
    ['free', 25],
    ['basic', 25],
    ['pro', 25],
    ['max', 25],
    ['max_15x', 25],
    ['team', 25],
    ['team_premium', 25],
    ['enterprise', 25],
  ] as const)('lets %s upload files up to %i MB', (plan, mb) => {
    expect(getPlanMaxAttachmentBytes(plan)).toBe(mb * MIB);
  });

  it('allows 20 files a message on paid plans and keeps Free at 10', () => {
    expect(getPlanMaxAttachmentsPerMessage('free')).toBe(10);
    for (const plan of ['basic', 'pro', 'max', 'max_15x', 'team', 'team_premium', 'enterprise']) {
      expect(getPlanMaxAttachmentsPerMessage(plan)).toBe(20);
    }
  });

  it('counts five uploads a day on Free only', () => {
    expect(getPlanDailyAttachmentUploads('free')).toBe(5);
    expect(getPlanDailyAttachmentUploads('pro')).toBeNull();
  });

  it('fails closed for an unknown plan', () => {
    expect(getPlanMaxAttachmentBytes('not-a-plan')).toBe(0);
    expect(getPlanDailyAttachmentUploads('not-a-plan')).toBe(0);
  });

  it('accepts schemas up to the largest plan limit, which is the server’s outer bound', () => {
    expect(MAX_PLAN_ATTACHMENT_BYTES).toBe(25 * MIB);
  });

  it('keeps a chat attachment within what is sent to the model inline', () => {
    expect(attachmentLimitBytes('max', 'chat-attachment')).toBe(MAX_CHAT_ATTACHMENT_BYTES);
    expect(attachmentLimitBytes('max', 'knowledge-file')).toBe(25 * MIB);
  });
});

describe('attachmentSizeRefusal', () => {
  it('sends a paid chat file over the inline limit to a project, not "too large"', () => {
    const refusal = attachmentSizeRefusal('pro', 'chat-attachment', 20 * MIB);
    expect(refusal?.message).toBe(
      'Files over 12 MB go into a project, where AGI reads and searches them.',
    );
    expect(refusal?.details).toMatchObject({ code: CHAT_ATTACHMENT_NEEDS_PROJECT_CODE });
  });

  it('names the plan limit and offers no upgrade while every plan shares it', () => {
    const refusal = attachmentSizeRefusal('basic', 'knowledge-file', 26 * MIB);
    expect(refusal?.statusCode).toBe(413);
    expect(refusal?.message).toBe('Basic accounts can upload files up to 25 MB each.');
    expect(refusal?.details).toMatchObject({ code: ATTACHMENT_TOO_LARGE_CODE });
    expect(refusal?.details).not.toHaveProperty('recovery');
  });

  it('admits a file at the plan limit', () => {
    expect(attachmentSizeRefusal('pro', 'knowledge-file', 25 * MIB)).toBeNull();
  });
});

describe('admitAttachmentUpload', () => {
  it('admits five Free uploads a day and refuses the sixth with the upgrade path', async () => {
    mocks.planTier.mockResolvedValue('free');
    const now = new Date('2026-10-10T12:00:00Z');
    for (let index = 0; index < 5; index += 1) {
      await admitAttachmentUpload({
        db,
        userId: 'user-1',
        kind: 'chat-attachment',
        byteCount: MIB,
        now,
      });
    }

    const refusal = await admitAttachmentUpload({
      db,
      userId: 'user-1',
      kind: 'knowledge-file',
      byteCount: MIB,
      now,
    }).catch((error: unknown) => error);

    expect(refusal).toMatchObject({
      statusCode: 429,
      details: { code: DAILY_UPLOAD_LIMIT_CODE, recovery: { action: 'upgrade' } },
    });
    expect((refusal as Error).message).toContain('Free accounts can upload 5 files a day');
  });

  it('refuses a Free upload when the daily count cannot be kept', async () => {
    mocks.planTier.mockResolvedValue('free');
    mocks.store.mockReturnValue(null);

    await expect(
      admitAttachmentUpload({ db, userId: 'user-1', kind: 'chat-attachment', byteCount: MIB }),
    ).rejects.toMatchObject({ statusCode: 429 });
  });

  it('does not count paid uploads, and refuses one over the plan limit before counting', async () => {
    const store = memoryStore();
    mocks.store.mockReturnValue(store);
    mocks.planTier.mockResolvedValue('pro');

    await admitAttachmentUpload({
      db,
      userId: 'user-1',
      kind: 'knowledge-file',
      byteCount: 20 * MIB,
    });
    await expect(
      admitAttachmentUpload({
        db,
        userId: 'user-1',
        kind: 'knowledge-file',
        byteCount: 30 * MIB,
      }),
    ).rejects.toMatchObject({ statusCode: 413 });

    expect(store.increment).not.toHaveBeenCalled();
  });
});
