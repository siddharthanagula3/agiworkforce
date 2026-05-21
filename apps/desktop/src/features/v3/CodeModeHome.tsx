import { Check, Folder, GitBranch, Monitor } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

type StatRange = 'All' | '30d' | '7d';

const STATS_ALL = {
  sessions: '612',
  messages: '697,587',
  tokens: '134.6M',
  activeDays: '70',
  currentStreak: '0d',
  longestStreak: '18d',
  peakHour: '2 AM',
  favorite: 'Opus 4.7',
};

const STATS_30D = {
  sessions: '48',
  messages: '21,340',
  tokens: '12.1M',
  activeDays: '28',
  currentStreak: '0d',
  longestStreak: '9d',
  peakHour: '11 PM',
  favorite: 'Sonnet 4.6',
};

const STATS_7D = {
  sessions: '8',
  messages: '3,421',
  tokens: '2.4M',
  activeDays: '5',
  currentStreak: '0d',
  longestStreak: '3d',
  peakHour: '1 AM',
  favorite: 'Opus 4.7',
};

const STATS_MAP: Record<StatRange, typeof STATS_ALL> = {
  All: STATS_ALL,
  '30d': STATS_30D,
  '7d': STATS_7D,
};

function Heatmap() {
  const grid = useMemo(
    () =>
      Array.from({ length: 16 }, () =>
        Array.from({ length: 7 }, () => (Math.random() < 0.45 ? Math.floor(Math.random() * 4) : 0)),
      ),
    [],
  );

  return (
    <div className="flex gap-1">
      {grid.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((v, ri) => (
            <div
              key={ri}
              className={cn(
                'h-2.5 w-2.5 rounded-sm',
                v === 0 && 'bg-white/5',
                v === 1 && 'bg-teal-600/40',
                v === 2 && 'bg-teal-500/60',
                v === 3 && 'bg-teal-400/80',
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CodeModeHome() {
  const [range, setRange] = useState<StatRange>('All');
  const [statsTab, setStatsTab] = useState<'Overview' | 'Models'>('Overview');
  const [draft, setDraft] = useState('');
  const stats = STATS_MAP[range];

  const statRows = [
    { lbl: 'Sessions', val: stats.sessions },
    { lbl: 'Messages', val: stats.messages },
    { lbl: 'Total tokens', val: stats.tokens },
    { lbl: 'Active days', val: stats.activeDays },
    { lbl: 'Current streak', val: stats.currentStreak },
    { lbl: 'Longest streak', val: stats.longestStreak },
    { lbl: 'Peak hour', val: stats.peakHour },
    { lbl: 'Favorite', val: stats.favorite },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-8">
        {/* Hero */}
        <h1 className="font-serif text-2xl font-medium text-white/90">
          What&apos;s on the agenda for agiworkforce?
        </h1>

        {/* Session stats card */}
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          {/* Tabs header */}
          <div className="flex items-center justify-between border-b border-white/8 px-4 pt-3 pb-0">
            <div className="flex items-end gap-4">
              {(['Overview', 'Models'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatsTab(tab)}
                  className={cn(
                    'pb-2.5 text-sm transition-colors',
                    statsTab === tab
                      ? 'border-b-2 border-teal-400 font-medium text-white/90'
                      : 'text-white/35 hover:text-white/60',
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 pb-2">
              {(['All', '30d', '7d'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs transition-colors',
                    range === r ? 'bg-white/10 text-white/90' : 'text-white/35 hover:text-white/60',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {statsTab === 'Overview' && (
              <>
                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-3">
                  {statRows.map(({ lbl, val }) => (
                    <div key={lbl} className="space-y-0.5">
                      <div className="text-xs text-white/35">{lbl}</div>
                      <div className="text-sm font-semibold text-white/90 tabular-nums">{val}</div>
                    </div>
                  ))}
                </div>

                {/* Heatmap */}
                <Heatmap />

                {/* Fun fact */}
                <div className="text-xs text-white/30 italic">
                  You&apos;ve used <strong className="text-white/50">~6,119×</strong> more tokens
                  than <em>The Little Prince</em>.
                </div>
              </>
            )}

            {statsTab === 'Models' && (
              <div className="space-y-2 py-2 text-xs text-white/40">
                <div className="flex justify-between">
                  <span>Opus 4.7</span>
                  <div className="flex items-center gap-3">
                    <span>62%</span>
                    <div className="h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-[62%] rounded-full bg-teal-500" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>Sonnet 4.6</span>
                  <div className="flex items-center gap-3">
                    <span>28%</span>
                    <div className="h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-[28%] rounded-full bg-teal-500/60" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span>Other</span>
                  <div className="flex items-center gap-3">
                    <span>10%</span>
                    <div className="h-1.5 w-24 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-[10%] rounded-full bg-teal-500/30" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Code context + composer */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/50 hover:bg-white/8"
            >
              <Monitor size={11} />
              Local
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/50 hover:bg-white/8"
            >
              <Folder size={11} />
              agiworkforce
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/50 hover:bg-white/8"
            >
              <GitBranch size={11} />
              main
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/8 px-2.5 py-1 text-xs text-teal-400 hover:bg-teal-500/12"
            >
              <Check size={11} strokeWidth={2.6} />
              worktree
            </button>
          </div>

          <div className="relative rounded-xl border border-white/10 bg-white/5">
            <textarea
              className="w-full resize-none bg-transparent px-4 pt-3 pb-10 text-sm text-white placeholder-white/30 outline-none"
              placeholder="Describe a task or ask a question"
              rows={3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="absolute bottom-3 right-3">
              <button
                type="button"
                className="rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-400 disabled:opacity-40"
                disabled={!draft.trim()}
              >
                Start
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-1 text-xs text-white/25">
            <span className="font-medium text-white/40">Auto</span>
            <span>·</span>
            <span>Opus 4.7 · 1M · Max</span>
          </div>
        </div>
      </div>
    </div>
  );
}
