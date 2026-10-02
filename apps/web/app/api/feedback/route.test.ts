import { beforeEach, describe, expect, it, vi } from 'vitest';

type ObjectStorageModule = typeof import('@/lib/server/object-storage');

interface FakeDb {
  query: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
}

const feedbackRouteMocks = vi.hoisted(() => {
  const query = vi.fn();
  const execute = vi.fn();
  const ownerDb: FakeDb = {
    query,
    execute,
    transaction: vi.fn(async (run: (tx: FakeDb) => unknown) => run(ownerDb)),
  };
  const scopedDb: FakeDb = {
    query,
    execute,
    transaction: vi.fn(async (run: (tx: FakeDb) => unknown) => run(scopedDb)),
  };
  return {
    auth: vi.fn(),
    optionalUser: vi.fn(),
    query,
    execute,
    ownerDb,
    scopedDb,
    claimScope: vi.fn((..._args: unknown[]) => scopedDb),
    storageConfigured: vi.fn(() => true),
    putPrivateObject: vi.fn(async ({ key }: { key: string }) => ({ key })),
  };
});

vi.mock('@/lib/api-auth', () => ({
  getSuspendedAccountUser: vi.fn(async () => null),
  getOptionalAuthUser: feedbackRouteMocks.optionalUser,
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
  getClerkAuthorizedParties: vi.fn(() => []),
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: feedbackRouteMocks.auth,
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => feedbackRouteMocks.ownerDb),
}));

vi.mock('@/lib/server/claimed-user-scope-db', () => ({
  createClaimedUserScopedDb: feedbackRouteMocks.claimScope,
}));

vi.mock('@/lib/server/object-storage', async (importOriginal) => ({
  ...(await importOriginal<ObjectStorageModule>()),
  isPrivateObjectStorageConfigured: feedbackRouteMocks.storageConfigured,
  putPrivateObject: feedbackRouteMocks.putPrivateObject,
}));

import { DELETE, POST } from './route';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import {
  RESPONSE_RATING_COMMENT_MAX_CHARS,
  RESPONSE_RATING_MESSAGE_MAX_CHARS,
  WEB_RESPONSE_RATING_MESSAGE,
} from './response-rating-contract';

function request(body: unknown) {
  return new Request('http://localhost:3000/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

interface StoredFeedback {
  user_id: string | null;
  subject: string;
  message: string;
  metadata: Record<string, unknown>;
}

function storedRating(
  userId: string,
  messageId: string,
  rating: 'up' | 'down',
  extra: Record<string, unknown> = {},
): StoredFeedback {
  return {
    user_id: userId,
    subject: `Response rated ${rating}`,
    message: 'An answer in web chat. The answer text is not attached.',
    metadata: { feedback_context: 'response_rating', message_id: messageId, rating, ...extra },
  };
}

function feedbackTable(rows: StoredFeedback[] = []): StoredFeedback[] {
  const run = async (sql: string, params: unknown[] = []): Promise<number> => {
    if (sql.includes('pg_advisory_xact_lock')) return 1;
    if (/^\s*delete from public\.feedback\b/.test(sql)) {
      expect(sql).toMatch(/\buser_id = \$1\b/);
      expect(sql).toContain("metadata->>'feedback_context' = 'response_rating'");
      expect(sql).toMatch(/metadata->>'message_id' = \$2\b/);
      const kept = rows.filter(
        (row) =>
          row.user_id !== params[0] ||
          row.metadata['feedback_context'] !== 'response_rating' ||
          row.metadata['message_id'] !== params[1],
      );
      const removed = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return removed;
    }
    if (/^\s*insert into public\.feedback \(user_id, subject, message, metadata\)/.test(sql)) {
      rows.push({
        user_id: params[0] as string | null,
        subject: String(params[1]),
        message: String(params[2]),
        metadata: JSON.parse(String(params[3])) as Record<string, unknown>,
      });
      return 1;
    }
    throw new Error(`unexpected statement: ${sql}`);
  };
  feedbackRouteMocks.execute.mockImplementation(run);
  feedbackRouteMocks.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    await run(sql, params);
    return [];
  });
  return rows;
}

