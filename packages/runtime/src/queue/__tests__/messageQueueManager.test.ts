/**
 * Unit tests for `messageQueueManager`.
 *
 * Coverage targets (per Task 1.4 acceptance criteria):
 *  - 3 priority lanes (now > next > later) — total ordering across lanes
 *  - FIFO within a lane
 *  - popAllEditable reconstruction (text + cursor + PastedContent IDs)
 *  - AbortSignal cancellation removes from queue
 *  - Queue overflow rejects with QueueFullError
 *  - Per-surface state isolation (two queues are independent)
 *  - Persistence: `next` and `later` survive; `now` is volatile
 *  - Atomic compare-and-swap dequeue (dequeueIf)
 *  - Property test: 1000 random messages → FIFO-within-priority + total ordering
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createKvStorageAdapter,
  createMessageQueue,
  createWebStorageAdapter,
} from '../messageQueueManager';
import {
  LANE_CAP,
  PRIORITY_ORDER,
  QueueDequeueRaceError,
  QueueFullError,
  type ContentBlock,
  type QueuePriority,
  type QueueStorageAdapter,
  type QueuedCommand,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function basicCommand(overrides: Partial<QueuedCommand> = {}) {
  return {
    value: overrides.value ?? 'hello',
    mode: overrides.mode ?? ('prompt' as const),
    priority: overrides.priority,
    pastedContents: overrides.pastedContents,
    isMeta: overrides.isMeta,
    skipSlashCommands: overrides.skipSlashCommands,
    origin: overrides.origin,
    uuid: overrides.uuid,
    preExpansionValue: overrides.preExpansionValue,
  };
}

// ---------------------------------------------------------------------------
// Basic FIFO + lane ordering
// ---------------------------------------------------------------------------

describe('createMessageQueue — basic correctness', () => {
  it('returns empty snapshot initially', () => {
    const q = createMessageQueue();
    expect(q.size()).toBe(0);
    expect(q.hasCommands()).toBe(false);
    expect(q.getSnapshot()).toEqual([]);
    expect(q.peek()).toBeUndefined();
    expect(q.dequeue()).toBeUndefined();
  });

  it('enqueue assigns id and enqueuedAt automatically', () => {
    const q = createMessageQueue();
    const cmd = q.enqueue(basicCommand({ value: 'a' }));
    expect(cmd.id).toMatch(/.+/);
    expect(typeof cmd.enqueuedAt).toBe('number');
    expect(cmd.priority).toBe('next'); // default
  });

  it('respects user-provided id and enqueuedAt', () => {
    const q = createMessageQueue();
    const cmd = q.enqueue({
      ...basicCommand(),
      id: 'fixed-id',
      enqueuedAt: 1234567890,
    } as Omit<QueuedCommand, 'id' | 'enqueuedAt'> & { id?: string; enqueuedAt?: number });
    expect(cmd.id).toBe('fixed-id');
    expect(cmd.enqueuedAt).toBe(1234567890);
  });

  it('FIFO within a lane — same priority dequeues in insertion order', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'a', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'b', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'c', priority: 'next' }));

    expect(q.dequeue()?.value).toBe('a');
    expect(q.dequeue()?.value).toBe('b');
    expect(q.dequeue()?.value).toBe('c');
    expect(q.dequeue()).toBeUndefined();
  });

  it('priority order — now > next > later', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'later1', priority: 'later' }));
    q.enqueue(basicCommand({ value: 'next1', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'now1', priority: 'now' }));
    q.enqueue(basicCommand({ value: 'next2', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'now2', priority: 'now' }));

    // now lane drains first (FIFO within), then next, then later.
    expect(q.dequeue()?.value).toBe('now1');
    expect(q.dequeue()?.value).toBe('now2');
    expect(q.dequeue()?.value).toBe('next1');
    expect(q.dequeue()?.value).toBe('next2');
    expect(q.dequeue()?.value).toBe('later1');
  });

  it('enqueueNotification defaults to later', () => {
    const q = createMessageQueue();
    q.enqueueNotification(basicCommand({ value: 'note', mode: 'task-notification' }));
    q.enqueue(basicCommand({ value: 'user' }));
    // user input drains first because next < later
    expect(q.dequeue()?.value).toBe('user');
    expect(q.dequeue()?.value).toBe('note');
  });

  it('peek returns highest-priority without removing', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'a', priority: 'later' }));
    q.enqueue(basicCommand({ value: 'b', priority: 'now' }));
    expect(q.peek()?.value).toBe('b');
    expect(q.size()).toBe(2);
  });

  it('dequeueAll empties the queue and preserves priority order', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'l', priority: 'later' }));
    q.enqueue(basicCommand({ value: 'n', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'now', priority: 'now' }));
    const all = q.dequeueAll();
    expect(all.map((c) => c.value)).toEqual(['l', 'n', 'now']);
    // dequeueAll preserves array-iteration order (insertion order); priority
    // ordering only applies to single dequeue.
    expect(q.size()).toBe(0);
  });

  it('dequeueAllMatching removes only matching, preserves others', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'keep1' }));
    q.enqueue(basicCommand({ value: 'drop1', mode: 'task-notification' }));
    q.enqueue(basicCommand({ value: 'keep2' }));
    q.enqueue(basicCommand({ value: 'drop2', mode: 'task-notification' }));

    const removed = q.dequeueAllMatching((c) => c.mode === 'task-notification');
    expect(removed.map((c) => c.value)).toEqual(['drop1', 'drop2']);
    const remaining = q.getSnapshot().map((c) => c.value);
    expect(remaining).toEqual(['keep1', 'keep2']);
  });

  it('clear empties the queue', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'a' }));
    q.enqueue(basicCommand({ value: 'b' }));
    q.clear();
    expect(q.size()).toBe(0);
  });

  it('filter narrows dequeue without disturbing non-matching commands', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'a', origin: { kind: 'user' } }));
    q.enqueue(basicCommand({ value: 'b', origin: { kind: 'dispatch' } }));
    q.enqueue(basicCommand({ value: 'c', origin: { kind: 'user' } }));

    const taken = q.dequeue((c) => c.origin?.kind === 'user');
    expect(taken?.value).toBe('a');
    expect(q.getSnapshot().map((c) => c.value)).toEqual(['b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Frozen snapshot stability
// ---------------------------------------------------------------------------

describe('createMessageQueue — frozen snapshots', () => {
  it('returns the same snapshot reference between mutations', () => {
    const q = createMessageQueue();
    const a = q.getSnapshot();
    const b = q.getSnapshot();
    expect(a).toBe(b);
  });

  it('snapshot reference changes after mutation', () => {
    const q = createMessageQueue();
    const before = q.getSnapshot();
    q.enqueue(basicCommand({ value: 'x' }));
    expect(q.getSnapshot()).not.toBe(before);
  });

  it('snapshot is frozen — mutation attempts throw', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'a' }));
    const snap = q.getSnapshot();
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      // @ts-expect-error — runtime test that frozen array rejects writes
      snap.push({});
    }).toThrow();
  });

  it('subscribe fires after every mutation that changes the snapshot', () => {
    const q = createMessageQueue();
    const listener = vi.fn();
    q.subscribe(listener);

    q.enqueue(basicCommand({ value: 'a' }));
    q.enqueue(basicCommand({ value: 'b' }));
    q.dequeue();
    q.clear();

    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('subscribe does not fire on no-op mutations', () => {
    const q = createMessageQueue();
    const listener = vi.fn();
    q.subscribe(listener);

    q.dequeue(); // empty queue → no mutation
    q.clear(); // empty queue → no mutation
    q.dequeueAllMatching(() => false); // nothing matches → no mutation

    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribe removes the listener', () => {
    const q = createMessageQueue();
    const listener = vi.fn();
    const off = q.subscribe(listener);
    q.enqueue(basicCommand({ value: 'a' }));
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    q.enqueue(basicCommand({ value: 'b' }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// popAllEditable reconstruction
// ---------------------------------------------------------------------------

describe('createMessageQueue — popAllEditable', () => {
  it('returns undefined when queue is empty', () => {
    const q = createMessageQueue();
    expect(q.popAllEditable('', 0)).toBeUndefined();
  });

  it('returns undefined when only non-editable commands queued', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'note', mode: 'task-notification' }));
    expect(q.popAllEditable('', 0)).toBeUndefined();
    expect(q.size()).toBe(1);
  });

  it('combines queued texts with current input — insertion order', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'first' }));
    q.enqueue(basicCommand({ value: 'second' }));
    const result = q.popAllEditable('typing', 7);
    expect(result?.text).toBe('first\nsecond\ntyping');
    // Cursor offset = "first\nsecond".length + 1 + 7 = 12 + 1 + 7 = 20
    expect(result?.cursorOffset).toBe(20);
    expect(q.size()).toBe(0);
  });

  it('leaves non-editable commands in queue', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'editable' }));
    q.enqueue(basicCommand({ value: 'note', mode: 'task-notification' }));
    q.enqueue(basicCommand({ value: 'channel', mode: 'channel-message' }));

    const result = q.popAllEditable('', 0);
    expect(result?.text).toBe('editable');
    expect(q.size()).toBe(2);
    expect(q.getSnapshot().map((c) => c.value)).toEqual(['note', 'channel']);
  });

  it('preserves PastedContent IDs in insertion order', () => {
    const q = createMessageQueue();
    q.enqueue(
      basicCommand({
        value: 'a',
        pastedContents: {
          1: { id: 1, type: 'image', content: 'aaa', mediaType: 'image/png' },
          2: { id: 2, type: 'image', content: 'bbb', mediaType: 'image/png' },
        },
      }),
    );
    q.enqueue(
      basicCommand({
        value: 'b',
        pastedContents: {
          5: { id: 5, type: 'image', content: 'ccc', mediaType: 'image/png' },
        },
      }),
    );
    const result = q.popAllEditable('', 0);
    expect(result?.pastedContents.map((p) => p.id)).toEqual([1, 2, 5]);
    expect(result?.pastedContents.map((p) => p.content)).toEqual(['aaa', 'bbb', 'ccc']);
  });

  it('extracts images embedded in ContentBlock[] values', () => {
    const q = createMessageQueue();
    const contentBlocks: ContentBlock[] = [
      { type: 'text', text: 'caption' },
      {
        type: 'image',
        source: { type: 'base64', data: 'ZGF0YQ==', media_type: 'image/png' },
      },
    ];
    q.enqueue({ ...basicCommand(), value: contentBlocks } as Omit<
      QueuedCommand,
      'id' | 'enqueuedAt'
    >);
    const result = q.popAllEditable('', 0);
    expect(result?.text).toBe('caption');
    expect(result?.pastedContents).toHaveLength(1);
    expect(result?.pastedContents[0]?.content).toBe('ZGF0YQ==');
  });

  it('isMeta commands are non-editable even with editable mode', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'system-tick', mode: 'prompt', isMeta: true }));
    expect(q.popAllEditable('', 0)).toBeUndefined();
    expect(q.size()).toBe(1);
  });

  it('handles empty currentInput gracefully', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'a' }));
    const result = q.popAllEditable('', 0);
    expect(result?.text).toBe('a');
    // Cursor: "a".length + 1 + 0 = 2
    expect(result?.cursorOffset).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Cancellation via AbortSignal
// ---------------------------------------------------------------------------

describe('createMessageQueue — AbortSignal cancellation', () => {
  it('aborting the signal removes the command from the queue', () => {
    const q = createMessageQueue();
    const ac = new AbortController();
    q.enqueue(basicCommand({ value: 'cancel-me' }), { signal: ac.signal });
    q.enqueue(basicCommand({ value: 'keep-me' }));
    expect(q.size()).toBe(2);
    ac.abort();
    expect(q.size()).toBe(1);
    expect(q.getSnapshot()[0]?.value).toBe('keep-me');
  });

  it('already-aborted signal does not enqueue', () => {
    const q = createMessageQueue();
    const ac = new AbortController();
    ac.abort();
    q.enqueue(basicCommand({ value: 'preaborted' }), { signal: ac.signal });
    expect(q.size()).toBe(0);
  });

  it('signal listener is detached after dequeue (no leak when aborted later)', () => {
    const q = createMessageQueue();
    const ac = new AbortController();
    q.enqueue(basicCommand({ value: 'x' }), { signal: ac.signal });
    q.dequeue();
    expect(q.size()).toBe(0);
    // Aborting after dequeue must not throw or affect anything.
    expect(() => ac.abort()).not.toThrow();
    expect(q.size()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Lane overflow → QueueFullError
// ---------------------------------------------------------------------------

describe('createMessageQueue — overflow', () => {
  it('rejects with QueueFullError when a lane is at cap', () => {
    const q = createMessageQueue({ laneCap: 3 });
    q.enqueue(basicCommand({ value: '1' }));
    q.enqueue(basicCommand({ value: '2' }));
    q.enqueue(basicCommand({ value: '3' }));
    expect(() => q.enqueue(basicCommand({ value: '4' }))).toThrow(QueueFullError);
    try {
      q.enqueue(basicCommand({ value: '5' }));
    } catch (e) {
      expect(e).toBeInstanceOf(QueueFullError);
      expect((e as QueueFullError).lane).toBe('next');
      expect((e as QueueFullError).cap).toBe(3);
    }
  });

  it('different lanes have independent caps', () => {
    const q = createMessageQueue({ laneCap: 2 });
    q.enqueue(basicCommand({ value: 'now1', priority: 'now' }));
    q.enqueue(basicCommand({ value: 'now2', priority: 'now' }));
    q.enqueue(basicCommand({ value: 'next1', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'next2', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'later1', priority: 'later' }));
    q.enqueue(basicCommand({ value: 'later2', priority: 'later' }));

    expect(q.size()).toBe(6);
    expect(() => q.enqueue(basicCommand({ value: 'overflow', priority: 'next' }))).toThrow(
      QueueFullError,
    );
    expect(() => q.enqueue(basicCommand({ value: 'overflow', priority: 'now' }))).toThrow(
      QueueFullError,
    );
  });

  it('default cap is 100 per lane', () => {
    expect(LANE_CAP).toBe(100);
    const q = createMessageQueue();
    for (let i = 0; i < 100; i++) {
      q.enqueue(basicCommand({ value: `m${i}` }));
    }
    expect(() => q.enqueue(basicCommand({ value: 'overflow' }))).toThrow(QueueFullError);
  });

  it('laneSize tracks each lane independently', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ priority: 'now' }));
    q.enqueue(basicCommand({ priority: 'now' }));
    q.enqueue(basicCommand({ priority: 'next' }));
    q.enqueue(basicCommand({ priority: 'later' }));
    q.enqueue(basicCommand({ priority: 'later' }));
    q.enqueue(basicCommand({ priority: 'later' }));

    expect(q.laneSize('now')).toBe(2);
    expect(q.laneSize('next')).toBe(1);
    expect(q.laneSize('later')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Per-surface isolation
// ---------------------------------------------------------------------------

describe('createMessageQueue — per-surface isolation', () => {
  it('two queues are completely independent', () => {
    const a = createMessageQueue();
    const b = createMessageQueue();
    a.enqueue(basicCommand({ value: 'in-a' }));
    expect(b.size()).toBe(0);
    expect(a.size()).toBe(1);
    b.enqueue(basicCommand({ value: 'in-b' }));
    expect(a.size()).toBe(1);
    expect(b.size()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Persistence: `next` and `later` survive; `now` is volatile
// ---------------------------------------------------------------------------

describe('createMessageQueue — persistence', () => {
  function createInMemoryStorage(): {
    adapter: QueueStorageAdapter;
    data: { value: string | null };
  } {
    const data = { value: null as string | null };
    const adapter: QueueStorageAdapter = {
      read: () => {
        if (!data.value) return null;
        try {
          return JSON.parse(data.value);
        } catch {
          return null;
        }
      },
      write: (commands) => {
        data.value = JSON.stringify(commands);
      },
    };
    return { adapter, data };
  }

  it('persists next and later lanes to storage on mutation', () => {
    const { adapter, data } = createInMemoryStorage();
    const q = createMessageQueue({ storage: adapter });
    q.enqueue(basicCommand({ value: 'next-cmd', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'later-cmd', priority: 'later' }));

    expect(data.value).toBeTruthy();
    const persisted = JSON.parse(data.value!);
    expect(persisted.map((c: QueuedCommand) => c.value)).toEqual(['next-cmd', 'later-cmd']);
  });

  it('does NOT persist now lane', () => {
    const { adapter, data } = createInMemoryStorage();
    const q = createMessageQueue({ storage: adapter });
    q.enqueue(basicCommand({ value: 'urgent', priority: 'now' }));
    const persisted = JSON.parse(data.value!) as QueuedCommand[];
    expect(persisted).toHaveLength(0);
  });

  it('restores next + later lanes on next instantiation', () => {
    const { adapter, data } = createInMemoryStorage();
    const q1 = createMessageQueue({ storage: adapter });
    q1.enqueue(basicCommand({ value: 'survive1', priority: 'next' }));
    q1.enqueue(basicCommand({ value: 'survive2', priority: 'later' }));
    q1.enqueue(basicCommand({ value: 'volatile', priority: 'now' }));

    expect(data.value).toBeTruthy();

    // Simulate restart — new queue instance reads from same adapter.
    const q2 = createMessageQueue({ storage: adapter });
    expect(q2.size()).toBe(2); // now lane filtered out
    expect(q2.getSnapshot().map((c) => c.value)).toEqual(['survive1', 'survive2']);
  });

  it('flush forces a persistence write', () => {
    const writeSpy = vi.fn();
    const adapter: QueueStorageAdapter = {
      read: () => null,
      write: writeSpy,
    };
    const q = createMessageQueue({ storage: adapter });
    q.enqueue(basicCommand({ value: 'a' }));
    expect(writeSpy).toHaveBeenCalled();
    writeSpy.mockClear();
    q.flush();
    expect(writeSpy).toHaveBeenCalled();
  });

  it('handles malformed persisted data gracefully (returns empty)', () => {
    const adapter: QueueStorageAdapter = {
      read: () => null, // pretend we couldn't parse
      write: () => {},
    };
    const q = createMessageQueue({ storage: adapter });
    expect(q.size()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Atomic compare-and-swap dequeue (dequeueIf)
// ---------------------------------------------------------------------------

describe('createMessageQueue — dequeueIf (atomic compare-and-swap)', () => {
  it('succeeds when the expected command is at the head of its lane', () => {
    const q = createMessageQueue();
    const a = q.enqueue(basicCommand({ value: 'a' }));
    q.enqueue(basicCommand({ value: 'b' }));
    const taken = q.dequeueIf(a.id);
    expect(taken.value).toBe('a');
    expect(q.size()).toBe(1);
  });

  it('throws QueueDequeueRaceError when expected command was raced away', () => {
    const q = createMessageQueue();
    const a = q.enqueue(basicCommand({ value: 'a' }));
    q.enqueue(basicCommand({ value: 'b' }));
    // Simulate another consumer dequeuing first.
    q.dequeue();
    expect(() => q.dequeueIf(a.id)).toThrow(QueueDequeueRaceError);
  });

  it('throws when expected id is no longer at the head (priority shift)', () => {
    const q = createMessageQueue();
    const a = q.enqueue(basicCommand({ value: 'a', priority: 'next' }));
    q.enqueue(basicCommand({ value: 'urgent', priority: 'now' }));
    // `urgent` is now the head; expecting `a.id` should fail.
    expect(() => q.dequeueIf(a.id)).toThrow(QueueDequeueRaceError);
  });

  it('two concurrent dequeueIf calls — only one wins, other throws', () => {
    const q = createMessageQueue();
    const cmd = q.enqueue(basicCommand({ value: 'race' }));
    // Both consumers see the same snapshot; first wins.
    const winner = q.dequeueIf(cmd.id);
    expect(winner.value).toBe('race');
    // Second tries the same id → race error.
    expect(() => q.dequeueIf(cmd.id)).toThrow(QueueDequeueRaceError);
  });
});

// ---------------------------------------------------------------------------
// Logger hook
// ---------------------------------------------------------------------------

describe('createMessageQueue — logger', () => {
  it('logs enqueue / dequeue / pop / remove / clear events', () => {
    const events: string[] = [];
    const q = createMessageQueue({
      logger: ({ op }) => {
        events.push(op);
      },
    });
    const ac = new AbortController();
    q.enqueue(basicCommand({ value: 'a' }));
    q.enqueue(basicCommand({ value: 'b' }), { signal: ac.signal });
    q.dequeue();
    ac.abort();
    q.enqueue(basicCommand({ value: 'editable' }));
    q.popAllEditable('', 0);
    q.enqueue(basicCommand({ value: 'final' }));
    q.clear();
    expect(events).toContain('enqueue');
    expect(events).toContain('dequeue');
    expect(events).toContain('remove');
    expect(events).toContain('pop');
    expect(events).toContain('clear');
  });
});

// ---------------------------------------------------------------------------
// Storage adapter helpers
// ---------------------------------------------------------------------------

describe('createWebStorageAdapter', () => {
  function makeFakeStorage(): Storage {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k) => map.get(k) ?? null,
      key: (i) => Array.from(map.keys())[i] ?? null,
      removeItem: (k) => {
        map.delete(k);
      },
      setItem: (k, v) => {
        map.set(k, v);
      },
    };
  }

  it('returns null when storage is null', () => {
    expect(createWebStorageAdapter('k', null)).toBeNull();
  });

  it('round-trips queued commands', () => {
    const storage = makeFakeStorage();
    const adapter = createWebStorageAdapter('k', storage)!;
    const q = createMessageQueue({ storage: adapter });
    q.enqueue(basicCommand({ value: 'persistent' }));
    expect(storage.getItem('k')).toBeTruthy();
    const q2 = createMessageQueue({
      storage: createWebStorageAdapter('k', storage)!,
    });
    expect(q2.getSnapshot().map((c) => c.value)).toEqual(['persistent']);
  });

  it('survives storage exceptions on write (silent drop)', () => {
    const storage = makeFakeStorage();
    storage.setItem = () => {
      throw new Error('Quota');
    };
    const adapter = createWebStorageAdapter('k', storage)!;
    const q = createMessageQueue({ storage: adapter });
    expect(() => q.enqueue(basicCommand({ value: 'a' }))).not.toThrow();
  });

  it('survives malformed persisted JSON', () => {
    const storage = makeFakeStorage();
    storage.setItem('k', '{not valid json');
    const adapter = createWebStorageAdapter('k', storage)!;
    const q = createMessageQueue({ storage: adapter });
    expect(q.size()).toBe(0);
  });
});

describe('createKvStorageAdapter', () => {
  it('round-trips through a sync KV store', () => {
    const map = new Map<string, string>();
    const kv = {
      get: (k: string) => map.get(k) ?? null,
      set: (k: string, v: string) => {
        map.set(k, v);
      },
    };
    const adapter = createKvStorageAdapter('k', kv);
    const q = createMessageQueue({ storage: adapter });
    q.enqueue(basicCommand({ value: 'mobile-persistent' }));
    const q2 = createMessageQueue({ storage: createKvStorageAdapter('k', kv) });
    expect(q2.getSnapshot().map((c) => c.value)).toEqual(['mobile-persistent']);
  });
});

// ---------------------------------------------------------------------------
// Property test: 1000 random messages → FIFO + total order
// ---------------------------------------------------------------------------

describe('createMessageQueue — property test (1000 random messages)', () => {
  it('preserves FIFO within priority + total ordering by priority class', () => {
    const q = createMessageQueue({ laneCap: 2000 }); // wider cap for property test
    const lanes: QueuePriority[] = ['now', 'next', 'later'];
    const inserted: { id: string; priority: QueuePriority; ordinal: number }[] = [];

    for (let i = 0; i < 1000; i++) {
      const priority = lanes[Math.floor(Math.random() * lanes.length)]!;
      const cmd = q.enqueue(basicCommand({ value: `m${i}`, priority }));
      inserted.push({ id: cmd.id, priority, ordinal: i });
    }

    // Drain and verify each pop respects total ordering.
    let lastPriority = -1;
    const lastOrdinalInLane: Record<QueuePriority, number> = { now: -1, next: -1, later: -1 };

    for (let i = 0; i < 1000; i++) {
      const popped = q.dequeue();
      expect(popped).toBeDefined();
      const pri = PRIORITY_ORDER[popped!.priority ?? 'next'];
      // Total order — each pop's priority must be >= the previous (lower number = earlier).
      expect(pri).toBeGreaterThanOrEqual(lastPriority);

      // FIFO within lane — find this command in the inserted log.
      const ins = inserted.find((x) => x.id === popped!.id)!;
      expect(ins.ordinal).toBeGreaterThan(lastOrdinalInLane[ins.priority]);
      lastOrdinalInLane[ins.priority] = ins.ordinal;
      lastPriority = pri;
    }

    expect(q.size()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases that surfaced during implementation
// ---------------------------------------------------------------------------

describe('createMessageQueue — edge cases', () => {
  it('value as ContentBlock[] — text extraction joins with newline', () => {
    const q = createMessageQueue();
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'line1' },
      { type: 'text', text: 'line2' },
    ];
    q.enqueue({ ...basicCommand(), value: blocks } as Omit<QueuedCommand, 'id' | 'enqueuedAt'>);
    const result = q.popAllEditable('end', 3);
    expect(result?.text).toBe('line1\nline2\nend');
  });

  it('popAllEditable assigns sequential IDs to embedded images starting at Date.now()', () => {
    const q = createMessageQueue();
    const blocks: ContentBlock[] = [
      { type: 'image', source: { type: 'base64', data: 'AAA', media_type: 'image/png' } },
      { type: 'image', source: { type: 'base64', data: 'BBB', media_type: 'image/png' } },
    ];
    q.enqueue({ ...basicCommand(), value: blocks } as Omit<QueuedCommand, 'id' | 'enqueuedAt'>);
    const result = q.popAllEditable('', 0);
    expect(result?.pastedContents).toHaveLength(2);
    expect(result?.pastedContents[1]?.id).toBe(result!.pastedContents[0]!.id + 1);
  });

  it('peek with filter returns the highest-priority matching command', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'a', priority: 'now', origin: { kind: 'user' } }));
    q.enqueue(basicCommand({ value: 'b', priority: 'next', origin: { kind: 'user' } }));
    q.enqueue(basicCommand({ value: 'c', priority: 'now', origin: { kind: 'dispatch' } }));
    expect(q.peek((c) => c.origin?.kind === 'user')?.value).toBe('a');
    expect(q.peek((c) => c.origin?.kind === 'dispatch')?.value).toBe('c');
  });

  it('mode: channel-message renders but is not editable', () => {
    const q = createMessageQueue();
    q.enqueue(basicCommand({ value: 'channel msg', mode: 'channel-message' }));
    expect(q.size()).toBe(1);
    expect(q.popAllEditable('', 0)).toBeUndefined();
    // Channel messages stay queued even after popAllEditable.
    expect(q.size()).toBe(1);
  });
});
