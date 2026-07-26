import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StartupRecoveryScreen, type StartupRecoveryInfo } from './StartupRecoveryScreen';

const recoveryInfo: StartupRecoveryInfo = {
  code: 'DB_UNLOCK',
  title: 'AGI could not unlock local data',
  message: 'The database could not be opened with a verified key.',
  dataPreserved: true,
};

function renderScreen(overrides: Partial<Parameters<typeof StartupRecoveryScreen>[0]> = {}) {
  const props = {
    info: recoveryInfo,
    onRetry: vi.fn().mockResolvedValue(undefined),
    onOpenDataFolder: vi.fn().mockResolvedValue(undefined),
    onExportDiagnostics: vi.fn().mockResolvedValue(true),
    onQuit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<StartupRecoveryScreen {...props} />);
  return props;
}

describe('StartupRecoveryScreen', () => {
  it('shows a complete, non-destructive recovery path instead of a blank window', () => {
    renderScreen();

    expect(
      screen.getByRole('heading', { name: 'AGI could not unlock local data' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Your local data is preserved')).toBeInTheDocument();
    expect(
      screen.getByText('Your database was not deleted, reset, renamed, or replaced.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open Data Folder' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Export Diagnostics' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Quit AGI' })).toBeEnabled();
  });

  it('wires all recovery actions and reports a successful sanitized export', async () => {
    const user = userEvent.setup();
    const props = renderScreen();

    await user.click(screen.getByRole('button', { name: 'Open Data Folder' }));
    expect(props.onOpenDataFolder).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Export Diagnostics' }));
    expect(props.onExportDiagnostics).toHaveBeenCalledOnce();
    expect(screen.getByText('Sanitized diagnostics exported successfully.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Quit AGI' }));
    expect(props.onQuit).toHaveBeenCalledOnce();
  });

  it('does not expose native action errors to the recovery screen', async () => {
    const user = userEvent.setup();
    renderScreen({
      onExportDiagnostics: vi
        .fn()
        .mockRejectedValue(new Error('/Users/private-user keychain token=super-secret')),
    });

    await user.click(screen.getByRole('button', { name: 'Export Diagnostics' }));

    expect(
      screen.getByText('That action could not be completed. Please try again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/private-user|super-secret|keychain token/i)).not.toBeInTheDocument();
  });
});
