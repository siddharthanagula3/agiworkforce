import { ChevronDown, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '../../lib/utils';
import {
  useSchedulerStore,
  getScheduleSummary,
  getRelativeTimeDisplay,
  type ScheduledTask,
} from '../../stores/schedulerStore';

function IosToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={cn(
        'relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none',
        on ? 'bg-teal-500' : 'bg-white/20',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          on ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function getKeepAwake(): boolean {
  try {
    return localStorage.getItem('cowork-keep-awake') !== 'false';
  } catch {
    return true;
  }
}

function setKeepAwakePref(v: boolean): void {
  try {
    localStorage.setItem('cowork-keep-awake', v ? 'true' : 'false');
  } catch {
    // ignore
  }
}

function isTaskOn(t: ScheduledTask): boolean {
  return t.status === 'active';
}

function nextRunDisplay(t: ScheduledTask): string {
  if (t.status !== 'active') return getRelativeTimeDisplay(t.lastRunAt);
  return getRelativeTimeDisplay(t.nextRunAt);
}

export function CoworkScheduled() {
  const { tasks, isLoading, fetchTasks, toggleTask, deleteTask } = useSchedulerStore((s) => ({
    tasks: s.tasks,
    isLoading: s.isLoading,
    fetchTasks: s.fetchTasks,
    toggleTask: s.toggleTask,
    deleteTask: s.deleteTask,
  }));

  const keepAwake = getKeepAwake();

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-xl font-medium text-white/90">Scheduled tasks</h1>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-400"
          >
            <Plus size={13} strokeWidth={2.4} />
            Schedule new task
          </button>
        </div>

        {/* Keep-Mac-awake banner */}
        <div className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5">
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-white/90">
              Keep this Mac awake for scheduled tasks
            </div>
            <div className="text-xs text-white/40">
              When on, uses caffeinate to prevent sleep during scheduled runs. Plug in for long
              tasks.
            </div>
          </div>
          <IosToggle on={keepAwake} onToggle={() => setKeepAwakePref(!keepAwake)} />
        </div>

        {/* Task list */}
        {isLoading && tasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/30">Loading scheduled tasks...</div>
        ) : (
          <div className="space-y-1">
            {tasks.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3',
                  !isTaskOn(t) && 'opacity-60',
                )}
              >
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/8 text-white/50">
                  <RefreshCw size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white/90">{t.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/40">
                    <span>{getScheduleSummary(t.schedule)}</span>
                  </div>
                </div>

                <div className="flex flex-shrink-0 flex-col items-end text-xs text-white/35">
                  <span className="text-white/25">{isTaskOn(t) ? 'Next run' : 'Paused'}</span>
                  <span className="text-white/60">{nextRunDisplay(t)}</span>
                </div>

                <IosToggle on={isTaskOn(t)} onToggle={() => void toggleTask(t.id)} />

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded text-white/30 hover:text-white/70"
                    title="Options"
                  >
                    <ChevronDown size={13} />
                  </button>
                  <button
                    type="button"
                    className="flex h-6 w-6 items-center justify-center rounded text-white/30 hover:text-red-400"
                    title="Delete"
                    onClick={() => void deleteTask(t.id)}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}

            {tasks.length === 0 && !isLoading && (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/30">
                No scheduled tasks yet. Click &ldquo;Schedule new task&rdquo; to get started.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
