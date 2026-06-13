import { Check, Loader2, Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { cn } from '../../lib/utils';
import { useAgentTaskStore, type AgentTask } from '../../stores/agentTaskStore';

type OutputStatus = 'queued' | 'running' | 'done';

function taskToOutputStatus(task: AgentTask): OutputStatus {
  if (task.status === 'running' || task.status === 'recovering') return 'running';
  if (task.status === 'completed') return 'done';
  return 'queued';
}

function timeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return t('time.justNow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.minAgo', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hAgo', { count: h });
  return t('time.dAgo', { count: Math.floor(h / 24) });
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
        on ? 'bg-[var(--chat-accent-secondary)]' : 'bg-[var(--chat-border-strong)]',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 rounded-full bg-[var(--chat-surface-elevated)] shadow transition-transform',
          on ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function StatusChip({ status }: { status: OutputStatus }) {
  const { t } = useTranslation('v3');
  if (status === 'running') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--chat-accent-secondary)]">
        <Loader2 size={11} className="animate-spin" />
        {t('common.running')}
      </span>
    );
  }
  if (status === 'done') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--chat-success)]">
        <Check size={11} strokeWidth={2.6} />
        {t('common.done')}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-[var(--chat-text-muted)]">
      <Clock size={11} />
      {t('common.queued')}
    </span>
  );
}

export function AgiWorkDispatch() {
  const { t } = useTranslation('v3');
  const [acceptTasks, setAcceptTasks] = useState(true);
  const [requireConfirm, setRequireConfirm] = useState(true);

  const tasks = useAgentTaskStore((s) => s.tasks);
  const fetchTasks = useAgentTaskStore((s) => s.fetchTasks);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const recentOutputs = [...tasks]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 10);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--chat-border-strong)]">
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="font-serif text-xl font-medium text-[var(--chat-text-primary)]">
            {t('agiWork.dispatch.title')}
          </h1>
          <span className="rounded-full bg-[var(--chat-accent-secondary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--chat-accent-secondary)]">
            {t('common.beta')}
          </span>
        </div>
        <p className="text-sm text-[var(--chat-text-secondary)]">
          {t('agiWork.dispatch.subtitle')}
        </p>

        {/* Mobile CTA */}
        <div className="flex items-center gap-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--chat-surface-hover)] text-[var(--chat-text-secondary)]">
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
            <div className="text-sm font-medium text-[var(--chat-text-primary)]">
              {t('agiWork.dispatch.sendFromAnywhere')}
            </div>
            <div className="mt-0.5 text-xs text-[var(--chat-text-secondary)] leading-relaxed">
              {t('agiWork.dispatch.sendFromAnywhereDesc')}
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="space-y-1">
          {[
            {
              on: acceptTasks,
              toggle: () => setAcceptTasks((v) => !v),
              title: t('agiWork.dispatch.acceptTasks'),
              desc: t('agiWork.dispatch.acceptTasksDesc'),
            },
            {
              on: requireConfirm,
              toggle: () => setRequireConfirm((v) => !v),
              title: t('agiWork.dispatch.requireConfirm'),
              desc: t('agiWork.dispatch.requireConfirmDesc'),
            },
          ].map((s, i) => (
            <div
              key={i}
              className="flex items-start justify-between gap-4 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-3.5"
            >
              <div className="space-y-0.5">
                <div className="text-sm font-medium text-[var(--chat-text-primary)]">{s.title}</div>
                <div className="text-xs text-[var(--chat-text-secondary)]">{s.desc}</div>
              </div>
              <IosToggle on={s.on} onToggle={s.toggle} />
            </div>
          ))}
        </div>

        {/* Outputs feed */}
        <div className="space-y-3">
          <h2 className="font-serif text-base font-medium text-[var(--chat-text-primary)]">
            {t('agiWork.dispatch.outputs')}
          </h2>
          {recentOutputs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--chat-border)] px-4 py-6 text-center text-sm text-[var(--chat-text-muted)]">
              {t('agiWork.dispatch.noOutputs')}
            </div>
          ) : (
            <div className="space-y-1">
              {recentOutputs.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-4 py-3"
                >
                  <div className="flex-shrink-0 w-20">
                    <StatusChip status={taskToOutputStatus(o)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-[var(--chat-text-primary)]">{o.goal}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--chat-text-muted)]">
                      <span>{timeAgo(o.createdAt, t)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
