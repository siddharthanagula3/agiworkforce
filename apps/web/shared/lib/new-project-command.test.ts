import { describe, expect, it, vi } from 'vitest';
import { emitAppCommand } from './app-commands';
import { subscribeNewProject } from './new-project-command';

describe('subscribeNewProject', () => {
  it('opens the create dialog when File > New Project is chosen, and not after it unsubscribes', () => {
    const open = vi.fn();
    const stop = subscribeNewProject(open);

    expect(emitAppCommand('new-project')).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);

    stop();
    emitAppCommand('new-project');
    expect(open).toHaveBeenCalledTimes(1);
  });
});
