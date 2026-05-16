import { ChevronDown, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';

interface ScheduledTask {
  id: string;
  name: string;
  freq: string;
  project?: string;
  on: boolean;
  next: string;
  lastRun: string;
}

const SCHEDULED_TASKS: ScheduledTask[] = [
  {
    id: 's1',
    name: 'Sales pipeline digest',
    freq: 'Every weekday 8 AM',
    project: 'Sales pipeline',
    on: true,
    next: 'Tomorrow 8:00 AM',
    lastRun: 'Today 8:02 AM',
  },
  {
    id: 's2',
    name: 'Support ticket triage',
    freq: 'Every 2h',
    project: 'Customer support',
    on: true,
    next: 'In 45 min',
    lastRun: '2h ago',
  },
  {
    id: 's3',
    name: 'Investor weekly digest',
    freq: 'Every Monday 7 AM',
    project: 'Investor digest',
    on: false,
    next: 'Mon 7:00 AM',
    lastRun: 'Mon 7:04 AM',
  },
  {
    id: 's4',
    name: 'Hiring brief prep',
    freq: 'On demand',
    project: 'Hiring loop',
    on: true,
    next: '—',
    lastRun: '3 days ago',
  },
];

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

export function CoworkScheduled() {
  const [keepAwake, setKeepAwake] = useState(true);
  const [tasks, setTasks] = useState<ScheduledTask[]>(SCHEDULED_TASKS);

  function toggleTask(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, on: !t.on } : t)));
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

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
          <IosToggle on={keepAwake} onToggle={() => setKeepAwake((v) => !v)} />
        </div>

        {/* Task list */}
        <div className="space-y-1">
          {tasks.map((t) => (
            <div
              key={t.id}
              className={cn(
                'group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3',
                !t.on && 'opacity-60',
              )}
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/8 text-white/50">
                <RefreshCw size={13} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-white/90">{t.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/40">
                  <span>{t.freq}</span>
                  {t.project && (
                    <>
                      <span className="text-white/20">·</span>
                      <span>{t.project}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-shrink-0 flex-col items-end text-xs text-white/35">
                <span className="text-white/25">{t.on ? 'Next run' : 'Paused'}</span>
                <span className="text-white/60">{t.on ? t.next : t.lastRun}</span>
              </div>

              <IosToggle on={t.on} onToggle={() => toggleTask(t.id)} />

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
                  onClick={() => deleteTask(t.id)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/30">
              No scheduled tasks yet. Click &ldquo;Schedule new task&rdquo; to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
