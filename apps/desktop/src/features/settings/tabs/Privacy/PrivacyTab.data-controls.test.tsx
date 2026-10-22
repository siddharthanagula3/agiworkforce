import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { settings } from '@agiworkforce/desktop-command-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteLocalData, exportLocalData } from '@/api/privacy';
import { relaunchApp } from '@/lib/tauri-mock';
import { useAuthStore } from '../../../../stores/auth';
import { PrivacyTab } from './index';

vi.mock('@/lib/tauri-mock', () => ({
  isTauri: true,
  relaunchApp: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('@/api/privacy', () => ({
  exportLocalData: vi.fn(),
  deleteLocalData: vi.fn(),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/Users/test/Library/Application Support/agi'),
}));

vi.mock('@agiworkforce/desktop-command-client', () => ({
  settings: {
    settingsV2ClearCache: vi.fn().mockResolvedValue(undefined),
  },
  onboarding: {
    getUserPreference: vi.fn().mockResolvedValue(null),
    setUserPreference: vi.fn(),
  },
}));

vi.mock('../../MasterPasswordSettings', () => ({
  MasterPasswordSettings: () => <div>Master password settings</div>,
}));

vi.mock('../../Privacy/CloudDataSection', () => ({
  CloudDataSection: () => <div>Cloud data settings</div>,
}));

vi.mock('../../CacheManagement', () => ({
  CacheManagement: () => <div>Cache management</div>,
}));

vi.mock('../../AllowedDirectoriesSettings', () => ({
  AllowedDirectoriesSettings: () => <div>Allowed directories</div>,
}));

vi.mock('@/features/governance/SafetyPolicies', () => ({
  SafetyPolicies: () => <div>Safety policies</div>,
}));

describe('PrivacyTab export and delete on this device', () => {
  const signOut = vi.fn();

  beforeEach(() => {
    signOut.mockResolvedValue(undefined);
    useAuthStore.setState({ accessToken: null, refreshToken: null, signOut });
    localStorage.setItem('left-over', 'yes');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('says what the export holds and that secrets are left out', () => {
    render(<PrivacyTab scope="local" />);

    expect(
      screen.getByText(/conversations, memories, projects, settings and history/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /your schedules and\s+saved knowledge, app permissions and trusted workflows/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Passwords, API keys, tokens and sign-in sessions are left out/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Not in the file: attachments and generated files/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/a web address is saved without its sign-in details or query/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /what you approved or consented to\s+\(hooks, servers, tools and computer use\), the log of terminal commands/,
      ),
    ).toBeInTheDocument();
  });

  it('exports through the host and names the file the user saved', async () => {
    const user = userEvent.setup();
    vi.mocked(exportLocalData).mockResolvedValue('agi-workforce-export-2026-10-11.json');
    render(<PrivacyTab scope="local" />);

    await user.click(screen.getByRole('button', { name: 'Export data' }));

    expect(
      await screen.findByText('Saved as agi-workforce-export-2026-10-11.json.'),
    ).toHaveAttribute('role', 'status');
    expect(exportLocalData).toHaveBeenCalledOnce();
  });

  it('reports nothing saved when the save dialog is dismissed, and an error when it fails', async () => {
    const user = userEvent.setup();
    vi.mocked(exportLocalData).mockResolvedValueOnce(null);
    render(<PrivacyTab scope="local" />);

    await user.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(exportLocalData).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Saved as/)).not.toBeInTheDocument();

    vi.mocked(exportLocalData).mockRejectedValueOnce(new Error('Could not write the export'));
    await user.click(screen.getByRole('button', { name: 'Export data' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your data was not exported. Could not write the export',
    );
  });

  it('names what deleting removes and deletes nothing when the user cancels', async () => {
    const user = userEvent.setup();
    render(<PrivacyTab scope="local" />);

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete all data on this device?');
    expect(dialog).toHaveTextContent('every conversation, memory and project');
    expect(dialog).toHaveTextContent('your saved API keys and credentials');
    expect(dialog).toHaveTextContent(
      'the files AGI Desktop stored in its own data folders on this device, with its log of the terminal commands it ran',
    );
    expect(dialog).toHaveTextContent(
      'Not removed: installed extensions, downloaded speech models, the settings, hooks, skills and agents shared with the command-line tool, and temporary files',
    );
    expect(dialog).toHaveTextContent('None of it can be recovered');
    expect(dialog).toHaveTextContent('A Cloud account, if you have one, is not deleted');
    expect(dialog).toHaveTextContent('Manage Cloud privacy, under Cloud account data');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(deleteLocalData).not.toHaveBeenCalled();
    expect(relaunchApp).not.toHaveBeenCalled();
  });

  it('deletes, signs out, clears what the page kept and restarts the app', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    vi.mocked(deleteLocalData).mockImplementation(async () => {
      order.push('delete');
      return true;
    });
    signOut.mockImplementation(async () => {
      order.push('sign out');
    });
    vi.mocked(relaunchApp).mockImplementation(async () => {
      order.push('restart');
    });
    render(<PrivacyTab scope="local" />);

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete all data' }));

    await waitFor(() => expect(relaunchApp).toHaveBeenCalledOnce());
    expect(order).toEqual(['delete', 'sign out', 'restart']);
    expect(settings.settingsV2ClearCache).toHaveBeenCalledOnce();
    expect(localStorage.getItem('left-over')).toBeNull();
  });

  it('changes nothing when the system dialog is declined, and says so quietly', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteLocalData).mockResolvedValue(false);
    render(<PrivacyTab scope="local" />);

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Your system asks you once more before anything is deleted');
    await user.click(within(dialog).getByRole('button', { name: 'Delete all data' }));

    expect(await screen.findByText('Nothing was deleted.')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(settings.settingsV2ClearCache).not.toHaveBeenCalled();
    expect(relaunchApp).not.toHaveBeenCalled();
    expect(localStorage.getItem('left-over')).toBe('yes');
    expect(screen.getByRole('button', { name: 'Delete all data' })).toBeEnabled();
  });

  it('keeps the session and does not restart when the deletion fails', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteLocalData).mockRejectedValue(new Error('Failed to lock database'));
    render(<PrivacyTab scope="local" />);

    await user.click(screen.getByRole('button', { name: 'Delete all data' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete all data' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The deletion did not finish, and you can run it again. Failed to lock database',
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(relaunchApp).not.toHaveBeenCalled();
    expect(localStorage.getItem('left-over')).toBe('yes');
  });
});
