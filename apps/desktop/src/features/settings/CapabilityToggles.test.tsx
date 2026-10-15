import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();

vi.mock('../../lib/tauri-mock', async () => {
  const actual =
    await vi.importActual<typeof import('../../lib/tauri-mock')>('../../lib/tauri-mock');
  return {
    ...actual,
    isTauriContext: () => true,
    invoke: (...args: unknown[]) => mockInvoke(...args),
  };
});

import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { CapabilityToggles } from './CapabilityToggles';

const LISTED = [
  {
    name: 'terminalAccess',
    label: 'Terminal',
    description: 'Run shell commands. Off: it cannot run any command.',
    defaultEnabled: true,
    toolCount: 2,
    heldOff: false,
  },
  {
    name: 'capabilityOnlyTheHostKnows',
    label: 'Something new',
    description: 'A capability this renderer has never heard of. Off: it stops.',
    defaultEnabled: false,
    toolCount: 1,
    heldOff: false,
  },
  {
    name: 'fileOperations',
    label: 'Files',
    description: 'Read and write files. Off: it cannot open or change any file.',
    defaultEnabled: true,
    toolCount: 12,
    heldOff: false,
  },
];

function answer(overrides: Record<string, (args: unknown) => unknown> = {}) {
  mockInvoke.mockImplementation(async (command: string, args?: unknown) => {
    const override = overrides[command];
    if (override) return override(args);
    if (command === 'list_capabilities') return LISTED;
    return undefined;
  });
}

function rowFor(label: string): HTMLElement {
  const row = screen.getByRole('switch', { name: label }).closest('li');
  if (!row) throw new Error(`No row for ${label}`);
  return row;
}

