import { describe, expect, it, vi } from 'vitest';
import { createWorkKeeper } from '../workKeeper';

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
