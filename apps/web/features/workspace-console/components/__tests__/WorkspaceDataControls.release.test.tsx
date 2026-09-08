import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useLegalHolds: vi.fn(),
  useCreateLegalHold: vi.fn(),
  useReleaseLegalHold: vi.fn(),
  releaseMutate: vi.fn(),
}));

vi.mock('../../hooks/use-legal-holds', () => ({
  useLegalHolds: mocks.useLegalHolds,
  useCreateLegalHold: mocks.useCreateLegalHold,
  useReleaseLegalHold: mocks.useReleaseLegalHold,
}));

import { WorkspaceDataControls } from '../WorkspaceDataControls';

const HOLD_ID = 'hold-1';

function hold(overrides: Record<string, unknown> = {}) {
  return {
    id: HOLD_ID,
    name: 'Acme litigation',
    scope: 'organization',
    subjectUserId: null,
    reason: 'Counsel asked for it',
    createdAt: '2026-08-01T00:00:00.000Z',
    releasedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useLegalHolds.mockReturnValue({
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    data: { holds: [hold()], sweeps: [] },
  });
  mocks.useCreateLegalHold.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
  mocks.useReleaseLegalHold.mockReturnValue({
    mutate: mocks.releaseMutate,
    isPending: false,
    isError: false,
    error: null,
  });
});

describe('releasing a legal hold asks first, and names what it costs', () => {
  it('does not release on the click that asks', async () => {
    const user = userEvent.setup();
    render(<WorkspaceDataControls />);

    await user.click(screen.getByRole('button', { name: 'Release hold' }));

    expect(mocks.releaseMutate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Acme litigation');
    expect(dialog).toHaveTextContent(/retention sweep/);
    expect(dialog).toHaveTextContent(/cannot be undone/);
  });

  it('does not release on a double click either, which the old two-step did', async () => {
    const user = userEvent.setup();
    render(<WorkspaceDataControls />);

    const release = screen.getByRole('button', { name: 'Release hold' });
    await user.dblClick(release);

    expect(mocks.releaseMutate).not.toHaveBeenCalled();
  });

  it('releases only after the dialog is confirmed', async () => {
    const user = userEvent.setup();
    render(<WorkspaceDataControls />);

    await user.click(screen.getByRole('button', { name: 'Release hold' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Release hold' }));

    await waitFor(() =>
      expect(mocks.releaseMutate).toHaveBeenCalledWith(HOLD_ID, expect.anything()),
    );
  });

  it('keeps the hold when the dialog is dismissed', async () => {
    const user = userEvent.setup();
    render(<WorkspaceDataControls />);

    await user.click(screen.getByRole('button', { name: 'Release hold' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Keep hold' }));

    expect(mocks.releaseMutate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });

  it('names the member when the hold is scoped to one', async () => {
    mocks.useLegalHolds.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: {
        holds: [hold({ scope: 'member', subjectUserId: 'user_42', name: 'One member' })],
        sweeps: [],
      },
    });
    const user = userEvent.setup();
    render(<WorkspaceDataControls />);

    await user.click(screen.getByRole('button', { name: 'Release hold' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('user_42');
  });

  it('offers no release control on a hold that is already released', () => {
    mocks.useLegalHolds.mockReturnValue({
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      data: { holds: [hold({ releasedAt: '2026-08-05T00:00:00.000Z' })], sweeps: [] },
    });
    render(<WorkspaceDataControls />);

    expect(screen.queryByRole('button', { name: 'Release hold' })).toBeNull();
  });
});
