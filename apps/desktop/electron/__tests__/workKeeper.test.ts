import { describe, expect, it, vi } from 'vitest';
import { createWorkKeeper, needsWakeHold } from '../workKeeper';

function keeper() {
  const released = vi.fn();
  const hold = vi.fn(() => released);
  return { keeper: createWorkKeeper({ hold }), hold, released };
}

describe('keeping the computer awake while an agent works', () => {
  it('holds once while work runs and releases when it ends', () => {
    const { keeper: k, hold, released } = keeper();

    k.update(true);
    k.update(true);
    expect(hold).toHaveBeenCalledOnce();
    expect(k.holding()).toBe(true);

    k.update(false);
    expect(released).toHaveBeenCalledOnce();
    expect(k.holding()).toBe(false);
  });

  it('holds again for the next piece of work', () => {
    const { keeper: k, hold } = keeper();

    k.update(true);
    k.update(false);
    k.update(true);

    expect(hold).toHaveBeenCalledTimes(2);
  });

  it('never holds while nothing runs, and lets go on quit', () => {
    const { keeper: k, hold, released } = keeper();

    k.update(false);
    expect(hold).not.toHaveBeenCalled();

    k.update(true);
    k.release();
    expect(released).toHaveBeenCalledOnce();
    expect(k.holding()).toBe(false);
  });
});

describe('what keeps the computer awake', () => {
  it('holds for a running turn only while the user wants the computer kept awake', () => {
    expect(
      needsWakeHold({ preventSleepWhileRunning: true, runningTurns: 1, phoneConnected: false }),
    ).toBe(true);
    expect(
      needsWakeHold({ preventSleepWhileRunning: false, runningTurns: 2, phoneConnected: false }),
    ).toBe(false);
    expect(
      needsWakeHold({ preventSleepWhileRunning: true, runningTurns: 0, phoneConnected: false }),
    ).toBe(false);
  });

  it('holds for a connected phone whatever the preference says', () => {
    expect(
      needsWakeHold({ preventSleepWhileRunning: false, runningTurns: 0, phoneConnected: true }),
    ).toBe(true);
  });
});
