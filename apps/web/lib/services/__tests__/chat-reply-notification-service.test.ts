import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), warn: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: mocks.warn },
}));
vi.mock('../push-notification-service', () => ({
  sendPushToUser: (...args: unknown[]) => mocks.send(...args),
}));

import { isPhoneChatReply, notifyChatReplyReady } from '../chat-reply-notification-service';

const RUN = {
  id: '0190a000-0000-7000-8000-000000000001',
  userId: 'user-1',
  conversationId: '0190a000-0000-7000-8000-000000000099',
  originSurface: 'mobile',
  workMode: 'chat',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ sent: 1, invalidated: 0 });
});

describe('which finished runs are a reply on the phone', () => {
  it('is a completed chat turn sent from the phone in a conversation', () => {
    expect(isPhoneChatReply(RUN, 'completed')).toBe(true);
  });

  it.each([
    ['a failed turn', RUN, 'failed'],
    ['a turn sent from the web', { ...RUN, originSurface: 'web' }, 'completed'],
    ['agent work', { ...RUN, workMode: 'agiwork' }, 'completed'],
    ['a turn with no conversation', { ...RUN, conversationId: null }, 'completed'],
  ])('is not %s', (_label, run, event) => {
    expect(isPhoneChatReply(run, event)).toBe(false);
  });
});

describe('notifyChatReplyReady', () => {
  it('sends one phone notice that opens the conversation, through the chat replies switch', async () => {
    await expect(notifyChatReplyReady(RUN)).resolves.toEqual({ pushed: true });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith(
      'user-1',
      {
        title: 'Your reply is ready',
        body: 'Tap to open the chat.',
        data: { type: 'chat_message', conversationId: RUN.conversationId, runId: RUN.id },
      },
      { expo: true, web: false },
    );
  });

  it('reports nothing pushed when no device takes it', async () => {
    mocks.send.mockResolvedValue({ sent: 0, invalidated: 0 });
    await expect(notifyChatReplyReady(RUN)).resolves.toEqual({ pushed: false });
  });

  it('never throws when the push service fails', async () => {
    mocks.send.mockRejectedValue(new Error('expo is down'));
    await expect(notifyChatReplyReady(RUN)).resolves.toEqual({ pushed: false });
    expect(mocks.warn).toHaveBeenCalled();
  });
});
