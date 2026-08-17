import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const preferences = vi.hoisted(() => ({
  fetchPreferenceNamespace: vi.fn(),
  savePreferenceNamespace: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => preferences);

import { ToolApprovalDefaultsPanel } from './ToolApprovalDefaultsPanel';

describe('ToolApprovalDefaultsPanel', () => {
  beforeEach(() => {
    preferences.fetchPreferenceNamespace.mockReset();
    preferences.savePreferenceNamespace.mockReset();
    preferences.savePreferenceNamespace.mockResolvedValue(undefined);
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
});
