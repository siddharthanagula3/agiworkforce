export interface InputWatchLease {
  readonly tabId: number;
}

export interface RunInputWatchOptions {
  lease: InputWatchLease;
  activeRun: () => InputWatchLease | null;
  send: (tabId: number, watching: boolean) => void;
}

export interface RunInputWatch {
  start(): void;
  retarget(previousTabId: number): void;
  stop(initialTabId: number): void;
}

export function createRunInputWatch(options: RunInputWatchOptions): RunInputWatch {
  const { lease, activeRun, send } = options;

  const release = (tabId: number): void => {
    const active = activeRun();
    if (active !== null && active !== lease && active.tabId === tabId) return;
    send(tabId, false);
  };

  return {
    start: () => send(lease.tabId, true),
    retarget: (previousTabId) => {
      if (previousTabId === lease.tabId) return;
      send(lease.tabId, true);
      release(previousTabId);
    },
    stop: (initialTabId) => {
      release(lease.tabId);
      if (initialTabId !== lease.tabId) release(initialTabId);
    },
  };
}
