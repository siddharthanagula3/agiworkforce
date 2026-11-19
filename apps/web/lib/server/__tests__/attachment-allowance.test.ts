// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
  CHAT_LARGE_FILE_MAX_BYTES,
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
} from '@agiworkforce/cloud-contracts';
import {
  MAX_PLAN_ATTACHMENT_BYTES,
  MAX_PLAN_CHAT_FILE_BYTES,
  getBillingPlanPricing,
  getPlanDailyChatFileUploadBytes,
  getPlanMaxChatFileBytes,
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
  CHAT_IMAGE_TOO_LARGE_CODE,
  CHAT_LARGE_FILES_UNAVAILABLE_CODE,
  CHAT_LARGE_FILE_STORAGE_FULL_CODE,
  DAILY_UPLOAD_LIMIT_CODE,
  admitAttachmentUpload,
  admitChatLargeFileUpload,
  attachmentLimitBytes,
  attachmentSizeRefusal,
  chatAttachmentLimitsForPlan,
  confirmChatLargeFileAdmission,
  resolveChatAttachmentLimits,
} from '../attachment-allowance';
import {
  DAILY_LARGE_FILE_BYTES_CODE,
  LARGE_FILE_INTAKES_IN_FLIGHT_CODE,
  assertLargeFileIntakeSlot,
  chargeDailyLargeFileBytes,
} from '../chat-file-intake/quotas';
import { createQueryDb } from '../chat-file-intake/__tests__/fake-query-db';
import { PROTOCOL_2, SCANNER_ENV } from '../chat-file-intake/__tests__/fake-scanner';

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

  it('allows 20 files a message on every plan, Free included', () => {
    for (const plan of [
      'free',
      'basic',
      'pro',
      'max',
      'max_15x',
      'team',
      'team_premium',
      'enterprise',
    ]) {
      expect(getPlanMaxAttachmentsPerMessage(plan), plan).toBe(20);
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
    expect(MAX_CHAT_ATTACHMENT_BYTES).toBe(25 * MIB);
    expect(attachmentLimitBytes('max', 'chat-attachment', 'application/pdf')).toBe(
      MAX_CHAT_ATTACHMENT_BYTES,
    );
    expect(attachmentLimitBytes('max', 'knowledge-file')).toBe(25 * MIB);
  });

  it('holds a chat image to the image ceiling', () => {
    expect(MAX_CHAT_IMAGE_ATTACHMENT_BYTES).toBe(20 * MIB);
    expect(attachmentLimitBytes('max', 'chat-attachment', 'image/jpeg')).toBe(
      MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
    );
  });

  it('holds a chat file of unknown type to the stricter image ceiling', () => {
    expect(attachmentLimitBytes('max', 'chat-attachment')).toBe(MAX_CHAT_IMAGE_ATTACHMENT_BYTES);
  });
});

describe('chatAttachmentLimitsForPlan', () => {
  it('hands each plan the limits the server holds its uploads and turns to', () => {
    expect(chatAttachmentLimitsForPlan('free')).toEqual({
      maxFileBytes: attachmentLimitBytes('free', 'chat-attachment', 'application/pdf'),
      maxImageBytes: attachmentLimitBytes('free', 'chat-attachment', 'image/png'),
      maxMessageBytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
      maxFilesPerMessage: Math.min(
        MAX_CHAT_ATTACHMENT_COUNT,
        getPlanMaxAttachmentsPerMessage('free'),
      ),
    });
    expect(chatAttachmentLimitsForPlan('pro').maxFilesPerMessage).toBe(
      Math.min(MAX_CHAT_ATTACHMENT_COUNT, getPlanMaxAttachmentsPerMessage('pro')),
    );
    expect(chatAttachmentLimitsForPlan('pro').maxImageBytes).toBe(MAX_CHAT_IMAGE_ATTACHMENT_BYTES);
  });

  it('hands every Cloud plan twenty files to one message, Free included', () => {
    for (const plan of ['free', 'basic', 'pro', 'max', 'max_15x', 'team']) {
      expect(chatAttachmentLimitsForPlan(plan).maxFilesPerMessage, plan).toBe(20);
    }
  });
});

