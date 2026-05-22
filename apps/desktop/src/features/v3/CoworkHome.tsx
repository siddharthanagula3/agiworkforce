import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useAgentTaskStore, type AgentTaskStatus } from '../../stores/agentTaskStore';

type TaskStatus = 'running' | 'pending' | 'done' | 'blocked';

interface OnboardingItem {
  title: string;
  desc: string;
  done: boolean;
}

function agentStatusToCowork(status: AgentTaskStatus): TaskStatus {
  if (status === 'running' || status === 'recovering') return 'running';
  if (status === 'pending' || status === 'paused') return 'pending';
  if (status === 'completed') return 'done';
  return 'blocked';
}

import type { TFunction } from 'i18next';

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

function buildOnboarding(t: TFunction): OnboardingItem[] {
  return [
    {
      title: t('cowork.home.onboarding.startTitle'),
      desc: t('cowork.home.onboarding.startDesc'),
      done: true,
    },
    {
      title: t('cowork.home.onboarding.connectTitle'),
      desc: t('cowork.home.onboarding.connectDesc'),
      done: false,
    },
    {
      title: t('cowork.home.onboarding.scheduleTitle'),
      desc: t('cowork.home.onboarding.scheduleDesc'),
      done: false,
    },
    {
      title: t('cowork.home.onboarding.phoneTitle'),
      desc: t('cowork.home.onboarding.phoneDesc'),
      done: false,
    },
  ];
}

function StatusDot({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        'mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full',
        status === 'running' && 'bg-teal-400 shadow-[0_0_4px_1px_rgba(32,128,141,0.7)]',
        status === 'pending' && 'bg-slate-400',
        status === 'done' && 'bg-emerald-400',
        status === 'blocked' && 'bg-red-400',
      )}
    />
  );
}

export function CoworkHome() {
  const { t } = useTranslation('v3');
  const [onboarding, setOnboarding] = useState<OnboardingItem[]>(() => buildOnboarding(t));
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [draft, setDraft] = useState('');

  const { tasks, fetchTasks, submitGoal, loading } = useAgentTaskStore((s) => ({
    tasks: s.tasks,
    fetchTasks: s.fetchTasks,
    submitGoal: s.submitGoal,
    loading: s.loading,
  }));

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const activeTasks = tasks
    .filter((t) => t.status === 'running' || t.status === 'recovering')
    .slice(0, 5);
  const pendingTasks = tasks
    .filter((t) => t.status === 'pending' || t.status === 'paused')
    .slice(0, 1);

  function markDone(i: number) {
    setOnboarding((prev) => prev.map((o, idx) => (idx === i ? { ...o, done: true } : o)));
  }

  async function handleStartTask() {
    const goal = draft.trim();
    if (!goal) return;
    setDraft('');
    await submitGoal(goal);
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
        {/* Hero */}
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-medium text-white/90">
            {t('cowork.home.headline')}
          </h1>
          <a
            href="#"
            className="text-sm text-teal-400 hover:underline"
            onClick={(e) => e.preventDefault()}
          >
            {t('cowork.home.learnLink')}
          </a>
        </div>

        {/* Composer shell */}
        <div className="space-y-2">
          <div className="relative rounded-xl border border-white/10 bg-white/5 shadow-sm">
            <textarea
              className="w-full resize-none bg-transparent px-4 pt-3 pb-10 text-sm text-white placeholder-white/30 outline-none"
              placeholder={t('cowork.home.placeholder')}
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-400 disabled:opacity-40"
                disabled={!draft.trim() || loading}
                onClick={() => void handleStartTask()}
              >
                {t('cowork.home.startTask')}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 pl-1 text-xs text-white/30">
            <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono">⌘</kbd>
            <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono">↩</kbd>
            <span>{t('cowork.home.kbdHint')}</span>
          </div>
        </div>

        {/* Active task list */}
        {(activeTasks.length > 0 || pendingTasks.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                {t('cowork.home.active')}
              </span>
            </div>
            <div className="space-y-1">
              {[...activeTasks, ...pendingTasks].map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
                >
                  <StatusDot status={agentStatusToCowork(task.status)} />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/85">{task.goal}</div>
                    <div className="mt-0.5 text-xs text-white/35">
                      {task.status === 'pending' ? t('common.queued') : timeAgo(task.createdAt, t)}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Onboarding checklist — static UI hint copy, not from store */}
        {showOnboarding && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                {t('cowork.home.onboardingTitle')}
              </span>
              <button
                type="button"
                className="text-xs text-white/30 hover:text-white/60"
                onClick={() => setShowOnboarding(false)}
              >
                {t('common.hide')}
              </button>
            </div>
            <div className="space-y-1">
              {onboarding.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
                  onClick={() => markDone(i)}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border',
                      o.done
                        ? 'border-teal-500 bg-teal-500 text-white'
                        : 'border-white/20 bg-transparent',
                    )}
                  >
                    {o.done && <Check size={10} strokeWidth={3} />}
                  </span>
                  <div className={cn('min-w-0', o.done && 'opacity-50')}>
                    <div className="text-sm text-white/85">{o.title}</div>
                    <div className="mt-0.5 text-xs text-white/35">{o.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
