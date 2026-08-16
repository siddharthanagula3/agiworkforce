import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mcpListServers } from '../../api/mcp';
import { ollamaCheckStatus } from '../../api/ollama';
import { invoke as ipcInvoke } from '../../utils/ipc';
import { IPC_TIMEOUT_MS, MCP_TIMEOUT_MS, OLLAMA_TIMEOUT_MS } from '../timeouts';

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
