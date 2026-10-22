import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { ChatsAndTasksList, formatListTime } from '../ChatsAndTasksList';

const NOW = new Date('2026-10-22T12:00:00Z').getTime();
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const state = vi.hoisted(() => ({
  push: vi.fn(),
  conversations: [] as Array<Record<string, unknown>>,
  isLoading: false,
  listError: null as string | null,
  hasMore: false,
  fetchConversations: vi.fn(),
  loadMoreConversations: vi.fn(),
  updateConversation: vi.fn<(id: string, updates: unknown) => Promise<boolean>>(),
  deleteConversation: vi.fn<(id: string) => Promise<boolean>>(),
  unread: new Set<string>(),
  toastError: vi.fn(),
}));

vi.mock('@shared/hooks/use-guarded-router', () => ({
  useGuardedRouter: () => ({ push: state.push }),
}));

vi.mock('@/lib/hooks/useConversations', () => ({
  useConversations: () => ({
    conversations: state.conversations,
    isLoading: state.isLoading,
    listError: state.listError,
    fetchConversations: state.fetchConversations,
    hasMoreConversations: state.hasMore,
    isLoadingMoreConversations: false,
    loadMoreConversations: state.loadMoreConversations,
    updateConversation: state.updateConversation,
    deleteConversation: state.deleteConversation,
  }),
}));

