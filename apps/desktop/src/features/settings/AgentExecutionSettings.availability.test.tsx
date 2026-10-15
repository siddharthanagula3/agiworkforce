import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

import { defaultTerminalSandboxPreferences, useSettingsStore } from '../../stores/settingsStore';
import { AgentExecutionSettings } from './AgentExecutionSettings';

const MISSING_REASON =
  'Sandbox runtime executable not found outside the folders a sandboxed command can write: srt';

function answerAvailability(availability: {
  supported: boolean;
  available: boolean;
  reason: string | null;
}) {
  mockInvoke.mockImplementation(async (command: string) => {
    if (command === 'terminal_sandbox_availability') return availability;
    return undefined;
  });
}

function setSandbox(enabled: boolean) {
  const state = useSettingsStore.getState();
  useSettingsStore.setState({
    executionPreferences: {
      ...state.executionPreferences,
      terminalSandbox: { ...defaultTerminalSandboxPreferences, enabled, backend: 'srt' },
    },
  });
}

describe('AgentExecutionSettings sandbox runtime availability', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    setSandbox(false);
  });

  afterEach(() => cleanup());

  it('asks the host about the configured executable', async () => {
    answerAvailability({ supported: true, available: true, reason: null });
    render(<AgentExecutionSettings />);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('terminal_sandbox_availability', {
        executable: defaultTerminalSandboxPreferences.executable,
      });
    });
    expect(screen.getByRole('switch', { name: 'Enable terminal sandbox' })).toBeEnabled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('refuses to switch the sandbox on while the runtime is missing, and says why', async () => {
    const user = userEvent.setup();
    answerAvailability({ supported: true, available: false, reason: MISSING_REASON });
    render(<AgentExecutionSettings />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(MISSING_REASON);
    expect(alert.textContent).toContain('cannot be switched on yet');

    const toggle = screen.getByRole('switch', { name: 'Enable terminal sandbox' });
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.enabled).toBe(false);
  });

  it('lets the user point at the runtime while the switch is refused', async () => {
    answerAvailability({ supported: true, available: false, reason: MISSING_REASON });
    render(<AgentExecutionSettings />);

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Runtime executable')).toBeTruthy();
  });

  it('keeps the off switch reachable when an enabled sandbox loses its runtime', async () => {
    setSandbox(true);
    answerAvailability({ supported: true, available: false, reason: MISSING_REASON });
    render(<AgentExecutionSettings />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('cannot start until the sandbox runtime is found');
    expect(screen.getByRole('switch', { name: 'Enable terminal sandbox' })).toBeEnabled();
  });

  it('hides the runtime switch where the platform has no backend', async () => {
    answerAvailability({
      supported: false,
      available: false,
      reason: 'The `srt` sandbox backend is not supported on Windows.',
    });
    render(<AgentExecutionSettings />);

    await waitFor(() => {
      expect(screen.queryByRole('switch', { name: 'Enable terminal sandbox' })).toBeNull();
    });
    expect(screen.getByText(/not available on Windows/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Access policy' })).toBeTruthy();
    expect(screen.queryByLabelText('Runtime executable')).toBeNull();
  });
});
