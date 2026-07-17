import { describe, expect, it, vi } from 'vitest';
import { LocalRuntimePool } from '../integrations/localRuntimePool';

describe('LocalRuntimePool', () => {
  it('owns exactly one local app-server client per workspace root', () => {
    const dispose = vi.fn();
    const factory = vi.fn((cwd: string) => ({ cwd, dispose }));
    const pool = new LocalRuntimePool(factory);

    const first = pool.forWorkspace('/workspace/a');
    const same = pool.forWorkspace('/workspace/a');
    const second = pool.forWorkspace('/workspace/b');

    expect(first).toBe(same);
    expect(second).not.toBe(first);
    expect(factory).toHaveBeenCalledTimes(2);
    pool.dispose();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('restarts every workspace client when runtime configuration changes', () => {
    const clients: Array<{ cwd: string; dispose: ReturnType<typeof vi.fn> }> = [];
    const pool = new LocalRuntimePool((cwd) => {
      const client = { cwd, dispose: vi.fn() };
      clients.push(client);
      return client;
    });

    const before = pool.forWorkspace('/workspace/a');
    pool.restartAll();
    const after = pool.forWorkspace('/workspace/a');

    expect(before.dispose).toHaveBeenCalledOnce();
    expect(after).not.toBe(before);
    expect(clients).toHaveLength(2);
  });

  it('reuses one process for syntactic aliases of the same workspace root', () => {
    const factory = vi.fn((cwd: string) => ({ cwd, dispose: vi.fn() }));
    const pool = new LocalRuntimePool(factory);

    const canonical = pool.forWorkspace('/workspace/project');
    const trailingSeparator = pool.forWorkspace('/workspace/project/');

    expect(trailingSeparator).toBe(canonical);
    expect(factory).toHaveBeenCalledOnce();
    pool.dispose();
  });
});
