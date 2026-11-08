import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { HostBridge, HostCommand } from '@agiworkforce/local-runtime-contract';
import { DesktopChanges } from '../components/DesktopChanges';
import { useHostCommands } from '../hooks/use-host-commands';
import { resetChangesPanel } from '../lib/changes-panel';

let deliver: ((command: HostCommand) => void) | null = null;

function fakeHost(): HostBridge {
  return {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    onHostCommand: (callback: (command: HostCommand) => void) => {
      deliver = callback;
      return () => {
        deliver = null;
      };
    },
  } as unknown as HostBridge;
}

function Harness() {
  useHostCommands(fakeHost());
  return <DesktopChanges />;
}

describe('Show Changes on the public window', () => {
  beforeEach(() => {
    deliver = null;
    resetChangesPanel();
  });

  it('shows the changes panel and hides it again', () => {
    render(<Harness />);
    expect(screen.queryByRole('region', { name: 'Changes' })).toBeNull();

    act(() => {
      deliver?.('toggle-changes');
    });
    expect(screen.getByRole('region', { name: 'Changes' })).toBeTruthy();
    expect(screen.getByText('No file changes')).toBeTruthy();

    act(() => {
      deliver?.('toggle-changes');
    });
    expect(screen.queryByRole('region', { name: 'Changes' })).toBeNull();
  });
});
