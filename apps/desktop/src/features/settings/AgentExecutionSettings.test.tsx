import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultTerminalSandboxPreferences, useSettingsStore } from '../../stores/settingsStore';
import { AgentExecutionSettings } from './AgentExecutionSettings';

if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

describe('AgentExecutionSettings sandbox consent', () => {
  beforeEach(() => {
    const state = useSettingsStore.getState();
    useSettingsStore.setState({
      executionPreferences: {
        ...state.executionPreferences,
        terminalSandbox: {
          ...defaultTerminalSandboxPreferences,
          enabled: true,
          backend: 'srt',
          policy: 'workspace-write',
        },
      },
    });
  });

  afterEach(() => cleanup());

  it('does not persist danger-full-access until the user confirms the risk modal', async () => {
    const user = userEvent.setup();
    render(<AgentExecutionSettings />);

    await user.click(screen.getByRole('combobox', { name: 'Access policy' }));
    await user.click(await screen.findByRole('option', { name: 'Danger full access' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/does not bypass agent approval prompts/i)).toBeTruthy();
    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.policy).toBe(
      'workspace-write',
    );

    await user.click(screen.getByRole('button', { name: 'Run Without Sandbox' }));

    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.policy).toBe(
      'danger-full-access',
    );
  });

  it('keeps the sandbox enabled when the user cancels', async () => {
    const user = userEvent.setup();
    render(<AgentExecutionSettings />);

    await user.click(screen.getByRole('switch', { name: 'Enable terminal sandbox' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.enabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.enabled).toBe(true);
  });

  it('gates the equivalent Disabled backend path behind the same modal', async () => {
    const user = userEvent.setup();
    render(<AgentExecutionSettings />);

    await user.click(screen.getByRole('combobox', { name: 'Runtime backend' }));
    await user.click(await screen.findByRole('option', { name: 'Disabled' }));

    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.backend).toBe('srt');

    await user.click(screen.getByRole('button', { name: 'Run Without Sandbox' }));

    expect(useSettingsStore.getState().executionPreferences.terminalSandbox.backend).toBe('none');
  });
});
