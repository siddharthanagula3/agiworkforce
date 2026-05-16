import { Check, ChevronRight, Loader2, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { useAgentTaskStore, type AgentTask } from '../../stores/agentTaskStore';

type OutputStatus = 'queued' | 'running' | 'done';

function taskToOutputStatus(t: AgentTask): OutputStatus {
  if (t.status === 'running' || t.status === 'recovering') return 'running';
  if (t.status === 'completed') return 'done';
  return 'queued';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

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

function StatusChip({ status }: { status: OutputStatus }) {
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-teal-400">
        <Loader2 size={11} className="animate-spin" />
        Running
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
        <Check size={11} strokeWidth={2.6} />
        Done
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-white/35">
      <Clock size={11} />
      Queued
    </span>
  );
}

export function CoworkDispatch() {
  const [acceptTasks, setAcceptTasks] = useState(true);
  const [requireConfirm, setRequireConfirm] = useState(true);

  const { tasks, fetchTasks } = useAgentTaskStore((s) => ({
    tasks: s.tasks,
    fetchTasks: s.fetchTasks,
  }));

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const recentOutputs = [...tasks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl font-medium text-white/90">Dispatch</h1>
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs font-medium text-teal-400">
            Beta
          </span>
        </div>
        <p className="text-sm text-white/40">
          Send tasks from your phone, run them on this Mac. Outputs land in Live artifacts.
        </p>

        {/* Mobile CTA */}
        <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/8 text-white/50">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="6" y="2" width="12" height="20" rx="3" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white/90">Send from anywhere</div>
            <div className="mt-0.5 text-xs text-white/40 leading-relaxed">
              Dispatch a task from the mobile app, your wrist, or a shortcut. This Mac picks it up,
              runs it, returns the artifact.
            </div>
          </div>
          <button
            type="button"
            className="flex-shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 hover:text-white/90"
          >
            Get mobile app
          </button>
        </div>

        {/* Settings */}
        <div className="space-y-1">
          {[
            {
              on: acceptTasks,
              toggle: () => setAcceptTasks((v) => !v),
              title: 'Accept dispatched tasks',
              desc: "When off, your phone won't be able to dispatch work here.",
            },
            {
              on: requireConfirm,
              toggle: () => setRequireConfirm((v) => !v),
              title: 'Require confirmation for writes',
              desc: 'Anything that sends mail, runs SQL, or deploys waits for your tap.',
            },
          ].map((s, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5"
            >
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-white/90">{s.title}</div>
                <div className="text-xs text-white/40">{s.desc}</div>
              </div>
              <IosToggle on={s.on} onToggle={s.toggle} />
            </div>
          ))}
        </div>

        {/* Outputs feed */}
        <div className="space-y-3">
          <h2 className="font-serif text-base font-medium text-white/80">Outputs</h2>
          {recentOutputs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/30">
              No task outputs yet. Dispatch a task from the mobile app to get started.
            </div>
          ) : (
            <div className="space-y-1">
              {recentOutputs.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="flex-shrink-0 w-20">
                    <StatusChip status={taskToOutputStatus(o)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/85">{o.goal}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-white/35">
                      <span>{timeAgo(o.createdAt)}</span>
                    </div>
                  </div>
                  <button type="button" className="flex-shrink-0 text-white/20 hover:text-white/60">
                    <ChevronRight size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
