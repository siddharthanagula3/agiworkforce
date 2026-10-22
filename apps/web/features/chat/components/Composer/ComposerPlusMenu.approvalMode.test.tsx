import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_APPROVAL_POLICY_OPTIONS, type ToolApprovalPolicy } from '@agiworkforce/types';
import { ComposerApprovalModeControl } from './ComposerPlusMenu';

const preferences = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  readAutonomousToolApprovalsAllowed: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));
vi.mock('@/app/settings/_lib/preferences-client', () => preferences);

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError } }));

function option(policy: ToolApprovalPolicy) {
  const found = TOOL_APPROVAL_POLICY_OPTIONS.find((entry) => entry.policy === policy);
  if (!found) throw new Error(`no option for ${policy}`);
  return found;
}

function stored(policy: ToolApprovalPolicy, autonomyAllowed: boolean) {
  preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: policy });
  preferences.readAutonomousToolApprovalsAllowed.mockResolvedValue(autonomyAllowed);
}

async function trigger() {
  const button = await screen.findByTestId('composer-approval-mode');
  await waitFor(() => expect(button).not.toBeDisabled());
  return button;
}

describe('ComposerApprovalModeControl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preferences.savePreferenceNamespace.mockResolvedValue({ ok: true });
  });

  it('shows the account policy the workspace allows', async () => {
    stored('autonomous', true);
    render(<ComposerApprovalModeControl />);

    const button = await trigger();
    expect(button).toHaveAccessibleName(`Tool approvals: ${option('autonomous').label}`);
    expect(button).toHaveTextContent(option('autonomous').shortLabel);
  });

  it('falls back to asking and offers no Skip when the workspace forbids it', async () => {
    stored('autonomous', false);
    const user = userEvent.setup();
    render(<ComposerApprovalModeControl />);

    const button = await trigger();
    expect(button).toHaveTextContent(option('ask_every_time').shortLabel);
    await user.click(button);

    expect(await screen.findByText(option('auto_approve_read_only').label)).toBeVisible();
    expect(screen.queryByText(option('autonomous').label)).toBeNull();
  });

  it('saves the chosen policy to the account', async () => {
    stored('ask_every_time', true);
    const user = userEvent.setup();
    render(<ComposerApprovalModeControl />);

    await user.click(await trigger());
    await user.click(await screen.findByText(option('auto_approve_read_only').label));

    expect(preferences.savePreferenceNamespace).toHaveBeenCalledWith('tool-approvals', {
      defaultPolicy: 'auto_approve_read_only',
    });
    await waitFor(() =>
      expect(screen.getByTestId('composer-approval-mode')).toHaveTextContent(
        option('auto_approve_read_only').shortLabel,
      ),
    );
  });

  it('puts the previous policy back and says so when the save fails', async () => {
    stored('ask_every_time', true);
    preferences.savePreferenceNamespace.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<ComposerApprovalModeControl />);

    await user.click(await trigger());
    await user.click(await screen.findByText(option('autonomous').label));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(screen.getByTestId('composer-approval-mode')).toHaveTextContent(
      option('ask_every_time').shortLabel,
    );
  });

  it('renders nothing when the account policy cannot be read', async () => {
    preferences.fetchPreferenceNamespace.mockRejectedValue(new Error('offline'));
    preferences.readAutonomousToolApprovalsAllowed.mockResolvedValue(true);
    render(<ComposerApprovalModeControl />);

    await waitFor(() => expect(screen.queryByTestId('composer-approval-mode')).toBeNull());
  });
});
