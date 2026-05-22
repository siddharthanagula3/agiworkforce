import { CalendarClock, Loader2, Plus, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type ScheduledTask,
  type TaskStatus,
  useSchedulerStore,
} from '../../stores/schedulerStore';
import { cn } from '../../lib/utils';
import { CreateTaskModal } from './CreateTaskModal';
import { ScheduledTaskCard } from './ScheduledTaskCard';

type FilterTab = 'all' | TaskStatus;

const FILTER_TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
];

const EXAMPLE_TASKS: Array<{ name: string; prompt: string; emoji: string }> = [
  {
    emoji: '📰',
    name: 'Daily news summary',
    prompt:
      'Summarize the top 5 AI and technology news stories from today. Format as bullet points with a one-sentence description each.',
  },
  {
    emoji: '📊',
    name: 'Weekly productivity report',
    prompt:
      'Create a brief weekly productivity report template. Include sections: wins this week, blockers, goals for next week.',
  },
  {
    emoji: '🌅',
    name: 'Morning briefing',
    prompt:
      'Give me an energizing morning briefing. Include a motivational quote, 3 focus tips for today, and a reminder to stay hydrated.',
  },
];

export function ScheduledTasksPanel() {
  const tasks = useSchedulerStore((s) => s.tasks);
  const isLoading = useSchedulerStore((s) => s.isLoading);
  const fetchTasks = useSchedulerStore((s) => s.fetchTasks);
  const createTask = useSchedulerStore((s) => s.createTask);

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);

  // Fetch tasks on mount
  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const filteredTasks = useMemo(() => {
    if (activeFilter === 'all') return tasks;
    return tasks.filter((t) => t.status === activeFilter);
  }, [tasks, activeFilter]);

  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = {
      all: tasks.length,
      active: tasks.filter((t) => t.status === 'active').length,
      paused: tasks.filter((t) => t.status === 'paused').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
    };
    return counts;
  }, [tasks]);

  const handleOpenCreate = useCallback(() => {
    setEditingTask(null);
    setIsModalOpen(true);
  }, []);

  const handleEdit = useCallback((task: ScheduledTask) => {
    setEditingTask(task);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingTask(null);
  }, []);

  const handleUseExample = useCallback(
    async (example: (typeof EXAMPLE_TASKS)[number]) => {
      await createTask({
        name: example.name,
        description: '',
        prompt: example.prompt,
        schedule: { type: 'recurring', interval: 'daily' },
        status: 'active',
      });
    },
    [createTask],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-white">Scheduled Tasks</h3>
          {tasks.length > 0 && (
            <span className="rounded-full bg-teal-500/20 px-1.5 py-0.5 text-xs font-medium text-teal-300">
              {tasks.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-teal-500"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Task
        </button>
      </div>

      {/* Filter tabs */}
      {tasks.length > 0 && (
        <div className="flex gap-0 border-b border-white/5 px-2">
          {FILTER_TABS.map((tab) => {
            const count = tabCounts[tab.id];
            if (tab.id !== 'all' && count === 0) return null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  'px-3 py-2 text-xs font-medium transition',
                  activeFilter === tab.id
                    ? 'border-b-2 border-teal-500 text-teal-400'
                    : 'text-slate-500 hover:text-slate-300',
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'ml-1.5 rounded-full px-1 py-0.5 text-xs',
                      activeFilter === tab.id
                        ? 'bg-teal-500/20 text-teal-300'
                        : 'bg-white/5 text-slate-500',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading tasks...
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            onCreate={handleOpenCreate}
            onUseExample={(ex) => void handleUseExample(ex)}
          />
        ) : filteredTasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">No {activeFilter} tasks.</div>
        ) : (
          <div className="space-y-2 p-3">
            {filteredTasks.map((task) => (
              <ScheduledTaskCard key={task.id} task={task} onEdit={handleEdit} />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <CreateTaskModal isOpen={isModalOpen} editingTask={editingTask} onClose={handleCloseModal} />
    </div>
  );
}

// ─── Empty State ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  onCreate: () => void;
  onUseExample: (ex: (typeof EXAMPLE_TASKS)[number]) => void;
}

function EmptyState({ onCreate, onUseExample }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10">
        <CalendarClock className="h-6 w-6 text-teal-400" />
      </div>
      <h4 className="mb-1 text-sm font-semibold text-white">No scheduled tasks</h4>
      <p className="mb-5 max-w-xs text-xs text-slate-500">
        Create recurring AI tasks that run automatically — like ChatGPT Tasks, but for any model.
      </p>

      <button
        type="button"
        onClick={onCreate}
        className="mb-6 flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
      >
        <Plus className="h-4 w-4" />
        Create your first task
      </button>

      {/* Example suggestions */}
      <div className="w-full">
        <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Sparkles className="h-3 w-3" />
          Try one of these
        </div>
        <div className="space-y-2">
          {EXAMPLE_TASKS.map((ex) => (
            <button
              key={ex.name}
              type="button"
              onClick={() => onUseExample(ex)}
              className="flex w-full items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-white/10 hover:bg-white/[0.06]"
            >
              <span className="text-lg">{ex.emoji}</span>
              <div>
                <div className="text-sm font-medium text-slate-200">{ex.name}</div>
                <div className="mt-0.5 line-clamp-1 text-xs text-slate-500">{ex.prompt}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
