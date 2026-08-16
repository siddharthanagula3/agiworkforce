
import { describe, it, expect, vi } from 'vitest';

async function getRealInvoke() {
  const mod = await vi.importActual<typeof import('../lib/tauri-mock')>('../lib/tauri-mock');
  return mod.invoke;
}

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
      model: 'fixture-tauri-message-model',
    });
    expect(result).toBeDefined();
    expect(typeof result.content).toBe('string');
    expect(result.content).toBe('Hello from test');
  });
});

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
    const result = await invoke<string>('scheduler_add_job', {
      name: 'Test',
      schedule: '0 0 9 * * *',
      actionType: 'notification',
      actionData: {},
    });
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

  it('supports the MCP bundle registry lifecycle without host mutations', async () => {
    const invoke = await getRealInvoke();
    const bundles = await invoke<Array<{ id: string; installed: boolean }>>('mcpb_fetch_registry');
    const bundleId = bundles[0]?.id;

    expect(bundleId).toBeDefined();
    await invoke('mcpb_install_bundle', { bundleId });

    const installed = await invoke<Array<{ id: string; installed: boolean }>>(
      'mcpb_get_installed_bundles',
    );
    expect(installed).toContainEqual(expect.objectContaining({ id: bundleId, installed: true }));

    await invoke('mcpb_uninstall_bundle', { bundleId });
    expect(await invoke('mcpb_get_installed_bundles')).toEqual([]);
  });
});

describe('Scheduler mutation commands return undefined', () => {
  it('scheduler_update_job returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_update_job', { id: 'x', updates: {} });
    expect(result).toBeUndefined();
  });

  it('scheduler_remove_job returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_remove_job', { jobId: 'x' });
    expect(result).toBeUndefined();
  });

  it('scheduler_toggle_job returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_toggle_job', { id: 'x' });
    expect(result).toBeUndefined();
  });

  it('scheduler_run_job_now returns undefined', async () => {
    const invoke = await getRealInvoke();
    const result = await invoke('scheduler_run_job_now', { id: 'x' });
    expect(result).toBeUndefined();
  });
});

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

describe('Unregistered command guard', () => {
  it('throws for an unknown command to surface wiring issues', async () => {
    const invoke = await getRealInvoke();
    await expect(invoke('totally_unknown_command_xyz_999')).rejects.toThrow(
      'Command not registered in tauri-mock',
    );
  });
});

describe('Native agent execution honesty', () => {
  it('rejects native execution fallbacks in cloud and desktop UI preview runtimes', async () => {
    const mod = await vi.importActual<typeof import('../lib/tauri-mock')>('../lib/tauri-mock');

    expect(
      mod.shouldRejectNativeExecutionFallback('agi_submit_goal_parallel', {
        test: false,
        cloudWeb: true,
        desktopUiDev: false,
      }),
    ).toBe(true);
    expect(
      mod.shouldRejectNativeExecutionFallback('agi_submit_goal_swarm', {
        test: false,
        cloudWeb: false,
        desktopUiDev: true,
      }),
    ).toBe(true);
    expect(
      mod.shouldRejectNativeExecutionFallback('agi_submit_goal', {
        test: true,
        cloudWeb: false,
        desktopUiDev: false,
      }),
    ).toBe(false);
  });
});
