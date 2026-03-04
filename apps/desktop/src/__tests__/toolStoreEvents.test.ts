/**
 * Tests for toolStore event infrastructure.
 *
 * Covers:
 * - ToolEventPayload type shape — all required and optional fields have the
 *   correct types as documented in the Rust `ToolEvent` serde contract.
 * - initializeToolEventListener double-init guard — calling the function
 *   multiple times must only register event listeners once.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ToolEventPayload } from '../stores/chat/toolStore';

// ---------------------------------------------------------------------------
// Module-level mock wiring
//
// The test setup (src/test/setup.ts) already mocks:
//   - @tauri-apps/api/event  → { listen: vi.fn().mockResolvedValue(() => {}) }
//   - src/lib/tauri-mock     → { isTauri: false, invoke: ..., isTauriContext: () => false }
//
// initializeToolEventListener short-circuits when `isTauri` is false, so the
// @tauri-apps/api/event mock is only reached if we override isTauri to true.
// ---------------------------------------------------------------------------

describe('ToolEventPayload type shape', () => {
  /**
   * These tests verify that objects shaped like ToolEventPayload satisfy all
   * required fields and that optional fields default correctly. TypeScript
   * enforces this at compile time; the runtime assertions confirm the exact
   * field names match the Rust serde contract (snake_case identifiers).
   */

  it('accepts a minimal "started" event with only required fields', () => {
    const payload: ToolEventPayload = {
      type: 'started',
      id: 'tool-exec-001',
      conversation_id: 42,
      message_id: 'msg-abc',
    };

    expect(payload.type).toBe('started');
    expect(payload.id).toBe('tool-exec-001');
    expect(payload.conversation_id).toBe(42);
    expect(payload.message_id).toBe('msg-abc');
    // Optional fields must be absent when not provided
    expect(payload.tool_name).toBeUndefined();
    expect(payload.display_name).toBeUndefined();
    expect(payload.display_args).toBeUndefined();
    expect(payload.iteration).toBeUndefined();
    expect(payload.parallel_group).toBeUndefined();
  });

  it('accepts a "started" event with all optional fields populated', () => {
    const payload: ToolEventPayload = {
      type: 'started',
      id: 'tool-exec-002',
      conversation_id: 7,
      message_id: 'msg-xyz',
      tool_name: 'bash',
      display_name: 'Run Shell Command',
      display_args: 'ls -la /tmp',
      iteration: 3,
      parallel_group: 'group-alpha',
    };

    expect(payload.tool_name).toBe('bash');
    expect(payload.display_name).toBe('Run Shell Command');
    expect(payload.display_args).toBe('ls -la /tmp');
    expect(payload.iteration).toBe(3);
    expect(payload.parallel_group).toBe('group-alpha');
  });

  it('accepts a "progress" event with stdout_chunk and progress_pct', () => {
    const payload: ToolEventPayload = {
      type: 'progress',
      id: 'tool-exec-003',
      conversation_id: 1,
      message_id: 'msg-prog',
      stdout_chunk: 'Processing file 5 of 10...',
      progress_pct: 50,
    };

    expect(payload.type).toBe('progress');
    expect(payload.stdout_chunk).toBe('Processing file 5 of 10...');
    expect(payload.progress_pct).toBe(50);
    // Fields from other event types must be absent
    expect(payload.success).toBeUndefined();
    expect(payload.duration_ms).toBeUndefined();
  });

  it('accepts a successful "completed" event', () => {
    const payload: ToolEventPayload = {
      type: 'completed',
      id: 'tool-exec-004',
      conversation_id: 99,
      message_id: 'msg-done',
      success: true,
      duration_ms: 1234,
      result_preview: '{"files": 3}',
    };

    expect(payload.type).toBe('completed');
    expect(payload.success).toBe(true);
    expect(payload.duration_ms).toBe(1234);
    expect(payload.result_preview).toBe('{"files": 3}');
    expect(payload.error).toBeUndefined();
  });

  it('accepts a failed "completed" event with an error field', () => {
    const payload: ToolEventPayload = {
      type: 'completed',
      id: 'tool-exec-005',
      conversation_id: 1,
      message_id: 'msg-fail',
      success: false,
      duration_ms: 88,
      error: 'Permission denied: /etc/passwd',
    };

    expect(payload.success).toBe(false);
    expect(payload.error).toBe('Permission denied: /etc/passwd');
  });

  it('uses snake_case field names matching the Rust serde contract', () => {
    // Verify the field names are exactly as defined — any rename would be a
    // breaking change in the frontend/backend protocol.
    const payload: ToolEventPayload = {
      type: 'completed',
      id: 'check',
      conversation_id: 0,
      message_id: 'check',
      tool_name: 't',
      display_name: 'd',
      display_args: 'a',
      iteration: 1,
      stdout_chunk: 'c',
      progress_pct: 100,
      success: true,
      duration_ms: 0,
      result_preview: 'r',
      error: undefined,
      parallel_group: 'g',
    };

    // All snake_case keys must exist on the object (not camelCase variants).
    const keys = Object.keys(payload);
    expect(keys).toContain('conversation_id');
    expect(keys).toContain('message_id');
    expect(keys).toContain('tool_name');
    expect(keys).toContain('display_name');
    expect(keys).toContain('display_args');
    expect(keys).toContain('stdout_chunk');
    expect(keys).toContain('progress_pct');
    expect(keys).toContain('duration_ms');
    expect(keys).toContain('result_preview');
    expect(keys).toContain('parallel_group');
  });

  it('conversation_id accepts 0 (falsy number edge case)', () => {
    const payload: ToolEventPayload = {
      type: 'started',
      id: 'edge-0',
      conversation_id: 0,
      message_id: 'msg-0',
    };
    // Must not be undefined — 0 is a valid conversation_id
    expect(payload.conversation_id).toBe(0);
    expect(typeof payload.conversation_id).toBe('number');
  });

  it('type discriminant is one of the three expected literal values', () => {
    const validTypes: ToolEventPayload['type'][] = ['started', 'progress', 'completed'];
    for (const t of validTypes) {
      const payload: ToolEventPayload = { type: t, id: 'x', conversation_id: 1, message_id: 'y' };
      expect(validTypes).toContain(payload.type);
    }
  });
});

