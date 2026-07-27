/**
 * TodoList — Inline tool result renderer for the `todo_write` tool.
 *
 * Displays a structured task list with status icons (pending, in-progress,
 * completed) and a progress counter. Listens for real-time `todo:update`
 * events emitted by the Rust backend so the list stays up to date as the
 * agent progresses through multi-step work.
 */

import { useEffect, useState } from 'react';
import { listen } from '@/lib/tauri-mock';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { ToolResultProps } from './index';

interface TodoItem {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface TodoUpdatePayload {
  todos: TodoItem[];
}

export const TodoList: React.FC<ToolResultProps> = ({ result, status }) => {
  // Seed from the tool result data when available
  const initialTodos = (() => {
    if (!result?.data) return [];
    const data = result.data as Record<string, unknown>;
    const todosArr = data['todos'];
    if (Array.isArray(todosArr)) {
      return todosArr as TodoItem[];
    }
    return [];
  })();

  const [todos, setTodos] = useState<TodoItem[]>(initialTodos);

  // Keep state in sync when the result prop changes (e.g. tool completes)
  useEffect(() => {
    if (!result?.data) return;
    const data = result.data as Record<string, unknown>;
    const todosArr = data['todos'];
    if (Array.isArray(todosArr) && todosArr.length > 0) {
      setTodos(todosArr as TodoItem[]);
    }
  }, [result?.data]);

  // Listen for real-time updates from the Rust backend
  useEffect(() => {
    const unlisten = listen<TodoUpdatePayload>('todo:update', (event) => {
      if (Array.isArray(event.payload.todos)) {
        setTodos(event.payload.todos);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const statusIcon = (itemStatus: string) => {
    switch (itemStatus) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 shrink-0 text-blue-500 animate-spin" />;
      default:
        return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
    }
  };

  if (status === 'running' && todos.length === 0) {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-muted-foreground">Creating task list...</span>
      </div>
    );
  }

  if (todos.length === 0) return null;

  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const totalCount = todos.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="mt-3 rounded-lg border border-border/50 bg-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">Task Progress</h4>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{totalCount} completed
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500 transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ul className="space-y-1.5">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-center gap-2 text-sm">
            {statusIcon(todo.status)}
            <span
              className={
                todo.status === 'completed'
                  ? 'line-through text-muted-foreground'
                  : 'text-foreground'
              }
            >
              {todo.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
