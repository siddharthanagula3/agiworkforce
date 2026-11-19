import type { ChatMessage } from '@/types/chat';
import { reconcileLoadedCloudMessages } from '../reconcileCloudMessages';

function row(
  id: string,
  role: ChatMessage['role'],
  createdAt: string,
  extra: Partial<ChatMessage> = {},
) {
  return { id, conversationId: 'c1', role, content: id, createdAt, ...extra } as ChatMessage;
}

describe('reconcileLoadedCloudMessages', () => {
  it('keeps a live answer below its question when the reload restamps the question later', () => {
    const localQuestion = row('q2', 'user', '2026-11-11T10:00:00.000Z');
    const liveAnswer = row('a2', 'assistant', '2026-11-11T10:00:00.050Z', { isStreaming: true });
    const earlier = [
      row('q1', 'user', '2026-11-11T09:00:00.000Z'),
      row('a1', 'assistant', '2026-11-11T09:00:05.000Z'),
    ];
    const current = [...earlier, localQuestion, liveAnswer];

    const merged = reconcileLoadedCloudMessages({
      serverMessages: [...earlier, row('q2', 'user', '2026-11-11T10:00:00.900Z')],
      requestStartMessages: current,
      currentMessages: current,
      dirtyMessageIds: new Set(),
    });

    expect(merged.map((message) => message.id)).toEqual(['q1', 'a1', 'q2', 'a2']);
    expect(merged[2]?.createdAt).toBe('2026-11-11T10:00:00.900Z');
  });

  it('still places rows the phone has not shown by their own time', () => {
    const shown = [row('q1', 'user', '2026-11-11T09:00:00.000Z')];
    const merged = reconcileLoadedCloudMessages({
      serverMessages: [
        row('a1', 'assistant', '2026-11-11T09:00:05.000Z'),
        row('q1', 'user', '2026-11-11T09:00:00.000Z'),
        row('q0', 'user', '2026-11-11T08:00:00.000Z'),
      ],
      requestStartMessages: shown,
      currentMessages: shown,
      dirtyMessageIds: new Set(),
    });

    expect(merged.map((message) => message.id)).toEqual(['q0', 'q1', 'a1']);
  });

  it('drops a row removed on the phone during the reload', () => {
    const start = [
      row('q1', 'user', '2026-11-11T09:00:00.000Z'),
      row('q2', 'user', '2026-11-11T09:01:00.000Z'),
    ];
    const merged = reconcileLoadedCloudMessages({
      serverMessages: start,
      requestStartMessages: start,
      currentMessages: [start[0]!],
      dirtyMessageIds: new Set(),
    });

    expect(merged.map((message) => message.id)).toEqual(['q1']);
  });
});
