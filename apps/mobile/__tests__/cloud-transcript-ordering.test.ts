import { compareCloudMessagesByCreatedAtThenId } from '../stores/chat/chatExecutionStore';
import type { ChatMessage } from '@/types/chat';

// Determinism guard: the cloud-mirror and LLM-history paths must order a
// transcript identically to the cross-device puller (cloudSyncEngine.ts). Equal
// `createdAt` (a free-form ISO string with no uniqueness constraint) must break
// by the stable server `id` so the SAME transcript renders/feeds in ONE order on
// every device, regardless of which path last wrote it. Same class as the
// project_context.rs / send_message_setup.rs tiebreakers fixed this session.
describe('cloud transcript ordering (mobile determinism)', () => {
  const mk = (id: string, createdAt: string): ChatMessage =>
    ({ id, createdAt }) as unknown as ChatMessage;

  it('orders by createdAt then by id, independent of input order', () => {
    const a = mk('a', '2026-01-01T00:00:00.000Z');
    const b = mk('b', '2026-01-01T00:00:00.000Z'); // equal createdAt → tie
    const c = mk('c', '2026-01-02T00:00:00.000Z'); // later timestamp

    expect([c, b, a].sort(compareCloudMessagesByCreatedAtThenId).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    // Input-order independence — the actual determinism property:
    expect([b, a, c].sort(compareCloudMessagesByCreatedAtThenId).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });
});