describe('attachmentSizeRefusal', () => {
  it('admits a chat document at the chat limit and refuses one byte more', () => {
    expect(
      attachmentSizeRefusal('pro', 'chat-attachment', MAX_CHAT_ATTACHMENT_BYTES, 'application/pdf'),
    ).toBeNull();
    const refusal = attachmentSizeRefusal(
      'pro',
      'chat-attachment',
      MAX_CHAT_ATTACHMENT_BYTES + 1,
      'application/pdf',
    );
    expect(refusal?.statusCode).toBe(413);
    expect(refusal?.message).toBe(
      `${getBillingPlanPricing('pro').label} accounts can upload files up to 25 MB each.`,
    );
  });

  it('refuses a chat image one byte over the image ceiling with the image message', () => {
    expect(
      attachmentSizeRefusal('pro', 'chat-attachment', MAX_CHAT_IMAGE_ATTACHMENT_BYTES, 'image/png'),
    ).toBeNull();
    const refusal = attachmentSizeRefusal(
      'pro',
      'chat-attachment',
      MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1,
      'image/png',
    );
    expect(refusal?.statusCode).toBe(413);
    expect(refusal?.message).toBe(CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE);
    expect(refusal?.message).toBe(
      `Images can be up to ${MAX_CHAT_IMAGE_ATTACHMENT_BYTES / MIB} MB each. Attach a smaller image.`,
    );
    expect(refusal?.details).toMatchObject({ code: CHAT_IMAGE_TOO_LARGE_CODE });
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

  it('gives the count back when its expiry cannot be set, so a refused upload never spends one', async () => {
    mocks.planTier.mockResolvedValue('free');
    const store = memoryStore();
    store.expire.mockRejectedValueOnce(new Error('store unreachable'));
    mocks.store.mockReturnValue(store);
    const now = new Date('2026-10-10T12:00:00Z');

    await expect(
      admitAttachmentUpload({ db, userId: 'user-1', kind: 'chat-attachment', byteCount: MIB, now }),
    ).rejects.toMatchObject({ statusCode: 429 });

    expect([...store.values.values()]).toEqual([0]);
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

const GIB = 1024 * MIB;
const SCANNER_MAX_BYTES = PROTOCOL_2.answers['capability']!.body['maxSourceScanBytes'] as number;

interface StorageState {
  storedBytes: number;
  inFlightBytes: number;
  inFlightCount: number;
  failStorage?: boolean;
}

function largeFileDb(state: StorageState) {
  return createQueryDb(async (sql) => {
    if (/to_regclass/.test(sql)) {
      return [{ intakes_table: true, preparations_table: true, scanned_sha256_column: true }];
    }
    if (/as in_flight/.test(sql)) return [{ in_flight: state.inFlightCount }];
    if (/as declared/.test(sql)) return [{ declared: String(state.inFlightBytes) }];
    if (/from public\.media_assets/.test(sql)) {
      if (state.failStorage) throw new Error('storage sum failed');
      return [{ total: String(state.storedBytes) }];
    }
    throw new Error(`unexpected statement: ${sql}`);
  });
}

let clockMs = Date.parse('2026-11-15T12:00:00Z');

function readinessDeps(
  capability: Record<string, unknown> = PROTOCOL_2.answers['capability']!.body,
) {
  clockMs += 10 * 60_000;
  const nowMs = clockMs;
  return {
    fetch: vi.fn(async () => new Response(JSON.stringify(capability), { status: 200 })),
    store: null,
    now: () => nowMs,
  };
}

function nativeRequest(): Request {
  return new Request('https://app.example.test/api/files/uploads', { method: 'POST' });
}

describe('large chat files', () => {
  beforeEach(() => {
    vi.stubEnv('CHAT_LARGE_FILES_ENABLED', 'on');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_URL', SCANNER_ENV.UPLOAD_SCAN_WEBHOOK_URL);
    vi.stubEnv('UPLOAD_SCAN_WEBHOOK_TOKEN', SCANNER_ENV.UPLOAD_SCAN_WEBHOOK_TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts no large chat file beyond the largest plan value', () => {
    expect(CHAT_LARGE_FILE_MAX_BYTES).toBe(MAX_PLAN_CHAT_FILE_BYTES);
  });

  describe('resolveChatAttachmentLimits', () => {
    function scope(planTier: string, state: StorageState, deps = readinessDeps()) {
      const { db, query } = largeFileDb(state);
      return {
        query,
        deps,
        input: {
          db: db as never,
          userId: 'user-1',
          organizationId: null,
          planTier,
          request: nativeRequest(),
          readinessDeps: deps,
        },
      };
    }

    it('answers today’s limits byte for byte with the flag off, asking nothing', async () => {
      vi.stubEnv('CHAT_LARGE_FILES_ENABLED', '');
      const { input, query, deps } = scope('pro', {
        storedBytes: 0,
        inFlightBytes: 0,
        inFlightCount: 0,
      });

      expect(await resolveChatAttachmentLimits(input)).toStrictEqual(
        chatAttachmentLimitsForPlan('pro'),
      );
      expect(query).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    });

    it.each(['free', 'not-a-plan'])('answers today’s limits for %s', async (planTier) => {
      const { input } = scope(planTier, { storedBytes: 0, inFlightBytes: 0, inFlightCount: 0 });
      expect(await resolveChatAttachmentLimits(input)).toStrictEqual(
        chatAttachmentLimitsForPlan(planTier),
      );
    });

    it('answers today’s limits when the scanner speaks protocol 1', async () => {
      const deps = readinessDeps({
        protocol: 1,
        maxSourceScanBytes: GIB,
        queueDepth: 0,
        running: 0,
      });
      const { input } = scope('pro', { storedBytes: 0, inFlightBytes: 0, inFlightCount: 0 }, deps);
      expect(await resolveChatAttachmentLimits(input)).toStrictEqual(
        chatAttachmentLimitsForPlan('pro'),
      );
    });

    it('offers the large limits and keeps today’s message limit as the inline one', async () => {
      const { input } = scope('pro', { storedBytes: GIB, inFlightBytes: GIB, inFlightCount: 1 });
      const today = chatAttachmentLimitsForPlan('pro');

      expect(await resolveChatAttachmentLimits(input)).toStrictEqual({
        maxFileBytes: Math.min(
          CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
          getPlanMaxChatFileBytes('pro'),
          SCANNER_MAX_BYTES,
        ),
        maxImageBytes: today.maxImageBytes,
        maxMessageBytes: Math.max(
          today.maxMessageBytes,
          Math.min(CHAT_LARGE_FILE_POLICY.largeFiles.maxMessageBytes, 8 * GIB),
        ),
        maxFilesPerMessage: Math.max(
          today.maxFilesPerMessage,
          Math.min(
            CHAT_LARGE_FILE_POLICY.largeFiles.maxCount,
            getPlanMaxAttachmentsPerMessage('pro'),
          ),
        ),
        largeFilesAvailable: true,
        storageRemainingBytes: 8 * GIB,
        inlineMessageBytes: today.maxMessageBytes,
      });
    });

    it('lowers the large file limit to the storage left, never below today’s', async () => {
      const today = chatAttachmentLimitsForPlan('basic');
      const nearlyFull = scope('basic', {
        storedBytes: GIB - 100 * MIB,
        inFlightBytes: 0,
        inFlightCount: 0,
      });
      const full = scope('basic', { storedBytes: GIB, inFlightBytes: 0, inFlightCount: 0 });

      expect((await resolveChatAttachmentLimits(nearlyFull.input)).maxFileBytes).toBe(100 * MIB);
      const fullLimits = await resolveChatAttachmentLimits(full.input);
      expect(fullLimits.maxFileBytes).toBe(today.maxFileBytes);
      expect(fullLimits.maxMessageBytes).toBe(today.maxMessageBytes);
      expect(fullLimits.storageRemainingBytes).toBe(0);
    });

    it('answers today’s limits when storage cannot be read', async () => {
      const { input } = scope('pro', {
        storedBytes: 0,
        inFlightBytes: 0,
        inFlightCount: 0,
        failStorage: true,
      });
      expect(await resolveChatAttachmentLimits(input)).toStrictEqual(
        chatAttachmentLimitsForPlan('pro'),
      );
    });
  });

  describe('admitChatLargeFileUpload', () => {
    function admit(
      planTier: string,
      state: StorageState,
      over: {
        byteCount?: number;
        temporaryChat?: boolean;
        deps?: ReturnType<typeof readinessDeps>;
      } = {},
    ) {
      mocks.planTier.mockResolvedValue(planTier);
      const { db } = largeFileDb(state);
      return admitChatLargeFileUpload({
        db: db as never,
        userId: 'user-1',
        organizationId: null,
        request: nativeRequest(),
        fileName: 'survey.csv',
        mimeType: 'text/csv',
        byteCount: over.byteCount ?? 100 * MIB,
        temporaryChat: over.temporaryChat ?? false,
        nowMs: Date.parse('2026-11-15T12:00:00Z'),
        readinessDeps: over.deps ?? readinessDeps(),
      });
    }

    const EMPTY: StorageState = { storedBytes: 0, inFlightBytes: 0, inFlightCount: 0 };

    it('admits a large file and charges its bytes to the day', async () => {
      const store = memoryStore();
      mocks.store.mockReturnValue(store);

      const admitted = await admit('basic', EMPTY);

      expect(admitted).toMatchObject({ planTier: 'basic', dailyBytesCharged: 100 * MIB });
      expect([...store.values.values()]).toEqual([100 * MIB]);
    });

    it('refuses with the unavailable code and charges nothing while the flag is off', async () => {
      vi.stubEnv('CHAT_LARGE_FILES_ENABLED', 'off');
      const store = memoryStore();
      mocks.store.mockReturnValue(store);

      await expect(admit('pro', EMPTY)).rejects.toMatchObject({
        statusCode: 413,
        details: { code: CHAT_LARGE_FILES_UNAVAILABLE_CODE },
      });
      expect(store.increment).not.toHaveBeenCalled();
    });

    it('refuses with the unavailable code when the scanner speaks protocol 1', async () => {
      const deps = readinessDeps({
        protocol: 1,
        maxSourceScanBytes: GIB,
        queueDepth: 0,
        running: 0,
      });
      await expect(admit('pro', EMPTY, { deps })).rejects.toMatchObject({
        statusCode: 413,
        details: { code: CHAT_LARGE_FILES_UNAVAILABLE_CODE },
      });
    });

    it.each(['free', 'not-a-plan'])(
      'refuses %s, whose plan has no large path, without charging',
      async (planTier) => {
        const store = memoryStore();
        mocks.store.mockReturnValue(store);
        await expect(admit(planTier, EMPTY)).rejects.toMatchObject({ statusCode: 413 });
        expect(store.increment).not.toHaveBeenCalled();
      },
    );

    it.each(['free', 'not-a-plan'])(
      'treats a zero daily byte or in-flight value on %s as a refusal, never as unlimited',
      async (planTier) => {
        const store = memoryStore();
        expect(getPlanDailyChatFileUploadBytes(planTier)).toBe(0);
        await expect(
          chargeDailyLargeFileBytes({
            userId: 'user-1',
            planTier,
            byteCount: MIB,
            store: store as never,
          }),
        ).rejects.toMatchObject({
          statusCode: 429,
          details: { code: DAILY_LARGE_FILE_BYTES_CODE },
        });
        expect(() => assertLargeFileIntakeSlot({ planTier, inFlight: 0 })).toThrow(
          expect.objectContaining({
            statusCode: 429,
            details: expect.objectContaining({ code: LARGE_FILE_INTAKES_IN_FLIGHT_CODE }),
          }),
        );
        expect(store.increment).not.toHaveBeenCalled();
      },
    );

    it('refuses a file over the smallest of the plan, the policy and the scanner', async () => {
      const deps = readinessDeps({
        protocol: 2,
        maxSourceScanBytes: 200 * MIB,
        queueDepth: 0,
        running: 0,
      });
      await expect(admit('pro', EMPTY, { byteCount: 200 * MIB + 1, deps })).rejects.toMatchObject({
        statusCode: 413,
        details: { code: ATTACHMENT_TOO_LARGE_CODE },
      });
    });

    it('counts two 500 MiB files still in flight against storage and refuses the next', async () => {
      const store = memoryStore();
      mocks.store.mockReturnValue(store);
      const twoInFlight = { storedBytes: 0, inFlightBytes: 1000 * MIB, inFlightCount: 2 };

      await expect(admit('basic', twoInFlight)).rejects.toMatchObject({
        statusCode: 413,
        details: { code: CHAT_LARGE_FILE_STORAGE_FULL_CODE },
      });
      expect(store.increment).not.toHaveBeenCalled();
      await expect(admit('basic', twoInFlight, { temporaryChat: true })).resolves.toMatchObject({
        dailyBytesCharged: 100 * MIB,
      });
    });

    it('refuses the day’s bytes beyond the plan with 429 and keeps the count unchanged', async () => {
      const store = memoryStore();
      mocks.store.mockReturnValue(store);
      store.values.set(
        'agi:chat-files:daily-bytes:user-1:2026-11-15',
        getPlanDailyChatFileUploadBytes('basic') - 50 * MIB,
      );

      await expect(admit('basic', EMPTY)).rejects.toMatchObject({
        statusCode: 429,
        details: { code: DAILY_LARGE_FILE_BYTES_CODE },
      });
      expect(store.values.get('agi:chat-files:daily-bytes:user-1:2026-11-15')).toBe(
        getPlanDailyChatFileUploadBytes('basic') - 50 * MIB,
      );
    });

    describe('confirmChatLargeFileAdmission, once the row is written', () => {
      const LIMIT = 1000 * MIB;

      function confirm(state: StorageState, temporaryChat = false, planTier = 'basic') {
        const { db } = largeFileDb(state);
        return confirmChatLargeFileAdmission({
          db: db as never,
          userId: 'user-1',
          organizationId: null,
          temporaryChat,
          admitted: {
            planTier,
            dailyBytesCharged: 100 * MIB,
            chargedAtMs: 0,
            storageLimitBytes: LIMIT,
          },
        });
      }

      const NONE = { storedBytes: 0, inFlightBytes: 0, inFlightCount: 1 };

      it('keeps a create whose own row fills the last slot and the last storage', async () => {
        await expect(
          confirm({
            storedBytes: LIMIT - 300 * MIB,
            inFlightBytes: 300 * MIB,
            inFlightCount: 3,
          }),
        ).resolves.toBeUndefined();
      });

      it('refuses a create whose own row passes the slots', async () => {
        await expect(confirm({ ...NONE, inFlightCount: 4 })).rejects.toMatchObject({
          statusCode: 429,
          details: { code: LARGE_FILE_INTAKES_IN_FLIGHT_CODE },
        });
      });

      it('refuses a create whose own row passes storage, outside temporary chats', async () => {
        const over = {
          ...NONE,
          storedBytes: LIMIT - 300 * MIB,
          inFlightBytes: 300 * MIB + 1,
        };

        await expect(confirm(over)).rejects.toMatchObject({
          statusCode: 413,
          details: { code: CHAT_LARGE_FILE_STORAGE_FULL_CODE },
        });
        await expect(confirm(over, true)).resolves.toBeUndefined();
      });

      it.each(['free', 'not-a-plan'])(
        'refuses %s, whose plan value of zero is a refusal and never unlimited',
        async (planTier) => {
          await expect(confirm(NONE, false, planTier)).rejects.toMatchObject({
            statusCode: 429,
            details: { code: LARGE_FILE_INTAKES_IN_FLIGHT_CODE },
          });
        },
      );

      it('refuses a create whose row is not among the rows in flight', async () => {
        await expect(confirm({ ...NONE, inFlightCount: 0 })).rejects.toMatchObject({
          statusCode: 413,
          details: { code: CHAT_LARGE_FILES_UNAVAILABLE_CODE },
        });
      });
    });

    it('refuses a fourth file in flight on Basic with 429 before charging', async () => {
      const store = memoryStore();
      mocks.store.mockReturnValue(store);

      await expect(
        admit('basic', { storedBytes: 0, inFlightBytes: 0, inFlightCount: 3 }),
      ).rejects.toMatchObject({
        statusCode: 429,
        details: { code: LARGE_FILE_INTAKES_IN_FLIGHT_CODE },
      });
      expect(store.increment).not.toHaveBeenCalled();
    });
  });
});
