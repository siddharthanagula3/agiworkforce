import path from 'node:path';
import { LocalRuntimeClient } from './localRuntimeClient';

export interface DisposableLocalRuntime {
  dispose(): void;
}

export type LocalRuntimeFactory<T extends DisposableLocalRuntime = LocalRuntimeClient> = (
  cwd: string,
) => T;

/**
 * Process ownership boundary for the VS Code surface.
 *
 * A local app-server is scoped to one trusted workspace root, so multi-root
 * windows get one process per root and every chat surface reuses that process.
 */
export class LocalRuntimePool<T extends DisposableLocalRuntime = LocalRuntimeClient> {
  private readonly clients = new Map<string, T>();

  constructor(private readonly factory: LocalRuntimeFactory<T>) {}

  forWorkspace(cwd: string): T {
    const resolved = path.resolve(cwd);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    const existing = this.clients.get(key);
    if (existing !== undefined) return existing;
    const client = this.factory(resolved);
    this.clients.set(key, client);
    return client;
  }

  /**
   * Dispose all workspace processes and allow them to be recreated lazily.
   * Used when process-launch configuration changes (for example cliPath).
   */
  restartAll(): void {
    for (const client of this.clients.values()) client.dispose();
    this.clients.clear();
  }

  dispose(): void {
    this.restartAll();
  }
}
