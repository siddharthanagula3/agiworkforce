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
