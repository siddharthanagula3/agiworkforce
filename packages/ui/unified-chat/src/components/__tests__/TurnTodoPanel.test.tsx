import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readTodoWriteItems, TurnTodoPanel, useTurnTodoStore } from '../TurnTodoPanel';

describe('readTodoWriteItems', () => {
  it('ignores every tool but todo_write', () => {
    expect(readTodoWriteItems('file_read', { todos: [] })).toBeNull();
  });

  it('reads titles from title, description or content and defaults the status', () => {
    expect(
      readTodoWriteItems('todo_write', {
        todos: [
          { title: 'One' },
          { description: 'Two', status: 'in_progress' },
          { content: 'Three', status: 'completed', id: 'c' },
          { title: '   ' },
          { title: 'Four', status: 'unknown' },
        ],
      }),
    ).toEqual([
      { id: 'todo-0', title: 'One', status: 'pending' },
      { id: 'todo-1', title: 'Two', status: 'in_progress' },
      { id: 'c', title: 'Three', status: 'completed' },
      { id: 'todo-4', title: 'Four', status: 'pending' },
    ]);
  });

  it('reads an empty list as a cleared plan', () => {
    expect(readTodoWriteItems('todo_write', { todos: [] })).toEqual([]);
  });
});

describe('TurnTodoPanel', () => {
  beforeEach(() => {
    useTurnTodoStore.setState({ byConversation: {} });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing without a task list', () => {
    const { container } = render(<TurnTodoPanel conversationId="conv-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the list with progress for the conversation only', () => {
    useTurnTodoStore.getState().setTodos('conv-1', [
      { id: 'a', title: 'Read the code', status: 'completed' },
      { id: 'b', title: 'Write the fix', status: 'in_progress' },
    ]);
    useTurnTodoStore
      .getState()
      .setTodos('conv-2', [{ id: 'z', title: 'Other chat', status: 'pending' }]);

    render(<TurnTodoPanel conversationId="conv-1" />);

    expect(screen.getByText('1 of 2 done')).toBeTruthy();
    expect(screen.getByText('Write the fix')).toBeTruthy();
    expect(screen.queryByText('Other chat')).toBeNull();
  });
});