function rateLimitKeys(): unknown[] {
  return vi.mocked(withRateLimit).mock.calls.map(([, key]) => key);
}

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedbackRouteMocks.optionalUser.mockResolvedValue({ userId: 'user-web' });
    feedbackRouteMocks.query.mockResolvedValue([]);
  });

  it('stores web composer feedback with bounded diagnostic metadata', async () => {
    const response = await POST(
      request({
        subject: 'Something is broken · Web chat',
        message: 'The artifact did not refresh.',
        metadata: {
          source: 'web',
          platform: 'web',
          version: '1.2.3',
          user_agent: 'test browser',
          page_path: '/chat/conversation-7',
          conversation_id: 'conversation-7',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(feedbackRouteMocks.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into public.feedback'),
      [
        'user-web',
        'Something is broken · Web chat',
        'The artifact did not refresh.',
        expect.stringContaining('"source":"web"'),
      ],
    );
    expect(feedbackRouteMocks.query.mock.calls[0]?.[1]?.[3]).toContain(
      '"conversation_id":"conversation-7"',
    );
  });

  it("stores a signed-in caller's feedback through a connection scoped to that caller", async () => {
    await POST(
      request({
        subject: 'Something is broken · Web chat',
        message: 'The artifact did not refresh.',
        metadata: { source: 'web', platform: 'web', version: '1.2.3', user_agent: 'test' },
      }),
    );

    expect(feedbackRouteMocks.claimScope).toHaveBeenCalledWith(feedbackRouteMocks.ownerDb, {
      userId: 'user-web',
      organizationId: null,
    });
    expect(feedbackRouteMocks.query).toHaveBeenCalledTimes(1);
  });

  it('stores signed-out feedback without a user id on the owner connection', async () => {
    feedbackRouteMocks.optionalUser.mockResolvedValue(null);

    const response = await POST(
      request({
        subject: 'Desktop report',
        message: 'Something happened.',
        metadata: { platform: 'macos', version: '1.0.0', user_agent: 'AGI Desktop' },
      }),
    );

    expect(response.status).toBe(200);
    expect(feedbackRouteMocks.claimScope).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query.mock.calls[0]?.[1]?.[0]).toBeNull();
  });

  it('counts general feedback against the feedback limit', async () => {
    await POST(
      request({
        subject: 'Desktop report',
        message: 'Something happened.',
        metadata: { platform: 'macos', version: '1.0.0', user_agent: 'AGI Desktop' },
      }),
    );

    expect(vi.mocked(withRateLimit)).toHaveBeenCalledWith(expect.anything(), 'mobile-feedback');
  });

  it('keeps existing desktop payloads backward compatible', async () => {
    const response = await POST(
      request({
        subject: 'Desktop report',
        message: 'Something happened.',
        user_id: 'untrusted-client-id',
        metadata: {
          platform: 'macos',
          version: '1.0.0',
          user_agent: 'AGI Desktop',
        },
      }),
    );

    expect(response.status).toBe(200);
    const metadata = String(feedbackRouteMocks.query.mock.calls[0]?.[1]?.[3]);
    expect(metadata).toContain('"source":"desktop"');
    expect(metadata).toContain('"claimed_user_id":"untrusted-client-id"');
  });

  it('stores a safety-refusal report with identifiers but no transcript fields', async () => {
    const response = await POST(
      request({
        subject: 'Incorrect safety refusal · Web chat',
        message: 'This was a benign defensive-security request.',
        metadata: {
          source: 'web',
          platform: 'web',
          version: '1.2.3',
          user_agent: 'test browser',
          page_path: '/chat/conversation-9',
          conversation_id: 'conversation-9',
          feedback_context: 'safety_refusal',
          message_id: 'assistant-4',
          finish_reason: 'refusal',
        },
      }),
    );

    expect(response.status).toBe(200);
    const metadata = String(feedbackRouteMocks.query.mock.calls[0]?.[1]?.[3]);
    expect(metadata).toContain('"feedback_context":"safety_refusal"');
    expect(metadata).toContain('"message_id":"assistant-4"');
    expect(metadata).toContain('"finish_reason":"refusal"');
    expect(metadata).not.toContain('defensive-security request');
  });

  it('rejects a safety-refusal report without the bounded refusal identifiers', async () => {
    const response = await POST(
      request({
        subject: 'Incorrect safety refusal · Web chat',
        message: 'Please review this refusal.',
        metadata: {
          source: 'web',
          platform: 'web',
          version: '1.2.3',
          user_agent: 'test browser',
          feedback_context: 'safety_refusal',
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });

  it('redacts secrets out of the free text and the attached logs before the insert', async () => {
    const apiKey = `sk-${'A'.repeat(40)}`;
    const response = await POST(
      request({
        subject: `Auth broken with ${apiKey}`,
        message: `I pasted my key ${apiKey} into the composer and it failed.`,
        metadata: {
          source: 'desktop',
          platform: 'macos',
          version: '1.0.0',
          user_agent: 'AGI Desktop',
        },
        logs: `ERROR request rejected Authorization: Bearer ${'b'.repeat(30)} key=${apiKey}`,
      }),
    );

    expect(response.status).toBe(200);
    const [, storedSubject, storedMessage, storedMetadata] = feedbackRouteMocks.query.mock
      .calls[0]?.[1] as [string | null, string, string, string];

    expect(storedSubject).not.toContain(apiKey);
    expect(storedSubject).toContain('[redacted:api-key]');
    expect(storedMessage).not.toContain(apiKey);
    expect(storedMessage).toContain('[redacted:api-key]');
    expect(storedMessage).toContain('into the composer and it failed.');

    expect(storedMetadata).not.toContain(apiKey);
    expect(storedMetadata).not.toContain('b'.repeat(30));
    expect(storedMetadata).toContain('[redacted:api-key]');
    expect(storedMetadata).toContain('[redacted:bearer-token]');
  });

  it('checks the feedback ceiling before it reads the body', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce(new Response(null, { status: 429 }) as never);
    const flood = request({
      subject: 'Desktop report',
      message: 'Something happened.',
      metadata: { platform: 'macos', version: '1.0.0', user_agent: 'AGI Desktop' },
    }) as unknown as Request;
    const readBody = vi.spyOn(flood, 'json');

    const response = await POST(flood as never);

    expect(response.status).toBe(429);
    expect(rateLimitKeys()).toEqual(['feedback']);
    expect(readBody).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });

  it('counts a report against the report ceiling once it is past the feedback ceiling', async () => {
    await POST(
      request({
        subject: 'Desktop report',
        message: 'Something happened.',
        metadata: { platform: 'macos', version: '1.0.0', user_agent: 'AGI Desktop' },
      }),
    );

    expect(rateLimitKeys()).toEqual(['feedback', 'mobile-feedback']);
  });

  it('stores nothing when a report is over the report ceiling', async () => {
    vi.mocked(withRateLimit)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(new Response(null, { status: 429 }) as never);

    const response = await POST(
      request({
        subject: 'Desktop report',
        message: 'Something happened.',
        metadata: { platform: 'macos', version: '1.0.0', user_agent: 'AGI Desktop' },
        screenshot: { data_url: `data:image/png;base64,${Buffer.from('png').toString('base64')}` },
      }),
    );

    expect(response.status).toBe(429);
    expect(feedbackRouteMocks.putPrivateObject).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });
});

// A rating that cannot be traced back to an answer is a number nobody can act
// on. Both fields are required or the vote is refused, not silently stored.
describe('response ratings', () => {
  it('refuses a rating with no message to attribute it to', async () => {
    const res = await POST(
      request({
        subject: 'Response rated up',
        message: 'answer text',
        metadata: {
          platform: 'web',
          version: 'web',
          user_agent: 'test',
          feedback_context: 'response_rating',
          rating: 'up',
        },
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('refuses a rating that does not say which way it went', async () => {
    const res = await POST(
      request({
        subject: 'Response rated',
        message: 'answer text',
        metadata: {
          platform: 'web',
          version: 'web',
          user_agent: 'test',
          feedback_context: 'response_rating',
          message_id: 'msg-1',
        },
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects a verdict that is neither up nor down', async () => {
    const res = await POST(
      request({
        subject: 'Response rated sideways',
        message: 'answer text',
        metadata: {
          platform: 'web',
          version: 'web',
          user_agent: 'test',
          feedback_context: 'response_rating',
          rating: 'sideways',
          message_id: 'msg-1',
        },
      }),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ChatGPT Work reports are filed against the task, not the message. A report
// that cannot name its run is untriageable, and the run id is what makes the
// existing endpoint carry a task signal without a second table.
describe('task feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedbackRouteMocks.optionalUser.mockResolvedValue({ userId: 'user-web' });
    feedbackRouteMocks.query.mockResolvedValue([]);
  });

  it('stores the run the report is about', async () => {
    const response = await POST(
      request({
        subject: 'AGI Work task · Web chat',
        message: 'It skipped the second source.',
        metadata: {
          source: 'web',
          platform: 'web',
          version: 'web',
          user_agent: 'test',
          feedback_context: 'task_feedback',
          run_id: 'run-42',
          conversation_id: 'conversation-7',
        },
      }),
    );

    expect(response.status).toBe(200);
    const [, , , storedMetadata] = feedbackRouteMocks.query.mock.calls[0]?.[1] as [
      string | null,
      string,
      string,
      string,
    ];
    expect(storedMetadata).toContain('"feedback_context":"task_feedback"');
    expect(storedMetadata).toContain('"run_id":"run-42"');
  });

  it('refuses a task report with no run to attribute it to', async () => {
    const response = await POST(
      request({
        subject: 'AGI Work task · Web chat',
        message: 'It skipped the second source.',
        metadata: {
          platform: 'web',
          version: 'web',
          user_agent: 'test',
          feedback_context: 'task_feedback',
        },
      }),
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('keeps the verdict a rating carried, instead of dropping it on the way in', async () => {
    const rows = feedbackTable();

    const response = await POST(
      request({
        subject: 'Response rated down',
        message: 'answer text',
        metadata: {
          platform: 'web',
          version: 'web',
          user_agent: 'test',
          feedback_context: 'response_rating',
          rating: 'down',
          message_id: 'msg-1',
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(rows[0]?.metadata).toMatchObject({ rating: 'down' });
  });
});

function rating(metadata: Record<string, unknown>, fields: Record<string, unknown> = {}) {
  return request({
    subject: 'Response rated down',
    message: 'An answer in web chat. The answer text is not attached.',
    metadata: {
      source: 'web',
      platform: 'web',
      version: 'web',
      user_agent: 'test',
      feedback_context: 'response_rating',
      rating: 'down',
      message_id: 'msg-1',
      conversation_id: 'conversation-7',
      ...metadata,
    },
    ...fields,
  });
}

describe('thumbs-down details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    feedbackRouteMocks.optionalUser.mockResolvedValue({ userId: 'user-web' });
  });

  it('keeps one rating per answer for the caller, however many pages sent one', async () => {
    const rows = feedbackTable([
      storedRating('user-web', 'msg-1', 'up'),
      storedRating('user-web', 'msg-1', 'up'),
      storedRating('user-web', 'msg-2', 'down'),
      storedRating('user-other', 'msg-1', 'down'),
    ]);

    await POST(rating({ reason: 'inaccurate', comment: 'The year it gave is wrong.' }));
    await POST(rating({ rating: 'up' }));

    const mine = rows.filter(
      (row) => row.user_id === 'user-web' && row.metadata['message_id'] === 'msg-1',
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]?.metadata).toMatchObject({ rating: 'up', message_id: 'msg-1' });
    expect(mine[0]?.metadata).not.toHaveProperty('reason');
    expect(JSON.stringify(rows)).not.toContain('The year it gave is wrong.');
    expect(rows).toContainEqual(storedRating('user-web', 'msg-2', 'down'));
    expect(rows).toContainEqual(storedRating('user-other', 'msg-1', 'down'));
  });

  it('replaces the rating under a lock on the answer, on a connection scoped to the caller', async () => {
    feedbackTable();

    const response = await POST(rating({ reason: 'incomplete' }));

    expect(response.status).toBe(200);
    expect(feedbackRouteMocks.claimScope).toHaveBeenCalledWith(feedbackRouteMocks.ownerDb, {
      userId: 'user-web',
      organizationId: null,
    });
    expect(feedbackRouteMocks.scopedDb.transaction).toHaveBeenCalledTimes(1);
    expect(feedbackRouteMocks.ownerDb.transaction).not.toHaveBeenCalled();
    const statements = feedbackRouteMocks.execute.mock.calls as [string, unknown[]][];
    expect(statements.map(([sql]) => sql.trim().split(/\s+/)[0])).toEqual([
      'select',
      'delete',
      'insert',
    ]);
    expect(statements[0]?.[0]).toContain('pg_advisory_xact_lock');
    expect(String(statements[0]?.[1][0])).toContain('user-web');
    expect(String(statements[0]?.[1][0])).toContain('msg-1');
  });

  it('refuses a signed-out rating, and writes nothing', async () => {
    feedbackRouteMocks.optionalUser.mockResolvedValue(null);
    feedbackTable();

    const response = await POST(rating({}));

    expect(response.status).toBe(401);
    expect(feedbackRouteMocks.claimScope).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.execute).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });

  it('counts a rating against the feedback ceiling only', async () => {
    feedbackTable();

    await POST(rating({ reason: 'incomplete' }));

    expect(rateLimitKeys()).toEqual(['feedback']);
  });

  it('completes the rating with the reason and the comment', async () => {
    const rows = feedbackTable();

    const response = await POST(
      rating({ reason: 'inaccurate', comment: '  The date it gave is a year off.  ' }),
    );

    expect(response.status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: 'user-web',
      message: 'The date it gave is a year off.',
      metadata: {
        feedback_context: 'response_rating',
        rating: 'down',
        reason: 'inaccurate',
        message_id: 'msg-1',
      },
    });
  });

  it('stores its own note for a web rating without a comment, never the text the page sent', async () => {
    const rows = feedbackTable();

    const response = await POST(rating({}, { message: 'Paris is the capital of France.' }));

    expect(response.status).toBe(200);
    expect(rows[0]?.message).toBe(WEB_RESPONSE_RATING_MESSAGE);
    expect(JSON.stringify(rows)).not.toContain('Paris is the capital of France.');
  });

  it('redacts a secret pasted into the comment before it is stored', async () => {
    const apiKey = `sk-${'A'.repeat(40)}`;
    const rows = feedbackTable();

    await POST(rating({ comment: `It echoed my key ${apiKey}` }));

    expect(rows[0]?.message).not.toContain(apiKey);
    expect(rows[0]?.message).toContain('[redacted:api-key]');
  });

  it('keeps the comment out of the log when the write fails', async () => {
    feedbackRouteMocks.execute.mockRejectedValue(new Error('connection reset'));

    const response = await POST(rating({ comment: 'My phone number is 555 0100' }));

    expect(response.status).toBe(500);
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('555 0100');
  });

  it('refuses a reason on a thumbs-up', async () => {
    const response = await POST(rating({ rating: 'up', reason: 'inaccurate' }));

    expect(response.status).toBe(400);
    expect(feedbackRouteMocks.execute).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });

  it('refuses a reason it does not offer', async () => {
    const response = await POST(rating({ reason: 'too_polite' }));

    expect(response.status).toBe(400);
  });

  it('refuses a comment over the limit', async () => {
    const response = await POST(
      rating({ comment: 'x'.repeat(RESPONSE_RATING_COMMENT_MAX_CHARS + 1) }),
    );

    expect(response.status).toBe(400);
  });

  it('refuses rating details on feedback that is not a rating', async () => {
    const response = await POST(
      request({
        subject: 'General feedback · Web chat',
        message: 'Nice work.',
        metadata: {
          source: 'web',
          platform: 'web',
          version: 'web',
          user_agent: 'test',
          reason: 'other',
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('refuses a rating that carries a screenshot, and stores nothing', async () => {
    feedbackTable();

    const response = await POST(
      rating(
        {},
        {
          screenshot: {
            data_url: `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
          },
        },
      ),
    );

    expect(response.status).toBe(400);
    expect(feedbackRouteMocks.putPrivateObject).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.execute).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });

  it('refuses a rating that carries logs, and stores nothing', async () => {
    feedbackTable();

    const response = await POST(rating({}, { logs: 'ERROR the answer was wrong' }));

    expect(response.status).toBe(400);
    expect(feedbackRouteMocks.execute).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });

  it('refuses a rating whose message is longer than a rating line', async () => {
    feedbackTable();

    const response = await POST(
      rating({}, { message: 'x'.repeat(RESPONSE_RATING_MESSAGE_MAX_CHARS + 1) }),
    );

    expect(response.status).toBe(400);
    expect(feedbackRouteMocks.execute).not.toHaveBeenCalled();
    expect(feedbackRouteMocks.query).not.toHaveBeenCalled();
  });
});

describe('removing a rating', () => {
  function removal(messageId?: string) {
    const url = new URL('http://localhost:3000/api/feedback');
    if (messageId !== undefined) url.searchParams.set('message_id', messageId);
    return new Request(url, { method: 'DELETE' }) as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    feedbackRouteMocks.optionalUser.mockResolvedValue({ userId: 'user-web' });
  });

  it("deletes the caller's rating, reason and comment for that answer, and nothing else", async () => {
    const report: StoredFeedback = {
      user_id: 'user-web',
      subject: 'Something is broken · Web chat',
      message: 'The artifact did not refresh.',
      metadata: { source: 'web', message_id: 'msg-1' },
    };
    const rows = feedbackTable([
      {
        ...storedRating('user-web', 'msg-1', 'down', { reason: 'inaccurate' }),
        message: 'My phone number is 555 0100',
      },
      storedRating('user-web', 'msg-2', 'up'),
      storedRating('user-other', 'msg-1', 'up'),
      report,
    ]);

    const response = await DELETE(removal('msg-1'));

    expect(response.status).toBe(200);
    expect(rows).toEqual([
      storedRating('user-web', 'msg-2', 'up'),
      storedRating('user-other', 'msg-1', 'up'),
      report,
    ]);
    expect(feedbackRouteMocks.claimScope).toHaveBeenCalledWith(feedbackRouteMocks.ownerDb, {
      userId: 'user-web',
      organizationId: null,
    });
    expect(feedbackRouteMocks.scopedDb.transaction).toHaveBeenCalledTimes(1);
    expect(String(feedbackRouteMocks.execute.mock.calls[0]?.[0])).toContain(
      'pg_advisory_xact_lock',
    );
  });

  it('answers the same when there was no rating to remove', async () => {
    const rows = feedbackTable([storedRating('user-other', 'msg-1', 'up')]);

    const response = await DELETE(removal('msg-1'));

    expect(response.status).toBe(200);
    expect(rows).toEqual([storedRating('user-other', 'msg-1', 'up')]);
  });

  it('checks the feedback ceiling before it removes anything', async () => {
    vi.mocked(withRateLimit).mockResolvedValueOnce(new Response(null, { status: 429 }) as never);
    const rows = feedbackTable([storedRating('user-web', 'msg-1', 'up')]);

    const response = await DELETE(removal('msg-1'));

    expect(response.status).toBe(429);
    expect(rateLimitKeys()).toEqual(['feedback']);
    expect(rows).toHaveLength(1);
  });

  it('refuses a signed-out caller', async () => {
    feedbackRouteMocks.optionalUser.mockResolvedValue(null);
    feedbackTable();

    const response = await DELETE(removal('msg-1'));

    expect(response.status).toBe(401);
    expect(feedbackRouteMocks.execute).not.toHaveBeenCalled();
  });

  it('refuses a removal that does not name the answer', async () => {
    feedbackTable();

    const response = await DELETE(removal());

    expect(response.status).toBe(400);
    expect(feedbackRouteMocks.execute).not.toHaveBeenCalled();
  });

  it('says so when the rating could not be removed', async () => {
    feedbackRouteMocks.execute.mockRejectedValue(new Error('connection reset'));

    const response = await DELETE(removal('msg-1'));

    expect(response.status).toBe(500);
  });
});