describe('CapabilityToggles', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    useSettingsStore.setState({ features: {} });
    useSettingsDialogStore.setState({ settingsOpen: false, settingsInitialTab: 'general' });
  });

  afterEach(() => cleanup());

  it('renders one row per capability the host lists, in its order and words', async () => {
    answer();
    render(<CapabilityToggles />);

    const switches = await screen.findAllByRole('switch');
    expect(switches.map((node) => node.getAttribute('id'))).toEqual([
      'capability-terminalAccess',
      'capability-capabilityOnlyTheHostKnows',
      'capability-fileOperations',
    ]);
    expect(within(rowFor('Terminal')).getByText(LISTED[0]!.description)).toBeTruthy();
    expect(within(rowFor('Terminal')).getByText('2 tools')).toBeTruthy();
    expect(within(rowFor('Something new')).getByText('1 tool')).toBeTruthy();
    const scope = screen.getByText(/finishes its current step/);
    expect(scope.textContent?.replace(/\s+/g, ' ')).toContain(
      'These switches also hold in tasks, scheduled assistant tasks and background agents. Shell commands and scripts you schedule yourself are not covered.',
    );
    expect(scope.textContent).not.toMatch(/do not check these switches/);
  });

  it('shows the default for a capability with no saved choice and the saved choice otherwise', async () => {
    answer();
    useSettingsStore.setState({ features: { fileOperations: false } });
    render(<CapabilityToggles />);

    expect(await screen.findByRole('switch', { name: 'Terminal' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Something new' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Files' })).not.toBeChecked();
  });

  it('turns a capability off at once, with no confirmation in the page', async () => {
    const user = userEvent.setup();
    answer({ set_capability: () => true });
    render(<CapabilityToggles />);

    await user.click(await screen.findByRole('switch', { name: 'Terminal' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('set_capability', {
        name: 'terminalAccess',
        enabled: false,
      });
    });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Terminal' })).not.toBeChecked();
    });
    expect(useSettingsStore.getState().features).toEqual({ terminalAccess: false });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows the native step while a capability is being turned on, and stays off until the host agrees', async () => {
    const user = userEvent.setup();
    let agree: (changed: boolean) => void = () => {};
    answer({
      set_capability: () =>
        new Promise<boolean>((resolve) => {
          agree = resolve;
        }),
    });
    useSettingsStore.setState({ features: { fileOperations: false } });
    render(<CapabilityToggles />);

    await user.click(await screen.findByRole('switch', { name: 'Files' }));

    expect(
      await within(rowFor('Files')).findByText('Confirm in the system dialog to turn this on.'),
    ).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Files' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Files' })).toBeDisabled();
    expect(mockInvoke).toHaveBeenCalledWith('set_capability', {
      name: 'fileOperations',
      enabled: true,
    });

    agree(true);
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Files' })).toBeChecked();
    });
    expect(screen.queryByText('Confirm in the system dialog to turn this on.')).toBeNull();
  });

  it('leaves a capability off, with no error, when the person declines the system dialog', async () => {
    const user = userEvent.setup();
    answer({ set_capability: () => false });
    useSettingsStore.setState({ features: { fileOperations: false } });
    render(<CapabilityToggles />);

    await user.click(await screen.findByRole('switch', { name: 'Files' }));

    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Files' })).toBeEnabled();
    });
    expect(screen.getByRole('switch', { name: 'Files' })).not.toBeChecked();
    expect(useSettingsStore.getState().features).toEqual({ fileOperations: false });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the switch as it was and says why when the host cannot save the change', async () => {
    const user = userEvent.setup();
    answer({
      set_capability: () => {
        throw new Error('Failed to write settings file');
      },
    });
    render(<CapabilityToggles />);

    await user.click(await screen.findByRole('switch', { name: 'Files' }));

    const alert = await within(rowFor('Files')).findByRole('alert');
    expect(alert.textContent).toContain('This switch was not saved');
    expect(screen.getByRole('switch', { name: 'Files' })).toBeChecked();
    expect(useSettingsStore.getState().features).toEqual({});
  });

  it('shows capabilities held off after an unreadable settings file as off until each is turned on', async () => {
    const user = userEvent.setup();
    const held = new Set(['terminalAccess', 'fileOperations']);
    answer({
      list_capabilities: () => LISTED.map((row) => ({ ...row, heldOff: held.has(row.name) })),
      set_capability: (args) => {
        held.delete((args as { name: string }).name);
        return true;
      },
    });
    useSettingsStore.setState({ features: { terminalAccess: false, fileOperations: false } });
    render(<CapabilityToggles />);

    expect(await screen.findByRole('switch', { name: 'Terminal' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'Files' })).not.toBeChecked();
    expect(screen.getByText(/could not be read when the app started/)).toBeTruthy();

    await user.click(screen.getByRole('switch', { name: 'Terminal' }));
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Terminal' })).toBeChecked();
    });
    expect(screen.getByText(/could not be read when the app started/)).toBeTruthy();

    await user.click(screen.getByRole('switch', { name: 'Files' }));
    await waitFor(() => {
      expect(screen.queryByText(/could not be read when the app started/)).toBeNull();
    });
  });

  it('says which tools these switches do not govern and links to where those are switched', async () => {
    const user = userEvent.setup();
    answer();
    render(<CapabilityToggles />);
    await screen.findAllByRole('switch');

    const scope = screen.getByText(/Tools from MCP servers and connectors/);
    expect(scope.textContent?.replace(/\s+/g, ' ')).toContain('are not governed by these switches');
    expect(scope.textContent).toContain(
      'Turning one back on asks you to confirm in a system dialog',
    );

    await user.click(screen.getByRole('button', { name: 'Settings, Connectors' }));
    expect(useSettingsDialogStore.getState()).toMatchObject({
      settingsOpen: true,
      settingsInitialTab: 'connectors',
    });
  });

  it('says so when the list cannot be loaded instead of showing no tools', async () => {
    answer({
      list_capabilities: () => {
        throw new Error('ipc closed');
      },
    });
    render(<CapabilityToggles />);

    expect((await screen.findByRole('alert')).textContent).toContain('could not be loaded');
    expect(screen.queryAllByRole('switch')).toHaveLength(0);
  });
});
