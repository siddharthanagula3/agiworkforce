import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const preferences = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
  readAutonomousToolApprovalsAllowed: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => preferences);

import { ToolApprovalDefaultsPanel } from './ToolApprovalDefaultsPanel';

const SKIP_APPROVALS = /Skip approvals/i;

describe('ToolApprovalDefaultsPanel', () => {
  beforeEach(() => {
    preferences.fetchPreferenceNamespace.mockReset();
    preferences.savePreferenceNamespace.mockReset();
    preferences.readAutonomousToolApprovalsAllowed.mockReset();
    preferences.savePreferenceNamespace.mockResolvedValue(undefined);
    preferences.readAutonomousToolApprovalsAllowed.mockResolvedValue(true);
  });

  it('shows the fail-closed default when the account has never chosen one', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });

    render(<ToolApprovalDefaultsPanel />);

    expect(preferences.fetchPreferenceNamespace).toHaveBeenCalledWith('tool-approvals', {
      defaultPolicy: 'ask_every_time',
    });
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Ask before every action/i })).toBeChecked(),
    );
    expect(
      screen.getByRole('radio', { name: /Run read-only actions without asking/i }),
    ).not.toBeChecked();
  });

  it('persists the account-wide default when the user opts into read-only auto-approval', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });

    render(<ToolApprovalDefaultsPanel />);
    await userEvent.click(
      await screen.findByRole('radio', { name: /Run read-only actions without asking/i }),
    );

    await waitFor(() =>
      expect(preferences.savePreferenceNamespace).toHaveBeenCalledWith('tool-approvals', {
        defaultPolicy: 'auto_approve_read_only',
      }),
    );
  });

  it('restores the previous choice when the save fails', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });
    preferences.savePreferenceNamespace.mockRejectedValue(new Error('offline'));

    render(<ToolApprovalDefaultsPanel />);
    await userEvent.click(
      await screen.findByRole('radio', { name: /Run read-only actions without asking/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: /Ask before every action/i })).toBeChecked(),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Save failed: offline');
  });

  it('persists the autonomous default where the workspace permits it', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });

    render(<ToolApprovalDefaultsPanel />);
    const skip = await screen.findByRole('radio', { name: SKIP_APPROVALS });
    await waitFor(() => expect(skip).toBeEnabled());
    await userEvent.click(skip);

    await waitFor(() =>
      expect(preferences.savePreferenceNamespace).toHaveBeenCalledWith('tool-approvals', {
        defaultPolicy: 'autonomous',
      }),
    );
  });

  it('offers the autonomous option as unavailable when the workspace forbids it', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });
    preferences.readAutonomousToolApprovalsAllowed.mockResolvedValue(false);

    render(<ToolApprovalDefaultsPanel />);
    const skip = await screen.findByRole('radio', { name: SKIP_APPROVALS });

    await waitFor(() => expect(skip).toBeDisabled());
    expect(screen.getByText(/workspace does not allow skipping approvals/i)).toBeInTheDocument();
    await userEvent.click(skip);
    expect(preferences.savePreferenceNamespace).not.toHaveBeenCalled();
  });

  it('leaves the option off when the workspace answer cannot be read', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });
    preferences.readAutonomousToolApprovalsAllowed.mockRejectedValue(new Error('offline'));

    render(<ToolApprovalDefaultsPanel />);

    await waitFor(() => expect(screen.getByRole('radio', { name: SKIP_APPROVALS })).toBeDisabled());
  });

  it('marks the fail-closed policy as the default in the list', async () => {
    preferences.fetchPreferenceNamespace.mockResolvedValue({ defaultPolicy: 'ask_every_time' });

    render(<ToolApprovalDefaultsPanel />);

    expect(
      await screen.findByRole('radio', { name: /Ask before every action\s*Default/i }),
    ).toBeInTheDocument();
  });
});
