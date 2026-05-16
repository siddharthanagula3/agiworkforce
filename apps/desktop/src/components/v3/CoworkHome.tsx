import { Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/utils';

type TaskStatus = 'running' | 'pending' | 'done' | 'blocked';

interface CoworkTask {
  id: string;
  title: string;
  status: TaskStatus;
  ago: string;
  proj?: string;
}

interface OnboardingItem {
  title: string;
  desc: string;
  done: boolean;
}

const COWORK_TASKS: CoworkTask[] = [
  {
    id: 't1',
    title: 'Summarize investor updates and flag blockers',
    status: 'running',
    ago: '2 min ago',
    proj: 'Investor digest',
  },
  {
    id: 't2',
    title: 'Triage incoming support tickets by priority',
    status: 'running',
    ago: '8 min ago',
    proj: 'Customer support',
  },
  {
    id: 't3',
    title: 'Draft follow-up email to Series A prospects',
    status: 'pending',
    ago: 'Queued',
  },
];

const COWORK_ONBOARDING: OnboardingItem[] = [
  {
    title: 'Start your first task',
    desc: 'Describe a recurring work job above and let your AI team handle it.',
    done: true,
  },
  {
    title: 'Connect a project',
    desc: 'Link a project to give tasks context — emails, docs, CRM, repo.',
    done: false,
  },
  {
    title: 'Schedule a recurring task',
    desc: 'Run tasks automatically on a cron schedule, even while you sleep.',
    done: false,
  },
  {
    title: 'Send a task from your phone',
    desc: 'Install the mobile app and dispatch work from anywhere via Dispatch.',
    done: false,
  },
];

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
  const [onboarding, setOnboarding] = useState(COWORK_ONBOARDING);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [draft, setDraft] = useState('');

  const active = COWORK_TASKS.filter((t) => t.status === 'running');
  const pending = COWORK_TASKS.filter((t) => t.status === 'pending').slice(0, 1);

  function markDone(i: number) {
    setOnboarding((prev) => prev.map((o, idx) => (idx === i ? { ...o, done: true } : o)));
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-2xl space-y-8 px-6 py-10">
        {/* Hero */}
        <div className="space-y-1">
          <h1 className="font-serif text-2xl font-medium text-white/90">
            Let&apos;s knock something off your list
          </h1>
          <a
            href="#"
            className="text-sm text-teal-400 hover:underline"
            onClick={(e) => e.preventDefault()}
          >
            Learn how to use Cowork safely.
          </a>
        </div>

        {/* Composer shell */}
        <div className="space-y-2">
          <div className="relative rounded-xl border border-white/10 bg-white/5 shadow-sm">
            <textarea
              className="w-full resize-none bg-transparent px-4 pt-3 pb-10 text-sm text-white placeholder-white/30 outline-none"
              placeholder="How can I help you today?"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-400 disabled:opacity-40"
                disabled={!draft.trim()}
              >
                Start task
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 pl-1 text-xs text-white/30">
            <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono">⌘</kbd>
            <kbd className="rounded border border-white/10 bg-white/5 px-1 font-mono">↩</kbd>
            <span>to start a task and keep going</span>
          </div>
        </div>

        {/* Active task list */}
        {(active.length > 0 || pending.length > 0) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Active
              </span>
              <button type="button" className="text-xs text-white/30 hover:text-white/60">
                Clear active
              </button>
            </div>
            <div className="space-y-1">
              {[...active, ...pending].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
                >
                  <StatusDot status={t.status} />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/85">{t.title}</div>
                    <div className="mt-0.5 text-xs text-white/35">
                      {t.ago}
                      {t.proj && <span> · {t.proj}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Onboarding checklist */}
        {showOnboarding && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Get to know Cowork
              </span>
              <button
                type="button"
                className="text-xs text-white/30 hover:text-white/60"
                onClick={() => setShowOnboarding(false)}
              >
                Hide
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
