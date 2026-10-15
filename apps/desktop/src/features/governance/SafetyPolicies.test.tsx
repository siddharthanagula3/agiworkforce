import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  autoApprove: false,
  mode: 'safe',
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: host.invoke,
  isTauri: true,
}));

vi.mock('sonner', () => ({
  toast: { success: host.toastSuccess, error: host.toastError },
}));

import { SafetyPolicies } from './SafetyPolicies';

const DECLINED = 'You chose not to always allow file_read.';

function answerReads(command: string): Promise<unknown> | undefined {
  if (command === 'get_remembered_tool_choices') return Promise.resolve({});
  if (command === 'get_auto_approve_all') return Promise.resolve(host.autoApprove);
  if (command === 'get_agent_mode') return Promise.resolve(host.mode);
  return undefined;
}

async function policySelect(): Promise<HTMLSelectElement> {
  render(<SafetyPolicies />);
  return screen.findByRole<HTMLSelectElement>('combobox', {
    name: 'Approval policy for file_read',
  });
}

describe('SafetyPolicies', () => {
  beforeEach(() => {
    host.autoApprove = false;
    host.mode = 'safe';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('keeps a tool on Ask when the person declines Always Allow in the host dialog', async () => {
    host.invoke.mockImplementation(
      (command: string) => answerReads(command) ?? Promise.reject(DECLINED),
    );
    const select = await policySelect();

    fireEvent.change(select, { target: { value: 'always_allow' } });

    await waitFor(() => expect(host.toastError).toHaveBeenCalledWith(DECLINED));
    expect(host.invoke).toHaveBeenCalledWith('set_tool_approval_policy', {
      toolName: 'file_read',
      policy: 'always_allow',
    });
    expect(select.value).toBe('ask');
    expect(host.toastSuccess).not.toHaveBeenCalled();
  });

  it('shows Always Allow only once the host has accepted it', async () => {
    host.invoke.mockImplementation(
      (command: string) => answerReads(command) ?? Promise.resolve(null),
    );
    const select = await policySelect();

    fireEvent.change(select, { target: { value: 'always_allow' } });

    await waitFor(() => expect(select.value).toBe('always_allow'));
    expect(host.toastSuccess).toHaveBeenCalledWith('Policy updated for file_read');
  });

  it('leaves the mode and auto-approve as they were when a wider mode is declined', async () => {
    host.invoke.mockImplementation(
      (command: string) =>
        answerReads(command) ?? Promise.reject('You chose not to switch to Autopilot.'),
    );
    await policySelect();

    fireEvent.click(screen.getByRole('button', { name: /Autopilot/ }));

    await waitFor(() =>
      expect(host.toastError).toHaveBeenCalledWith('You chose not to switch to Autopilot.'),
    );
    expect(host.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('reads auto-approve back from the host after a mode change it accepted', async () => {
    host.invoke.mockImplementation((command: string) => {
      if (command === 'set_agent_mode') {
        host.mode = 'autopilot';
        host.autoApprove = true;
        return Promise.resolve(null);
      }
      return answerReads(command) ?? Promise.reject(`unexpected ${command}`);
    });
    await policySelect();

    fireEvent.click(screen.getByRole('button', { name: /Autopilot/ }));

    await waitFor(() =>
      expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true'),
    );
    expect(host.toastSuccess).toHaveBeenCalledWith('Agent mode set to autopilot');
  });
});