// ---------------------------------------------------------------------------
// initializeToolEventListener — double-init guard
//
// The guard is a module-level boolean `toolEventListenerInitialized`.  It is
// not exported, so we observe it indirectly: the number of `listen` calls
// emitted by @tauri-apps/api/event tells us whether the function attempted
// to re-register.
//
// Strategy: use vi.resetModules() before each guard test so each test gets a
// fresh module instance with the flag reset to false.  Then use vi.doMock()
// before the dynamic import so Vitest picks up our overrides.
// ---------------------------------------------------------------------------

describe('initializeToolEventListener double-init guard', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call listen when isTauri is false (web/test mode)', async () => {
    // setup.ts mocks tauri-mock with isTauri = false.  After vi.resetModules()
    // the fresh module load still hits the vi.mock() factory from setup.ts which
    // evaluates to isTauri: false (no Tauri globals in jsdom).
    const { listen } = await import('@tauri-apps/api/event');
    const listenSpy = vi.mocked(listen);
    listenSpy.mockClear();

    const { initializeToolEventListener } = await import('../stores/chat/toolStore');

    await initializeToolEventListener();
    await initializeToolEventListener(); // second call

    // isTauri = false → guard exits before calling listen.
    expect(listenSpy).not.toHaveBeenCalled();
  });

  it('only registers listeners once when called twice with isTauri = true', async () => {
    // Re-mock tauri-mock so isTauri = true for this test.
    vi.doMock('../lib/tauri-mock', () => ({
      isTauri: true,
      invoke: vi.fn(),
      isTauriContext: () => true,
    }));

    const { listen } = await import('@tauri-apps/api/event');
    const listenSpy = vi.mocked(listen);
    listenSpy.mockClear();

    const { initializeToolEventListener } = await import('../stores/chat/toolStore');

    // First call — registers all event listeners.
    await initializeToolEventListener();
    const callsAfterFirst = listenSpy.mock.calls.length;

    // Guard must prevent a second registration.
    await initializeToolEventListener();
    expect(listenSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('resets the guard flag when listen rejects so a retry is possible', async () => {
    // Re-mock tauri-mock so isTauri = true.
    vi.doMock('../lib/tauri-mock', () => ({
      isTauri: true,
      invoke: vi.fn(),
      isTauriContext: () => true,
    }));

    const { listen } = await import('@tauri-apps/api/event');
    const listenSpy = vi.mocked(listen);
    // First call rejects; subsequent calls resolve.
    listenSpy.mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValue(() => {});

    const { initializeToolEventListener } = await import('../stores/chat/toolStore');

    // First attempt — listen throws; implementation catches and resets the flag.
    await initializeToolEventListener();
    const callsAfterFirst = listenSpy.mock.calls.length;

    // Second attempt — flag was reset so the function should enter the body again.
    await initializeToolEventListener();
    expect(listenSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
