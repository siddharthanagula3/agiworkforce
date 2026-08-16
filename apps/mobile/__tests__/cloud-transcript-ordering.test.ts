import { compareCloudMessagesByCreatedAtThenId } from '../stores/chat/chatExecutionStore';
import type { ChatMessage } from '@/types/chat';

describe('cloud transcript ordering (mobile determinism)', () => {
  const mk = (id: string, createdAt: string): ChatMessage =>
    ({ id, createdAt }) as unknown as ChatMessage;

  it('orders by createdAt then by id, independent of input order', () => {
    const a = mk('a', '2026-01-01T00:00:00.000Z');
    const b = mk('b', '2026-01-01T00:00:00.000Z');
    const c = mk('c', '2026-01-02T00:00:00.000Z');

    expect([c, b, a].sort(compareCloudMessagesByCreatedAtThenId).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect([b, a, c].sort(compareCloudMessagesByCreatedAtThenId).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
