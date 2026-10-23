import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const store = vi.hoisted(() => ({
  facts: [] as Array<{ id: string; text: string; projectId?: string; pending?: boolean }>,
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  hydrateFromServer: vi.fn(async () => undefined),
}));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => ({
  ...(await importOriginal<UnifiedChatModule>()),
  useMemoryStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

import { ProjectMemoryPanel } from '../ProjectMemoryPanel';

type UnifiedChatModule = typeof import('@agiworkforce/unified-chat');

beforeEach(() => {
  vi.clearAllMocks();
  store.facts = [
    { id: 'fact-1', text: 'Targets the EU market.', projectId: 'project-1' },
    { id: 'fact-2', text: 'Belongs elsewhere.', projectId: 'project-2' },
  ];
  store.update.mockResolvedValue(undefined);
});

function renderPanel() {
  return render(<ProjectMemoryPanel projectId="project-1" projectName="Launch" />);
}

describe('ProjectMemoryPanel editing', () => {
  it('lists only this project memories, each with edit and delete', () => {
    renderPanel();

    expect(screen.getByText('Targets the EU market.')).toBeVisible();
    expect(screen.queryByText('Belongs elsewhere.')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Delete project memory: Targets the EU market.' }),
    ).toBeEnabled();
  });

  it('saves the edited text through the memory store', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    );
    const field = screen.getByRole('textbox', {
      name: 'Edit project memory: Targets the EU market.',
    });
    await user.clear(field);
    await user.type(field, '  Targets the EU and UK markets.  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(store.update).toHaveBeenCalledWith('fact-1', 'Targets the EU and UK markets.');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('does not save an empty memory and cancels without writing', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    );
    await user.clear(
      screen.getByRole('textbox', { name: 'Edit project memory: Targets the EU market.' }),
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(store.update).not.toHaveBeenCalled();
    expect(screen.getByText('Targets the EU market.')).toBeVisible();
  });

  it('says so when the edit could not be saved', async () => {
    store.update.mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole('button', { name: 'Edit project memory: Targets the EU market.' }),
    );
    await user.type(
      screen.getByRole('textbox', { name: 'Edit project memory: Targets the EU market.' }),
      ' Also the UK.',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
  });

  it('disables editing a memory that is still saving', () => {
    store.facts = [{ id: 'fact-1', text: 'Pending.', projectId: 'project-1', pending: true }];
    renderPanel();

    expect(screen.getByRole('button', { name: 'Edit project memory: Pending.' })).toBeDisabled();
  });
});
