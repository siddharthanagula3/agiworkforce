import path from 'node:path';
import { LocalRuntimeClient } from './localRuntimeClient';

export interface RestartableLocalRuntime {
  restart(): Promise<void>;
  dispose(): Promise<void>;
}

export type LocalRuntimeFactory<T extends RestartableLocalRuntime = LocalRuntimeClient> = (
  cwd: string,
) => T;

export interface LocalRuntimeRestartResult {
  restartedWorkspaces: number;
}

export class LocalRuntimePool<T extends RestartableLocalRuntime = LocalRuntimeClient> {
  private readonly clients = new Map<string, { cwd: string; client: T }>();
  private restartPromise?: Promise<LocalRuntimeRestartResult>;
  private shutdownPromise?: Promise<void>;

  constructor(private readonly factory: LocalRuntimeFactory<T>) {}

  forWorkspace(cwd: string): T {
    if (this.restartPromise !== undefined) {
      throw new Error('AGI local runtime is restarting; retry after restart completes');
    }
    if (this.shutdownPromise !== undefined) {
      throw new Error('AGI local runtime pool is shutting down');
    }
    const resolved = path.resolve(cwd);
    const key = this.keyFor(resolved);
    const existing = this.clients.get(key);
    if (existing !== undefined) return existing.client;
    const client = this.factory(resolved);
    this.clients.set(key, { cwd: resolved, client });
    return client;
  }

  restartAll(): Promise<LocalRuntimeRestartResult> {
    if (this.restartPromise !== undefined) return this.restartPromise;
    if (this.shutdownPromise !== undefined) {
      return Promise.reject(new Error('AGI local runtime pool is shutting down'));
    }

    const targets = [...this.clients.entries()];
    const restart = this.restartTargets(targets);
    this.restartPromise = restart;
    void restart.then(
      () => {
        if (this.restartPromise === restart) delete this.restartPromise;
      },
      () => {
        if (this.restartPromise === restart) delete this.restartPromise;
      },
    );
    return restart;
  }

  /**
   * A workspace folder that is gone has no window left to own its server, so
   * its client is disposed rather than left holding a detached child process.
   */
  async retainWorkspaces(cwds: readonly string[]): Promise<void> {
    const retained = new Set(cwds.map((cwd) => this.keyFor(cwd)));
    const dropped = [...this.clients.entries()].filter(([key]) => !retained.has(key));
    for (const [key] of dropped) this.clients.delete(key);
    await Promise.all(dropped.map(([, target]) => target.client.dispose().catch(() => undefined)));
  }

  dispose(): void {
    void this.shutdownAll();
  }

  shutdownAll(): Promise<void> {
    if (this.shutdownPromise !== undefined) return this.shutdownPromise;
    const shutdown = (async () => {
      if (this.restartPromise !== undefined) {
        await this.restartPromise.catch(() => undefined);
      }
      const targets = [...this.clients.entries()];
      await Promise.all(targets.map(([, target]) => target.client.dispose()));
      for (const [key, target] of targets) {
        if (this.clients.get(key)?.client === target.client) this.clients.delete(key);
      }
    })();
    this.shutdownPromise = shutdown;
    return shutdown;
  }

  private keyFor(cwd: string): string {
    const resolved = path.resolve(cwd);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  private async restartTargets(
    targets: Array<[string, { cwd: string; client: T }]>,
  ): Promise<LocalRuntimeRestartResult> {
    const results = await Promise.allSettled(targets.map(([, target]) => target.client.restart()));
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure !== undefined) {
      for (const [key, target] of targets) {
        if (this.clients.get(key)?.client === target.client) this.clients.delete(key);
      }
      await Promise.allSettled(targets.map(([, target]) => target.client.dispose()));
      throw failure.reason;
    }
    return { restartedWorkspaces: targets.length };
  }
}