vi.mock('@shared/hooks/use-unread-conversations', () => ({
  useUnreadConversations: () => ({
    isUnread: (id: string) => state.unread.has(id),
    toggleUnread: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({ toast: { error: state.toastError } }));

function at(offsetMs: number): string {
  return new Date(NOW - offsetMs).toISOString();
}

function seed() {
  state.conversations = [
    { id: 'chat-old', title: 'Budget review', updatedAt: at(40 * DAY), createdAt: at(40 * DAY) },
    {
      id: 'task-recent',
      title: 'Compile vendor list',
      updatedAt: at(17 * MINUTE),
      createdAt: at(17 * MINUTE),
      workMode: 'agiwork',
      needsYou: true,
    },
    { id: 'chat-greeting', title: 'Greeting', updatedAt: at(DAY), createdAt: at(DAY) },
    {
      id: 'task-quiet',
      title: 'Draft launch email',
      updatedAt: at(21 * 60 * MINUTE),
      createdAt: at(21 * 60 * MINUTE),
    },
    {
      id: 'chat-archived',
      title: 'Archived thread',
      updatedAt: at(MINUTE),
      createdAt: at(MINUTE),
      isArchived: true,
    },
  ];
}

function rowTitles(): string[] {
  return within(screen.getByRole('list'))
    .getAllByRole('link')
    .map((link) => link.querySelector('span')?.firstChild?.textContent ?? '');
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  state.push.mockReset();
  state.isLoading = false;
  state.listError = null;
  state.hasMore = false;
  state.unread = new Set();
  state.updateConversation.mockReset().mockResolvedValue(true);
  state.deleteConversation.mockReset().mockResolvedValue(true);
  state.toastError.mockReset();
  state.fetchConversations.mockReset();
  seed();
  useChatStore.setState({
    workModeByConversation: { 'task-quiet': 'agiwork' },
    loadingConversationIds: [],
    streamingConversationIds: [],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Chats and tasks page', () => {
  it('heads the page and orders Select, Filter by and New in the header', () => {
    render(<ChatsAndTasksList />);

    expect(screen.getByRole('heading', { level: 1, name: 'Chats and tasks' })).toBeTruthy();
    const select = screen.getByRole('button', { name: 'Select' });
    const filter = screen.getByRole('button', { name: /Filter by All/ });
    const create = screen.getByRole('button', { name: 'New' });
    expect(select.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filter.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(create);
    expect(state.push).toHaveBeenCalledWith('/chat');
  });

  it('focuses the inline search on load', () => {
    render(<ChatsAndTasksList />);
    const search = screen.getByRole('searchbox', { name: 'Search chats and tasks' });
    expect(document.activeElement).toBe(search);
  });

  it('lists chats and tasks together, newest first, without archived ones', () => {
    render(<ChatsAndTasksList />);
    expect(rowTitles()).toEqual([
      'Compile vendor list',
      'Draft launch email',
      'Greeting',
      'Budget review',
    ]);
    expect(screen.queryByText('Archived thread')).toBeNull();
  });

  it('marks task rows with the task glyph name and an activity dot only when a task needs attention', () => {
    render(<ChatsAndTasksList />);

    const recent = screen.getByRole('link', { name: /Compile vendor list/ });
    expect(recent.textContent).toContain('AGI Work');
    expect(recent.textContent).toContain('Needs you');
    expect(screen.getByTestId('chats-activity-task-recent')).toBeTruthy();

    const quiet = screen.getByRole('link', { name: /Draft launch email/ });
    expect(quiet.textContent).toContain('AGI Work');
    expect(screen.queryByTestId('chats-activity-task-quiet')).toBeNull();

    const chat = screen.getByRole('link', { name: /Greeting/ });
    expect(chat.textContent).not.toContain('AGI Work');
    expect(chat.getAttribute('href')).toBe('/chat/chat-greeting');
  });

  it('shows relative times for the last week and a short date after that', () => {
    expect(formatListTime(at(17 * MINUTE), NOW)).toBe('17 minutes ago');
    expect(formatListTime(at(DAY), NOW)).toBe('yesterday');
    expect(formatListTime(at(40 * DAY), NOW)).toBe(
      new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
        new Date(at(40 * DAY)),
      ),
    );
    expect(formatListTime('not a date', NOW)).toBe('');
  });

  it('filters the list as the search changes', () => {
    render(<ChatsAndTasksList />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats and tasks' }), {
      target: { value: 'greet' },
    });
    expect(rowTitles()).toEqual(['Greeting']);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search chats and tasks' }), {
      target: { value: 'nothing like this' },
    });
    expect(screen.getByText('Nothing matches “nothing like this”.')).toBeTruthy();
  });

  it('filters by All, Chats or Tasks from the Filter by menu', async () => {
    render(<ChatsAndTasksList />);
    const trigger = screen.getByRole('button', { name: /Filter by All/ });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const menu = await screen.findByRole('menu');
    const options = within(menu)
      .getAllByRole('menuitemradio')
      .map((item) => item.textContent);
    expect(options).toEqual(['All', 'Chats', 'Tasks']);

    fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Tasks' }));
    await waitFor(() => expect(rowTitles()).toEqual(['Compile vendor list', 'Draft launch email']));
    expect(screen.getByRole('button', { name: /Filter by Tasks/ })).toBeTruthy();
  });

  it('opens a row through the router on a plain click', () => {
    render(<ChatsAndTasksList />);
    fireEvent.click(screen.getByRole('link', { name: /Greeting/ }));
    expect(state.push).toHaveBeenCalledWith('/chat/chat-greeting');
  });

  it('archives the selected rows in Select mode', async () => {
    render(<ChatsAndTasksList />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Greeting/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Budget review/ }));
    expect(screen.getByText('2 selected')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    });

    expect(state.updateConversation).toHaveBeenCalledWith('chat-greeting', { archived: true });
    expect(state.updateConversation).toHaveBeenCalledWith('chat-old', { archived: true });
    expect(screen.getByRole('button', { name: 'Select' })).toBeTruthy();
  });

  it('asks before deleting selected rows, naming that it cannot be undone', async () => {
    render(<ChatsAndTasksList />);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Greeting/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Budget review/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm.textContent).toContain('Delete 2 conversations?');
    expect(confirm.textContent).toContain('This cannot be undone.');
    expect(state.deleteConversation).not.toHaveBeenCalled();

    state.deleteConversation.mockResolvedValueOnce(false);
    await act(async () => {
      fireEvent.click(within(confirm).getByRole('button', { name: 'Delete conversations' }));
    });

    expect(state.deleteConversation).toHaveBeenCalledTimes(2);
    expect(state.toastError).toHaveBeenCalledWith('Could not delete 1 of 2 conversations');
  });

  it('says so when the account has nothing yet', () => {
    state.conversations = [];
    render(<ChatsAndTasksList />);
    expect(screen.getByText('No chats or tasks yet. Start one with New.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });

  it('shows loading and a retryable failure instead of an empty claim', () => {
    state.conversations = [];
    state.isLoading = true;
    const { rerender } = render(<ChatsAndTasksList />);
    expect(screen.getByText('Loading chats and tasks')).toBeTruthy();
    expect(screen.queryByText(/No chats or tasks yet/)).toBeNull();

    state.isLoading = false;
    state.listError = 'Network down';
    rerender(<ChatsAndTasksList />);
    expect(screen.getByText("Couldn't load your chats and tasks.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.fetchConversations).toHaveBeenCalledTimes(1);
  });

  it('loads the next page when more history exists', () => {
    state.hasMore = true;
    render(<ChatsAndTasksList />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(state.loadMoreConversations).toHaveBeenCalledTimes(1);
  });
});
