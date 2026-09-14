import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostBridge, HostCommand } from '@agiworkforce/local-runtime-contract';
import { useUIStore } from '@shared/stores/layout-store';
import { onAppCommand } from '@shared/lib/app-commands';
import { useHostCommands } from '../hooks/use-host-commands';

let deliver: ((command: HostCommand) => void) | null = null;
let released = 0;

function fakeHost(): HostBridge {
  return {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    onHostCommand: (callback: (command: HostCommand) => void) => {
      deliver = callback;
      return () => {
        released += 1;
        deliver = null;
      };
    },
  } as unknown as HostBridge;
}

function Harness({ host }: { host: HostBridge | null }) {
  useHostCommands(host);
  return null;
}

beforeEach(() => {
  deliver = null;
  released = 0;
  useUIStore.getState().setSidebarCollapsed(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('host commands', () => {
  it('collapses and restores the sidebar the page already owns', () => {
    render(<Harness host={fakeHost()} />);

    deliver?.('toggle-sidebar');
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);

    deliver?.('toggle-sidebar');
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it('opens the shortcut sheet through the command the surfaces listen for', () => {
    const opened = vi.fn();
    const stop = onAppCommand('open-shortcuts', opened);
    render(<Harness host={fakeHost()} />);

    deliver?.('show-keyboard-shortcuts');

    expect(opened).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
    stop();
  });

  it('subscribes to nothing in a browser', () => {
    render(<Harness host={null} />);

    expect(deliver).toBeNull();
  });

  it('releases the subscription when it unmounts', () => {
    const view = render(<Harness host={fakeHost()} />);

    view.unmount();

    expect(released).toBe(1);
    expect(deliver).toBeNull();
  });
});
