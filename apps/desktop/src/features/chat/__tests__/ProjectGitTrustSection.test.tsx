import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../../lib/tauri-mock', () => ({
  invoke: host.invoke,
  isTauri: true,
}));

vi.mock('sonner', () => ({
  toast: { success: host.toastSuccess, error: host.toastError },
}));

import { ProjectGitTrustSection } from '../ProjectGitTrustSection';

const PROJECT_PATH = '/Users/someone/code/app';

function askToTrust() {
  render(<ProjectGitTrustSection projectPath={PROJECT_PATH} />);
  fireEvent.click(screen.getByRole('button', { name: 'Trust this project’s git settings' }));
}

describe('ProjectGitTrustSection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('explains which settings are refused and that trusted ones leave the sandbox', () => {
    render(<ProjectGitTrustSection projectPath={PROJECT_PATH} />);

    expect(screen.getByText('~/code/app')).toBeTruthy();
    expect(
      screen.getByText(/filters, diff drivers and config hooks, unless they were there/),
    ).toBeTruthy();
    expect(screen.getByText(/Trusted settings run outside the sandbox\./)).toBeTruthy();
    expect(screen.getByText(/a system dialog lists each setting and asks you/)).toBeTruthy();
  });

  it('leaves the question to the host and draws no confirmation of its own', async () => {
    host.invoke.mockResolvedValue([]);
    askToTrust();

    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(host.invoke).toHaveBeenCalledTimes(1));
  });

  it('says nothing was trusted when the person declines the host dialog', async () => {
    host.invoke.mockRejectedValue(
      'You chose not to trust the git settings in /Users/someone/code/app.',
    );
    askToTrust();

    await waitFor(() =>
      expect(host.toastError).toHaveBeenCalledWith('The git settings were not trusted', {
        description: 'You chose not to trust the git settings in /Users/someone/code/app.',
      }),
    );
    expect(host.toastSuccess).not.toHaveBeenCalled();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Trust this project’s git settings' })
        .disabled,
    ).toBe(false);
  });

  it('trusts through the host command and lists what was trusted', async () => {
    host.invoke.mockResolvedValue([
      {
        key: 'filter.lfs.smudge',
        value: 'git-lfs smudge -- %f',
        origin: '/Users/someone/code/app/.git/config',
      },
      { key: 'diff.custom.textconv', value: 'hexdump -C', origin: 'command line' },
    ]);
    askToTrust();

    await waitFor(() => expect(host.toastSuccess).toHaveBeenCalled());
    expect(host.invoke).toHaveBeenCalledWith('git_trust_repository_config', {
      projectPath: PROJECT_PATH,
    });
    const [title, options] = host.toastSuccess.mock.calls[0] as [
      string,
      { description: ReactElement },
    ];
    expect(title).toBe('Trusted 2 git settings');
    render(options.description);
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'filter.lfs.smudge = git-lfs smudge -- %f (/Users/someone/code/app/.git/config)',
      'diff.custom.textconv = hexdump -C (command line)',
    ]);
  });

  it('says so when the repository has no settings that run programs', async () => {
    host.invoke.mockResolvedValue([]);
    askToTrust();

    await waitFor(() =>
      expect(host.toastSuccess).toHaveBeenCalledWith(
        'No git settings in this repository run programs',
      ),
    );
  });

  it('reports a refusal from the host instead of claiming success', async () => {
    host.invoke.mockRejectedValue('not a git repository');
    askToTrust();

    await waitFor(() =>
      expect(host.toastError).toHaveBeenCalledWith('The git settings were not trusted', {
        description: 'not a git repository',
      }),
    );
    expect(host.toastSuccess).not.toHaveBeenCalled();
  });
});
