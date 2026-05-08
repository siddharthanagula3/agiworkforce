/**
 * Tests for SupabaseStore.set() — Cloud-mode connector permission upsert.
 *
 * The shipping bug (P0-L from cross-surface audit): the upsert payload was
 * missing `user_id`, but the underlying table's UNIQUE constraint is
 * (user_id, connector_id, tool_name). Without user_id in the payload, the
 * second call did not find the existing row by the conflict target and
 * silently inserted a duplicate (or, for callers running through the
 * service-role key, leaked rows under a NULL user). RLS independently
 * required user_id to match auth.uid().
 *
 * Fix: resolve the current user's id via `client.auth.getUser()` inside
 * `set()` and include it in the upsert payload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorPermissionLevel } from '@agiworkforce/types';
import { getConnectorPermissionStore } from '../connectorPermissionStore';

interface UpsertCall {
  values: Record<string, unknown>;
  opts: { onConflict?: string } | undefined;
}

interface MockState {
  upsertCalls: UpsertCall[];
  rows: Map<string, Record<string, unknown>>;
  authUserId: string | null;
  getUserCalls: number;
}

const state: MockState = {
  upsertCalls: [],
  rows: new Map(),
  authUserId: 'user-001',
  getUserCalls: 0,
};

beforeEach(() => {
  state.upsertCalls = [];
  state.rows = new Map();
  state.authUserId = 'user-001';
  state.getUserCalls = 0;

  // Install a stub on globalThis.__agi_supabase__ that the SupabaseStore
  // looks up at runtime. The real client is structurally typed and we
  // only need from(), upsert(), and auth.getUser() to drive the test.
  function rowKey(values: Record<string, unknown>): string {
    return `${String(values['user_id'])}|${String(values['connector_id'])}|${String(values['tool_name'])}`;
  }

  const upsert = vi.fn((values: Record<string, unknown>, opts?: { onConflict?: string }) => {
    state.upsertCalls.push({ values, opts });
    // Simulate the real conflict resolution: when (user_id,connector_id,tool_name)
    // matches an existing row, UPDATE; otherwise INSERT.
    const k = rowKey(values);
    state.rows.set(k, { ...state.rows.get(k), ...values });
    return Promise.resolve({ data: null, error: null });
  });

  const from = vi.fn((_table: string) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
    upsert,
  }));

  const getUser = vi.fn(() => {
    state.getUserCalls += 1;
    if (state.authUserId === null) {
      return Promise.resolve({ data: { user: null }, error: { message: 'no session' } });
    }
    return Promise.resolve({
      data: { user: { id: state.authUserId } },
      error: null,
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__agi_supabase__ = {
    from,
    auth: { getUser },
  };
});

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).__agi_supabase__;
  vi.clearAllMocks();
});

describe('SupabaseStore.set — P0-L user_id in upsert payload', () => {
  it('first set() inserts a new row with user_id resolved from auth.getUser()', async () => {
    const store = getConnectorPermissionStore();
    await store.set('github', 'create_issue', 'needs-approval' as ConnectorPermissionLevel, true);

    expect(state.upsertCalls).toHaveLength(1);
    const call = state.upsertCalls[0]!;
    expect(call.values).toMatchObject({
      user_id: 'user-001',
      connector_id: 'github',
      tool_name: 'create_issue',
      level: 'needs-approval',
      destructive: true,
    });
    expect(call.opts).toEqual({ onConflict: 'user_id,connector_id,tool_name' });
    // We resolved the user id via auth.getUser(), not by hardcoding.
    expect(state.getUserCalls).toBe(1);
  });

  it('second set() with same (connector,tool) UPDATES the existing row instead of inserting a duplicate', async () => {
    const store = getConnectorPermissionStore();
    await store.set('github', 'create_issue', 'needs-approval' as ConnectorPermissionLevel, true);
    await store.set('github', 'create_issue', 'always-allow' as ConnectorPermissionLevel, true);

    // Both calls were upserts (the second is treated as an update via onConflict)
    expect(state.upsertCalls).toHaveLength(2);
    // Each call carried user_id so the conflict target matched
    for (const c of state.upsertCalls) {
      expect(c.values['user_id']).toBe('user-001');
      expect(c.opts).toEqual({ onConflict: 'user_id,connector_id,tool_name' });
    }
    // Our mock keys rows by (user,connector,tool); the second call must have
    // collapsed onto the same key (no duplicate row).
    expect(state.rows.size).toBe(1);
    const row = Array.from(state.rows.values())[0]!;
    expect(row['level']).toBe('always-allow');
  });

  it('rows for two different connectors stay distinct under one user', async () => {
    const store = getConnectorPermissionStore();
    await store.set('github', 'create_issue', 'always-allow' as ConnectorPermissionLevel);
    await store.set('linear', 'close_issue', 'blocked' as ConnectorPermissionLevel);
    expect(state.rows.size).toBe(2);
  });

  it('returns silently (no upsert) when the client cannot resolve a user id', async () => {
    state.authUserId = null;
    const store = getConnectorPermissionStore();
    await store.set('github', 'create_issue', 'always-allow' as ConnectorPermissionLevel);
    expect(state.upsertCalls).toHaveLength(0);
  });
});
