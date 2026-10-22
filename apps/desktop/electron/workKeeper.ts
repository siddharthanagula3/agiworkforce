/**
 * Keeps the computer from sleeping while an agent works for the user: a local
 * coding turn is running, or a paired phone is following this computer. The
 * display may still sleep; only system suspension is held off, and it is
 * released the moment no work is left.
 */
export interface WorkKeeperDeps {
  hold: () => () => void;
}

export interface WorkKeeper {
  update(working: boolean): void;
  holding(): boolean;
  release(): void;
}

export interface WakeDemand {
  preventSleepWhileRunning: boolean;
  runningTurns: number;
  phoneConnected: boolean;
}

/**
 * A running turn holds the computer awake only while the user wants that. A
 * connected phone always does: the session it drives ends when the computer
 * sleeps, and the phone has no way to wake it again.
 */
export function needsWakeHold(demand: WakeDemand): boolean {
  return demand.phoneConnected || (demand.preventSleepWhileRunning && demand.runningTurns > 0);
}

export function createWorkKeeper(deps: WorkKeeperDeps): WorkKeeper {
  let releaseHold: (() => void) | null = null;
  const release = (): void => {
    releaseHold?.();
    releaseHold = null;
  };
  return {
    update(working) {
      if (working && releaseHold === null) releaseHold = deps.hold();
      else if (!working) release();
    },
    holding: () => releaseHold !== null,
    release,
  };
}
