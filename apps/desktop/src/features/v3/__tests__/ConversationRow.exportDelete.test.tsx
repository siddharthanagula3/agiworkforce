import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportConversation: vi.fn(),
  privacyMode: 'local' as 'local' | 'managed',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'sidebar.actions.more': 'More options',
          'sidebar.actions.pin': 'Pin',
          'sidebar.actions.rename': 'Rename',
          'sidebar.actions.archive': 'Archive',
          'sidebar.actions.delete': 'Delete',
        }) as Record<string, string>
      )[key] ?? key,
  }),
}));

vi.mock('../../../stores/appModeStore', async (importOriginal) => {
  const actual = await importOriginal<AppmodestoreModule>();
  return {
    ...actual,
    selectPrivacyMode: (state: { privacyMode: string }) => state.privacyMode,
    useAppModeStore: Object.assign(
      (selector: (state: unknown) => unknown) => selector({ privacyMode: mocks.privacyMode }),
      actual.useAppModeStore,
    ),
  };
});

vi.mock('../../chat/conversationExport', async (importOriginal) => {
  const actual = await importOriginal<ConversationexportModule>();
  return { ...actual, exportConversation: mocks.exportConversation };
});

import { ConversationRow } from '../ConversationRow';

type AppmodestoreModule = typeof import('../../../stores/appModeStore');
type ConversationexportModule = typeof import('../../chat/conversationExport');

function renderRow(onDelete = vi.fn()) {
  render(
    <ConversationRow
      conversation={{
        id: 'chat-1',
        title: 'Budget review',
        pinned: false,
        archived: false,
        lastMessage: '',
        updatedAt: new Date('2026-10-01T10:00:00Z'),
        executionMode: 'local_only',
      }}
      active
      onSelect={vi.fn()}
      onRename={vi.fn()}
      onDelete={onDelete}
      onTogglePin={vi.fn()}
      onArchive={vi.fn()}
      onRestore={vi.fn()}
      projects={[]}
      onMoveToProject={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  return onDelete;
}

describe('ConversationRow export and delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privacyMode = 'local';
  });

  afterEach(() => cleanup());

  it('exports a Local chat as Markdown or PDF from the row menu', async () => {
    const user = userEvent.setup();
    renderRow();

    await user.click(screen.getByRole('menuitem', { name: 'Export as PDF' }));

    expect(mocks.exportConversation).toHaveBeenCalledWith('chat-1', 'pdf');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('offers only Markdown for a Managed Cloud chat', () => {
    mocks.privacyMode = 'managed';
    renderRow();

    expect(screen.getByRole('menuitem', { name: 'Export as Markdown' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Export as PDF' })).not.toBeInTheDocument();
  });

  it('asks before deleting and names what is lost', async () => {
    const user = userEvent.setup();
    const onDelete = renderRow();

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(onDelete).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Budget review');
    expect(dialog).toHaveTextContent('all of its messages will be permanently removed');

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete chat' }),
    );
    expect(onDelete).toHaveBeenCalledWith('chat-1');
  });
});
