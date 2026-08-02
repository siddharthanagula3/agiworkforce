import { describe, expect, it, vi } from 'vitest';
import { LocalRuntimePool } from '../integrations/localRuntimePool';

describe('LocalRuntimePool', () => {
  it('owns exactly one local app-server client per workspace root', async () => {
    const dispose = vi.fn(async () => undefined);
    const factory = vi.fn((cwd: string) => ({
      cwd,
      restart: vi.fn(async () => undefined),
      dispose,
    }));
    const pool = new LocalRuntimePool(factory);

    const first = pool.forWorkspace('/workspace/a');
    const same = pool.forWorkspace('/workspace/a');
    const second = pool.forWorkspace('/workspace/b');

    expect(first).toBe(same);
    expect(second).not.toBe(first);
    expect(factory).toHaveBeenCalledTimes(2);
    await pool.shutdownAll();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('restarts every workspace process while preserving stable client ownership', async () => {
    const clients: Array<{
      cwd: string;
      restart: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }> = [];
    const pool = new LocalRuntimePool((cwd) => {
      const client = {
        cwd,
        restart: vi.fn(async () => undefined),
        dispose: vi.fn(async () => undefined),
      };
      clients.push(client);
      return client;
    });

    const before = pool.forWorkspace('/workspace/a');
    const result = await pool.restartAll();
    const after = pool.forWorkspace('/workspace/a');

    expect(before.restart).toHaveBeenCalledOnce();
    expect(after).toBe(before);
    expect(clients).toHaveLength(1);
    expect(result).toEqual({ restartedWorkspaces: 1 });
    await pool.shutdownAll();
  });

  it('does not resolve restart until the fresh runtime is ready', async () => {
    let resolveRestart!: () => void;
    const restartGate = new Promise<void>((resolve) => {
      resolveRestart = resolve;
    });
    const pool = new LocalRuntimePool((cwd) => {
      return {
        cwd,
        restart: vi.fn(() => restartGate),
        dispose: vi.fn(async () => undefined),
      };
    });
    pool.forWorkspace('/workspace/a');
    let settled = false;

    const restart = pool.restartAll().then((result) => {
      settled = true;
      return result;
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(settled).toBe(false);
    expect(() => pool.forWorkspace('/workspace/a')).toThrow('is restarting');
    resolveRestart();
    await expect(restart).resolves.toEqual({ restartedWorkspaces: 1 });
    await pool.shutdownAll();
  });

  it('reuses one process for syntactic aliases of the same workspace root', async () => {
    const factory = vi.fn((cwd: string) => ({
      cwd,
      restart: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    }));
    const pool = new LocalRuntimePool(factory);

    const canonical = pool.forWorkspace('/workspace/project');
    const trailingSeparator = pool.forWorkspace('/workspace/project/');

    expect(trailingSeparator).toBe(canonical);
    expect(factory).toHaveBeenCalledOnce();
    await pool.shutdownAll();
  });
});
