import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  getNeonDb: () => ({ query: mocks.query }),
}));

vi.mock('@/lib/services/bonus-credit-service', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  bonusCreditExpiry: vi.fn(),
  grantBonusCredits: vi.fn(),
}));

import { readRecentFeedback } from './operator-metrics';

function feedbackRow(metadata: Record<string, unknown> | null) {
  return {
    id: 'feedback-1',
    user_id: 'user-1',
    email: 'reporter@example.com',
    subject: 'AGI Work task · Web chat',
    message: 'This used the wrong source.',
    created_at: '2026-11-08T10:00:00.000Z',
    metadata,
  };
}

describe('readRecentFeedback', () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it('projects the run, message and conversation a report named', async () => {
    mocks.query.mockResolvedValueOnce([
      feedbackRow({
        source: 'web',
        platform: 'web',
        version: '1.2.3',
        feedback_context: 'task_feedback',
        run_id: 'run-9',
        message_id: 'message-4',
        conversation_id: 'conversation-2',
        page_path: '/chat/conversation-2',
        user_agent: 'Mozilla/5.0',
        claimed_user_id: 'someone-else',
        logs: 'private log text',
      }),
    ]);

    const [row] = await readRecentFeedback(100);

    expect(row?.context).toEqual({
      source: 'web',
      platform: 'web',
      version: '1.2.3',
      feedback_context: 'task_feedback',
      run_id: 'run-9',
      message_id: 'message-4',
      conversation_id: 'conversation-2',
    });
    expect(row?.pagePath).toBe('/chat/conversation-2');
  });

  it('projects a mobile refusal report that has no page path', async () => {
    mocks.query.mockResolvedValueOnce([
      feedbackRow({
        source: 'mobile',
        feedback_context: 'safety_refusal',
        finish_reason: 'refusal',
        message_id: 'message-8',
        conversation_id: 'conversation-3',
      }),
    ]);

    const [row] = await readRecentFeedback();

    expect(row?.pagePath).toBeNull();
    expect(row?.context).toMatchObject({
      feedback_context: 'safety_refusal',
      finish_reason: 'refusal',
      message_id: 'message-8',
      conversation_id: 'conversation-3',
    });
  });

  it('leaves out context that is missing, empty or not text, and bounds what it keeps', async () => {
    mocks.query.mockResolvedValueOnce([
      feedbackRow({ run_id: '', message_id: 42, conversation_id: 'c'.repeat(500) }),
      feedbackRow(null),
    ]);

    const [bounded, noMetadata] = await readRecentFeedback();

    expect(bounded?.context).toEqual({ conversation_id: 'c'.repeat(200) });
    expect(noMetadata?.context).toEqual({});
  });
});

type ImportedModule1 = typeof import('@/lib/server/neon-db');
type ImportedModule0 = typeof import('@/lib/services/bonus-credit-service');
