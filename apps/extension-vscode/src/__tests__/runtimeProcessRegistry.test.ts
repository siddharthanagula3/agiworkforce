import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  trackRuntimeChild,
  trackedRuntimeChildCount,
  type RuntimeChildProcess,
  type RuntimeHostProcess,
} from '../integrations/runtimeProcessRegistry';

function fakeChild(
  pid: number | undefined,
): RuntimeChildProcess & { kill: ReturnType<typeof vi.fn> } {
  return { pid, kill: vi.fn(() => true) };
}

function fakeHost(platform = 'darwin'): RuntimeHostProcess & {
  kill: ReturnType<typeof vi.fn>;
  fireExit: () => void;
  listenerCount: () => number;
} {
  const listeners = new Set<() => void>();
  return {
    platform,
    kill: vi.fn(),
    once: (_event: 'exit', listener: () => void) => listeners.add(listener),
    off: (_event: 'exit', listener: () => void) => listeners.delete(listener),
    fireExit: () => {
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  // Each test releases what it tracks, so the registry starts empty.
  expect(trackedRuntimeChildCount()).toBe(0);
});

describe('runtime child registry', () => {
  it('kills the process group of every live child when the extension host exits', () => {
    const host = fakeHost();
    const first = fakeChild(4242);
    const second = fakeChild(4243);
    trackRuntimeChild(first, host);
    trackRuntimeChild(second, host);

    host.fireExit();

    expect(host.kill).toHaveBeenCalledWith(-4242, 'SIGKILL');
    expect(host.kill).toHaveBeenCalledWith(-4243, 'SIGKILL');
    expect(trackedRuntimeChildCount()).toBe(0);
  });

  it('does not kill a child that already exited', () => {
    const host = fakeHost();
    const child = fakeChild(4242);
    const release = trackRuntimeChild(child, host);

    release();
    host.fireExit();

    expect(host.kill).not.toHaveBeenCalled();
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('installs one exit handler for many children and removes it when the last one goes', () => {
    const host = fakeHost();
    const releaseFirst = trackRuntimeChild(fakeChild(1), host);
    const releaseSecond = trackRuntimeChild(fakeChild(2), host);

    expect(host.listenerCount()).toBe(1);

    releaseFirst();
    expect(host.listenerCount()).toBe(1);

    releaseSecond();
    expect(host.listenerCount()).toBe(0);
  });

  it('falls back to killing the child itself when it has no usable pid', () => {
    const host = fakeHost();
    const child = fakeChild(undefined);
    trackRuntimeChild(child, host);

    host.fireExit();

    expect(host.kill).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('kills the child directly on Windows, where there is no process group', () => {
    const host = fakeHost('win32');
    const child = fakeChild(99);
    trackRuntimeChild(child, host);

    host.fireExit();

    expect(host.kill).not.toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('survives a child whose group is already gone', () => {
    const host = fakeHost();
    host.kill.mockImplementation(() => {
      throw new Error('ESRCH');
    });
    const child = fakeChild(7);
    trackRuntimeChild(child, host);

    expect(() => host.fireExit()).not.toThrow();
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
