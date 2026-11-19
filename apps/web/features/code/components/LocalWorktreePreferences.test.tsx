import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostPreferencesState } from '@agiworkforce/local-runtime-contract';

const host = {
  readPreferences: vi.fn<() => Promise<HostPreferencesState>>(),
  writePreferences: vi.fn<(patch: object) => Promise<HostPreferencesState>>(),
};
let hostPresent = true;
vi.mock('@/features/desktop-host', () => ({
  useDesktopHost: () => (hostPresent ? host : null),
}));

const { LocalWorktreePreferences } = await import('./LocalWorktreePreferences');

function state(preferences: Partial<HostPreferencesState['preferences']>): HostPreferencesState {
  return {
    preferences: preferences as HostPreferencesState['preferences'],
    shortcutStatus: {},
  } as HostPreferencesState;
}

function renderPreferences() {
  return render(
    <LocalWorktreePreferences headingClassName="h" fieldClassName="f" buttonClassName="b" />,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  hostPresent = true;
});

describe('worktree location and branch prefix', () => {
  it('shows nothing for a shell that does not know these preferences', async () => {
    host.readPreferences.mockResolvedValue(state({}));
    const { container } = renderPreferences();
    await act(async () => undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it('asks the shell to open its folder picker and to restore the default', async () => {
    host.readPreferences.mockResolvedValue(
      state({ worktreeLocation: '/Users/me/wt', worktreeBranchPrefix: 'agi/' }),
    );
    host.writePreferences
      .mockResolvedValueOnce(
        state({ worktreeLocation: '/Users/me/picked', worktreeBranchPrefix: 'agi/' }),
      )
      .mockResolvedValueOnce(state({ worktreeLocation: '', worktreeBranchPrefix: 'agi/' }));
    renderPreferences();
    await act(async () => undefined);
    expect(screen.getByText('/Users/me/wt')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Change…' }));
    });
    expect(host.writePreferences).toHaveBeenLastCalledWith({ worktreeLocation: 'choose' });
    expect(screen.getByText('/Users/me/picked')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Use default' }));
    });
    expect(host.writePreferences).toHaveBeenLastCalledWith({ worktreeLocation: '' });
  });

  it('saves a valid prefix and blocks one git would refuse', async () => {
    host.readPreferences.mockResolvedValue(
      state({ worktreeLocation: '', worktreeBranchPrefix: 'agi/' }),
    );
    host.writePreferences.mockResolvedValue(
      state({ worktreeLocation: '', worktreeBranchPrefix: 'team/' }),
    );
    renderPreferences();
    await act(async () => undefined);

    const field = screen.getByLabelText('Branch prefix');
    fireEvent.change(field, { target: { value: '../x' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(field).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(field, { target: { value: 'team/' } });
    expect(screen.getByText(/for example team\/fix-sign-in/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(host.writePreferences).toHaveBeenCalledWith({ worktreeBranchPrefix: 'team/' });
    expect(screen.getByRole('status')).toHaveTextContent('Branch prefix saved.');
  });
});
