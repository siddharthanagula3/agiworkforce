import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { runMemoryCommand } from '../memory-commands';
import type { ManagedMemoryContextDb } from '../managed-memory-context-service';

const STORED = { id: '0190a000-0000-7000-8000-00000000d001', content: 'User uses Postgres.' };

interface FakeState {
  memoryEnabled: boolean;
  rows: Array<{ id: string; content: string }>;
}

function fakeDb(state: FakeState) {
  const inserts: unknown[][] = [];
  const deletes: unknown[][] = [];
  const db: ManagedMemoryContextDb = {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      if (sql.includes("settings -> 'memory'")) return [{ memory: {} }] as T[];
      if (sql.includes("settings -> 'capabilities'")) {
        return [{ capabilities: { memory: state.memoryEnabled } }] as T[];
      }
      if (sql.includes('insert into user_memories')) {
        inserts.push(params);
        return [{ outcome: 'inserted', id: STORED.id, content: STORED.content }] as T[];
      }
      if (sql.includes('content ilike')) return state.rows as T[];
      if (sql.includes('set is_deleted = true')) {
        deletes.push(params);
        return state.rows as T[];
      }
      return [] as T[];
    },
  };
  return { db, inserts: () => inserts, deletes: () => deletes };
}

const SCOPE = { userId: 'u1', organizationId: null };

describe('an explicit remember obeys the memory switch', () => {
  it('writes nothing and says why when Memory is off in settings', async () => {
    const fake = fakeDb({ memoryEnabled: false, rows: [] });
    const result = await runMemoryCommand(fake.db, SCOPE, {
      message: 'Remember that I use Postgres.',
    });

    expect(result?.kind).toBe('remember');
    expect(result?.outcome).toMatchObject({ status: 'refused', reason: 'memory_disabled' });
    expect(result?.outcome.message).toContain('Memory is turned off in your settings');
    expect(fake.inserts()).toHaveLength(0);
  });

  it('writes the fact when Memory is on', async () => {
    const fake = fakeDb({ memoryEnabled: true, rows: [] });
    const result = await runMemoryCommand(fake.db, SCOPE, {
      message: 'Remember that I use Postgres.',
    });

    expect(result?.outcome.status).toBe('stored');
    expect(fake.inserts()).toHaveLength(1);
  });

  it('writes nothing in a temporary chat even with Memory on', async () => {
    const fake = fakeDb({ memoryEnabled: true, rows: [] });
    const result = await runMemoryCommand(
      fake.db,
      { ...SCOPE, temporaryChat: true },
      { message: 'Remember that I use Postgres.' },
    );

    expect(result?.outcome).toMatchObject({ status: 'refused' });
    expect(result?.outcome.message).toContain('temporary chat');
    expect(fake.inserts()).toHaveLength(0);
  });

  it('refuses a credential whatever the switch says', async () => {
    const fake = fakeDb({ memoryEnabled: true, rows: [] });
    const result = await runMemoryCommand(fake.db, SCOPE, {
      message: `Remember that my password is ${'correct-horse-battery'}.`,
    });

    expect(result?.outcome).toMatchObject({ status: 'refused' });
    expect(result?.outcome.message).toContain('Memory never stores');
    expect(fake.inserts()).toHaveLength(0);
  });
});

describe('an explicit forget keeps working while Memory is off', () => {
  it('reports what it would delete, then deletes it once confirmed', async () => {
    const fake = fakeDb({ memoryEnabled: false, rows: [STORED] });

    const preview = await runMemoryCommand(fake.db, SCOPE, {
      message: 'Forget that I use Postgres.',
    });
    expect(preview?.outcome.status).toBe('confirmation_required');
    expect(fake.deletes()).toHaveLength(0);

    const confirmed = await runMemoryCommand(fake.db, SCOPE, {
      message: 'Forget that I use Postgres.',
      confirmed: true,
    });
    expect(confirmed?.outcome.status).toBe('forgotten');
    expect(fake.deletes()).toHaveLength(1);
  });
});
