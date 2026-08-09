import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mcpListServers } from '../../api/mcp';
import { ollamaCheckStatus } from '../../api/ollama';
import { invoke as ipcInvoke } from '../../utils/ipc';
import { IPC_TIMEOUT_MS, MCP_TIMEOUT_MS, OLLAMA_TIMEOUT_MS } from '../timeouts';

/**
 * `constants/timeouts.ts` shipped complete and unimported, so editing a value in
 * it changed nothing at runtime. These tests pin the opposite property for the
 * modules that were migrated onto it AND that a user can actually reach: each
 * one fires at the canonical value, so changing the export changes the app.
 *
 * They are behavioural on purpose. A source scan asserting "this file contains
 * an import" is satisfied by renaming a local constant, and says nothing about
 * whether the value governs a call. What is checked here is only these three
 * constants on these three paths — it is not a repository-wide ban on
 * re-declaring a timeout, and it does not compare any other module's copy of a
 * name against the canonical value.
 */

/** A promise that never settles, standing in for a hung Rust command. */
function hang(): Promise<never> {
  return new Promise<never>(() => {});
}

const mockedInvoke = vi.mocked(tauriInvoke);

describe('canonical timeouts govern the reachable IPC paths', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedInvoke.mockReset();
    mockedInvoke.mockImplementation(hang);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Path: `features/code/FileTree.tsx` renders a directory row, its expand
   * handler calls `invoke('dir_list', …)` from `utils/ipc.ts`. `dir_list` has no
   * entry in `COMMAND_TIMEOUTS`, so it takes the `?? IPC_TIMEOUT_MS` fallback.
   */
  it('utils/ipc.ts times an unoverridden command out at IPC_TIMEOUT_MS', async () => {
    const settled = vi.fn();
    const call = ipcInvoke('dir_list', { path: '/tmp' }).catch(settled);

    await vi.advanceTimersByTimeAsync(IPC_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await call;

    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled.mock.calls[0]?.[0]).toMatchObject({ code: 'TIMEOUT' });
  });

  /**
   * Path: `features/mcp/MCPServerManager.tsx` mounts and calls
   * `McpClient.listServers()`, which is `mcpListServers` -> `invokeWithTimeout`
   * with its `MCP_TIMEOUT_MS` default.
   */
  it('api/mcp.ts times a server listing out at MCP_TIMEOUT_MS', async () => {
    const settled = vi.fn();
    const call = mcpListServers().catch(settled);

    await vi.advanceTimersByTimeAsync(MCP_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await call;

    expect(settled).toHaveBeenCalledTimes(1);
    expect(String(settled.mock.calls[0]?.[0])).toContain(`timed out after ${MCP_TIMEOUT_MS}ms`);
  });

  /**
   * Path: `features/settings/SettingsPanel.tsx` calls `ollamaCheckStatus()` when
   * the local-models section opens. It swallows the timeout into `false`, so the
   * observable effect is how long the panel waits before reporting Ollama down.
   */
  it('api/ollama.ts reports Ollama down only after OLLAMA_TIMEOUT_MS', async () => {
    const settled = vi.fn();
    const call = ollamaCheckStatus().then(settled);

    await vi.advanceTimersByTimeAsync(OLLAMA_TIMEOUT_MS - 1);
    expect(settled).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await call;

    expect(settled).toHaveBeenCalledWith(false);
  });
});
