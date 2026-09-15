/**
 * The spawned `agi app-server` is detached so its own children can be killed as
 * a group. Detaching also means nothing reaps it when the extension host goes
 * away, and an orphaned server outlives the window that started it. Every
 * spawned child is registered here and killed from a single `exit` handler.
 */

export interface RuntimeChildProcess {
  pid?: number | undefined;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface RuntimeHostProcess {
  platform: string;
  once(event: 'exit', listener: () => void): unknown;
  off(event: 'exit', listener: () => void): unknown;
  kill(pid: number, signal: NodeJS.Signals): unknown;
}

const tracked = new Set<RuntimeChildProcess>();
let installedHost: RuntimeHostProcess | undefined;
let installedListener: (() => void) | undefined;

function killGroup(host: RuntimeHostProcess, child: RuntimeChildProcess): void {
  const processId = child.pid;
  if (processId === undefined || !Number.isSafeInteger(processId) || processId <= 0) {
    try {
      child.kill('SIGKILL');
    } catch {
      return;
    }
    return;
  }
  if (host.platform === 'win32') {
    try {
      child.kill('SIGKILL');
    } catch {
      return;
    }
    return;
  }
  try {
    host.kill(-processId, 'SIGKILL');
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      return;
    }
  }
}

function uninstall(): void {
  if (installedHost === undefined || installedListener === undefined) return;
  installedHost.off('exit', installedListener);
  installedHost = undefined;
  installedListener = undefined;
}

export function trackRuntimeChild(
  child: RuntimeChildProcess,
  host: RuntimeHostProcess = process,
): () => void {
  tracked.add(child);
  if (installedListener === undefined) {
    const listener = (): void => {
      for (const entry of [...tracked]) killGroup(host, entry);
      tracked.clear();
      uninstall();
    };
    installedHost = host;
    installedListener = listener;
    host.once('exit', listener);
  }
  return () => {
    tracked.delete(child);
    if (tracked.size === 0) uninstall();
  };
}

export function trackedRuntimeChildCount(): number {
  return tracked.size;
}
