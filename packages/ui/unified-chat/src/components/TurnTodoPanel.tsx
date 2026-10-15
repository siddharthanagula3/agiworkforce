import { Check, Circle, CircleDot } from 'lucide-react';
import { create } from 'zustand';
import { useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';

export type TurnTodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TurnTodo {
  id: string;
  title: string;
  status: TurnTodoStatus;
}

interface TurnTodoStore {
  byConversation: Record<string, TurnTodo[]>;
  setTodos: (conversationId: string, todos: TurnTodo[]) => void;
  clear: (conversationId: string) => void;
}

export const useTurnTodoStore = create<TurnTodoStore>()((set) => ({
  byConversation: {},
  setTodos: (conversationId, todos) =>
    set((state) => ({ byConversation: { ...state.byConversation, [conversationId]: todos } })),
  clear: (conversationId) =>
    set((state) => {
      if (!state.byConversation[conversationId]) return state;
      const byConversation = { ...state.byConversation };
      delete byConversation[conversationId];
      return { byConversation };
    }),
}));

const TODO_WRITE_TOOL = 'todo_write';
const TODO_STATUSES = new Set<TurnTodoStatus>(['pending', 'in_progress', 'completed']);

/**
 * The list a `todo_write` call carries, or `null` for any other tool. The tool
 * replaces the whole list on every call, so the latest call is the plan.
 */
export function readTodoWriteItems(name: string, args: unknown): TurnTodo[] | null {
  if (name !== TODO_WRITE_TOOL || !args || typeof args !== 'object') return null;
  const raw = (args as Record<string, unknown>)['todos'];
  if (!Array.isArray(raw)) return null;
  const todos: TurnTodo[] = [];
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const record = entry as Record<string, unknown>;
    const title = [record['title'], record['description'], record['content']].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );
    if (!title) return;
    const status = TODO_STATUSES.has(record['status'] as TurnTodoStatus)
      ? (record['status'] as TurnTodoStatus)
      : 'pending';
    const id = typeof record['id'] === 'string' && record['id'] ? record['id'] : `todo-${index}`;
    todos.push({ id, title: title.trim(), status });
  });
  return todos;
}

export interface TurnTodoPanelProps {
  conversationId: string | null;
  className?: string;
}

export function TurnTodoPanel({ conversationId, className }: TurnTodoPanelProps) {
  const { t } = useUiTranslation('chat');
  const todos = useTurnTodoStore((state) =>
    conversationId ? state.byConversation[conversationId] : undefined,
  );
  if (!todos || todos.length === 0) return null;

  const done = todos.filter((todo) => todo.status === 'completed').length;

  return (
    <section
      aria-label={t('todos.label', 'Task list')}
      className={cn(
        'mb-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-2',
        className,
      )}
    >
      <p className="text-xs font-medium text-[var(--chat-text-secondary)]">
        {t('todos.progress', '{{done}} of {{total}} done', { done, total: todos.length })}
      </p>
      <ol className="mt-1.5 space-y-1">
        {todos.map((todo) => (
          <li key={todo.id} className="flex items-start gap-2 text-sm">
            {todo.status === 'completed' ? (
              <Check
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]"
              />
            ) : todo.status === 'in_progress' ? (
              <CircleDot
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chat-accent-primary-text)]"
              />
            ) : (
              <Circle
                aria-hidden="true"
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--chat-text-muted)]"
              />
            )}
            <span
              className={cn(
                'min-w-0 break-words',
                todo.status === 'completed'
                  ? 'text-[var(--chat-text-muted)] line-through'
                  : todo.status === 'in_progress'
                    ? 'font-medium text-[var(--chat-text-primary)]'
                    : 'text-[var(--chat-text-secondary)]',
              )}
            >
              <span className="sr-only">
                {todo.status === 'completed'
                  ? t('todos.statusDone', 'Done: ')
                  : todo.status === 'in_progress'
                    ? t('todos.statusActive', 'In progress: ')
                    : t('todos.statusPending', 'Not started: ')}
              </span>
              {todo.title}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
