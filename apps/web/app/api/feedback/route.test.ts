import { beforeEach, describe, expect, it, vi } from 'vitest';

const feedbackRouteMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  optionalUser: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));

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
  getNeonDb: vi.fn(() => ({
    query: feedbackRouteMocks.query,
    execute: feedbackRouteMocks.execute,
  })),
}));

import { POST } from './route';
import { logger } from '@/lib/logger';
import { RESPONSE_RATING_COMMENT_MAX_CHARS } from './response-rating-contract';

function request(body: unknown) {
  return new Request('http://localhost:3000/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
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
    const [, , , storedMetadata] = feedbackRouteMocks.query.mock.calls[0]?.[1] as [
      string | null,
      string,
      string,
      string,
    ];
    expect(storedMetadata).toContain('"rating":"down"');
  });
});

describe('thumbs-down details', () => {
  const FEEDBACK_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  function rating(metadata: Record<string, unknown>) {
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
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    feedbackRouteMocks.optionalUser.mockResolvedValue({ userId: 'user-web' });
    feedbackRouteMocks.query.mockResolvedValue([]);
    feedbackRouteMocks.execute.mockResolvedValue(1);
  });

  it('records a bare rating under the id the client minted, so a changed vote updates it', async () => {
    const response = await POST(rating({ feedback_id: FEEDBACK_ID, rating: 'up' }));

    expect(response.status).toBe(200);
    const [sql, params] = feedbackRouteMocks.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toMatch(/public\.feedback\.user_id = excluded\.user_id/);
    expect(JSON.parse(String(params[3]))).toMatchObject({ rating: 'up', message_id: 'msg-1' });
    expect(params[4]).toBe(FEEDBACK_ID);
  });

  it("answers a conflict when a changed vote names a rating that is not the caller's", async () => {
    feedbackRouteMocks.execute.mockResolvedValue(0);

    const response = await POST(rating({ feedback_id: FEEDBACK_ID }));

    expect(response.status).toBe(409);
  });

  it('completes the same rating with the reason and the comment', async () => {
    const response = await POST(
      rating({
        feedback_id: FEEDBACK_ID,
        reason: 'inaccurate',
        comment: '  The date it gave is a year off.  ',
      }),
    );

    expect(response.status).toBe(200);
    const [sql, params] = feedbackRouteMocks.execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('on conflict (id) do update');
    expect(sql).toMatch(/public\.feedback\.user_id = excluded\.user_id/);
    expect(params[0]).toBe('user-web');
    expect(params[2]).toBe('The date it gave is a year off.');
    expect(JSON.parse(String(params[3]))).toMatchObject({
      feedback_context: 'response_rating',
      rating: 'down',
      reason: 'inaccurate',
      message_id: 'msg-1',
    });
    expect(params[4]).toBe(FEEDBACK_ID);
  });

  it("answers a conflict instead of a silent success when the rating is not the caller's", async () => {
    feedbackRouteMocks.execute.mockResolvedValue(0);

    const response = await POST(rating({ feedback_id: FEEDBACK_ID, reason: 'incomplete' }));

    expect(response.status).toBe(409);
  });

  it('redacts a secret pasted into the comment before it is stored', async () => {
    const apiKey = `sk-${'A'.repeat(40)}`;

    await POST(rating({ feedback_id: FEEDBACK_ID, comment: `It echoed my key ${apiKey}` }));

    const params = feedbackRouteMocks.execute.mock.calls[0]?.[1] as unknown[];
    expect(String(params[2])).not.toContain(apiKey);
    expect(String(params[2])).toContain('[redacted:api-key]');
  });

  it('keeps the comment out of the log when the write fails', async () => {
    feedbackRouteMocks.execute.mockRejectedValue(new Error('connection reset'));

    const response = await POST(
      rating({ feedback_id: FEEDBACK_ID, comment: 'My phone number is 555 0100' }),
    );

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
          feedback_id: FEEDBACK_ID,
        },
      }),
    );

    expect(response.status).toBe(400);
  });
});
