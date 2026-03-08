/**
 * tauriMock.test.ts — tauri-mock completeness tests
 *
 * Verifies that all mocked Tauri commands in src/lib/tauri-mock.ts:
 *   1. Return a value (not throw) for their happy-path invocation in test env
 *   2. Do not silently return undefined for commands that should return data
 *   3. Cover the 5 LLM provider/model commands expected by the frontend
 *
 * NOTE: In the test environment, src/lib/tauri-mock is replaced by the
 * vi.mock() in src/test/setup.ts that delegates to @tauri-apps/api/core's
 * mock invoke. To test the real tauri-mock switch statement we use
 * `vi.importActual` to bypass the module mock.
 */

import { describe, it, expect, vi } from 'vitest';

// We import the real module (not the mocked one from setup.ts) to exercise
// the switch statement in invoke().
// NODE_ENV is already 'test', so it will follow the test-env branch.

async function getRealInvoke() {
  // Temporarily ensure neither __TAURI_INTERNALS__ nor __TAURI__ is set so
  // isTauri evaluates to false and we hit the test-env code path.
  const mod = await vi.importActual<typeof import('../lib/tauri-mock')>('../lib/tauri-mock');
  return mod.invoke;
}

// ---------------------------------------------------------------------------
// LLM provider/model commands (BUG-009/010)
// ---------------------------------------------------------------------------

describe('LLM provider/model commands in tauri-mock', () => {
  it('llm_check_provider_status returns an object with available and configured fields', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<{ provider: string; available: boolean; configured: boolean }>(
      'llm_check_provider_status',
      { provider: 'anthropic' },
    );
    expect(result).toBeDefined();
    expect(typeof result.available).toBe('boolean');
    expect(typeof result.configured).toBe('boolean');
    expect(result.provider).toBe('anthropic');
  });

  it('llm_get_usage_stats returns a stats object with numeric fields', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<{
      totalTokens: number;
      totalCost: number;
      messageCount: number;
    }>('llm_get_usage_stats');
    expect(result).toBeDefined();
    expect(typeof result.totalTokens).toBe('number');
    expect(typeof result.totalCost).toBe('number');
    expect(typeof result.messageCount).toBe('number');
  });

  it('llm_get_available_models returns an array', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<unknown[]>('llm_get_available_models');
    expect(Array.isArray(result)).toBe(true);
  });

  it('llm_set_default_provider returns undefined (fire-and-forget)', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('llm_set_default_provider', { provider: 'anthropic' });
    expect(result).toBeUndefined();
  });

  it('llm_configure_provider returns undefined (fire-and-forget)', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('llm_configure_provider', { provider: 'openai', apiKey: 'test' });
    expect(result).toBeUndefined();
  });

  it('llm_send_message returns a response object with content field', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<{ content: string; model: string }>('llm_send_message', {
      messages: [{ role: 'user', content: 'Hello from test' }],
      model: 'claude-sonnet-4.6',
    });
    expect(result).toBeDefined();
    expect(typeof result.content).toBe('string');
    // Echo behaviour: last user message content is returned
    expect(result.content).toBe('Hello from test');
  });
});

// ---------------------------------------------------------------------------
// Core data-returning commands
// ---------------------------------------------------------------------------

describe('Core data commands return expected shapes', () => {
  it('get_onboarding_status returns { completed: boolean }', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<{ completed: boolean }>('get_onboarding_status');
    expect(typeof result.completed).toBe('boolean');
  });

  it('chat_create_conversation returns a Conversation object', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<{ id: number; title: string; created_at: string }>(
      'chat_create_conversation',
      { title: 'Test' },
    );
    expect(result).toBeDefined();
    expect(typeof result.id).toBe('number');
    expect(typeof result.title).toBe('string');
  });

  it('scheduler_list_jobs returns an array', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<unknown[]>('scheduler_list_jobs');
    expect(Array.isArray(result)).toBe(true);
  });

  it('scheduler_add_job returns a string job ID', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<string>('scheduler_add_job', { job: {} });
    expect(typeof result).toBe('string');
    expect(result.startsWith('sched_mock_')).toBe(true);
  });

  it('background_task_list returns an array', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<unknown[]>('background_task_list');
    expect(Array.isArray(result)).toBe(true);
  });

  it('get_model_capabilities returns a capabilities object', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<{ supports_tools: boolean; context_length: number }>(
      'get_model_capabilities',
    );
    expect(typeof result.supports_tools).toBe('boolean');
    expect(typeof result.context_length).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Scheduler fire-and-forget commands
// ---------------------------------------------------------------------------

describe('Scheduler mutation commands return undefined', () => {
  it('scheduler_update_job returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_update_job', { jobId: 'x', job: {} });
    expect(result).toBeUndefined();
  });

  it('scheduler_remove_job returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_remove_job', { jobId: 'x' });
    expect(result).toBeUndefined();
  });

  it('scheduler_toggle_job returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_toggle_job', { jobId: 'x' });
    expect(result).toBeUndefined();
  });

  it('scheduler_run_job_now returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_run_job_now', { jobId: 'x' });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Research commands
// ---------------------------------------------------------------------------

describe('Research commands return expected shapes', () => {
  it('research_start returns a session ID string', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<string>('research_start', { query: 'test' });
    expect(typeof result).toBe('string');
    expect(result.startsWith('session_mock_')).toBe(true);
  });

  it('research_get_status returns a status object', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke<{ status: string }>('research_get_status', {
      sessionId: 'session_mock_123',
    });
    expect(typeof result.status).toBe('string');
    expect(result.status).toBe('complete');
  });

  it('research_cancel returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('research_cancel', { sessionId: 'x' });
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unregistered command guard
// ---------------------------------------------------------------------------

describe('Unregistered command guard', () => {
  it('throws for an unknown command to surface wiring issues', async () => {
    const invoke = await getRealInvoke();
    await expect(invoke('totally_unknown_command_xyz_999')).rejects.toThrow(
      'Command not registered in tauri-mock',
    );
  });
});
