import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  storage: 'local-vault' as const,
  get: vi.fn(),
  set: vi.fn(),
  list: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  getConnectorPermissionStore: () => store,
}));

import { ConnectorDetailView } from '../ConnectorDetailView';
import type { ConnectorDef } from '../connectorDefinitions';

const connector = {
  id: 'gmail',
  name: 'Gmail',
  description: 'Read and send mail',
} as ConnectorDef;

const tools = [
  { name: 'read_mail', description: 'Read a message', destructive: false },
  { name: 'delete_mail', description: 'Delete a message', destructive: true },
];

const UNREADABLE_LINE =
  /Your saved connector choices could not be read, so every connector is blocked until\s+this is fixed\./;

function unreadable(unlockMayFix = false) {
  return {
    store: { state: 'unreadable', reason: 'no available key opens this store', unlockMayFix },
    permissions: [],
  };
}

function renderView() {
  render(<ConnectorDetailView connector={connector} tools={tools} onBack={() => {}} />);
}

describe('a connector permissions store that cannot be read', () => {
  beforeEach(() => {
    store.get.mockReset();
    store.set.mockReset();
    store.list.mockReset();
    store.reset.mockReset();
  });

  afterEach(() => cleanup());

  it('shows neither the line nor the action while the store reads', async () => {
    store.list.mockResolvedValue({
      store: { state: 'ok' },
      permissions: [{ toolName: 'read_mail', level: 'always-allow', destructive: false }],
    });
    renderView();

    expect(await screen.findByLabelText('Permission for read_mail')).toBeInTheDocument();
    expect(screen.queryByText(UNREADABLE_LINE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset connector permissions' }),
    ).not.toBeInTheDocument();
  });

  it('shows neither when nothing has been saved yet', async () => {
    store.list.mockResolvedValue({ store: { state: 'missing' }, permissions: [] });
    renderView();

    expect(await screen.findByLabelText('Permission for delete_mail')).toBeInTheDocument();
    expect(screen.queryByText(UNREADABLE_LINE)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset connector permissions' }),
    ).not.toBeInTheDocument();
  });

  it('says every connector is blocked and offers the reset, without tool rows that would mislead', async () => {
    store.list.mockResolvedValue(unreadable());
    renderView();

    expect(await screen.findByText(UNREADABLE_LINE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset connector permissions' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Permission for read_mail')).not.toBeInTheDocument();
    expect(screen.queryByText(/Unlock your saved keys/)).not.toBeInTheDocument();
  });

  it('asks for an unlock, and offers no reset, while a locked vault may hold the choices', async () => {
    store.list.mockResolvedValue(unreadable(true));
    renderView();

    expect(await screen.findByText(UNREADABLE_LINE)).toBeInTheDocument();
    expect(
      screen.getByText(/Unlock your saved keys in Settings, under Privacy: an earlier version/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reset connector permissions' }),
    ).not.toBeInTheDocument();
    expect(store.reset).not.toHaveBeenCalled();
  });

  it('resets only after the consequence is confirmed, then lists the fresh store', async () => {
    store.list.mockResolvedValueOnce(unreadable());
    store.list.mockResolvedValue({ store: { state: 'ok' }, permissions: [] });
    store.reset.mockResolvedValue({
      reset: true,
      keptAs: 'connector-permissions.unreadable-20261011T123456789Z.json',
    });
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: 'Reset connector permissions' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(store.reset).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent('All saved allow and block choices, for every connector');
    expect(dialog).toHaveTextContent('Each connector tool then asks before it runs');
    expect(dialog).toHaveTextContent('The old file is kept beside the new one under a new name');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset connector permissions' }));

    await waitFor(() => expect(store.reset).toHaveBeenCalledTimes(1));
    expect(await screen.findByLabelText('Permission for read_mail')).toBeInTheDocument();
    expect(screen.queryByText(UNREADABLE_LINE)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'The old file was kept as connector-permissions.unreadable-20261011T123456789Z.json.',
    );
    expect(store.list).toHaveBeenCalledTimes(2);
  });

  it('changes nothing when the confirmation is cancelled', async () => {
    store.list.mockResolvedValue(unreadable());
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: 'Reset connector permissions' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(store.reset).not.toHaveBeenCalled();
    expect(screen.getByText(UNREADABLE_LINE)).toBeInTheDocument();
  });

  it('says so when the reset itself fails, and keeps offering it', async () => {
    store.list.mockResolvedValue(unreadable());
    store.reset.mockRejectedValue(new Error('could not be moved aside, so nothing was changed'));
    renderView();

    fireEvent.click(await screen.findByRole('button', { name: 'Reset connector permissions' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset connector permissions' }));

    expect(
      await screen.findByText(/Connector permissions were not reset: could not be moved aside/),
    ).toBeInTheDocument();
    expect(screen.getByText(UNREADABLE_LINE)).toBeInTheDocument();
  });
});
