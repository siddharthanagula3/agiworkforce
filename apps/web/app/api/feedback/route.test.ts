import { beforeEach, describe, expect, it, vi } from 'vitest';

const feedbackRouteMocks = vi.hoisted(() => ({
  auth: vi.fn(),
  query: vi.fn(),
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
  getNeonDb: vi.fn(() => ({ query: feedbackRouteMocks.query })),
}));

import { POST } from './route';

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
    feedbackRouteMocks.auth.mockResolvedValue({ userId: 'user-web' });
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
    feedbackRouteMocks.auth.mockResolvedValue({ userId: 'user-web' });
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
