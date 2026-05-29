import { Check, Folder, GitBranch, Monitor } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';

type StatRange = 'All' | '30d' | '7d';

// Honest empty state. This screen is not yet wired to a real session-stats source;
// it previously shipped fabricated numbers + a Math.random heatmap. Until the stats
// backend is wired, every range renders an explicit "no data" placeholder.
const EMPTY_STATS = {
  sessions: '—',
  messages: '—',
  tokens: '—',
  activeDays: '—',
  currentStreak: '—',
  longestStreak: '—',
  peakHour: '—',
  favorite: '—',
};

const STATS_MAP: Record<StatRange, typeof EMPTY_STATS> = {
  All: EMPTY_STATS,
  '30d': EMPTY_STATS,
  '7d': EMPTY_STATS,
};

function Heatmap() {
  // No activity data source yet — render an empty grid rather than random activity.
  const grid = useMemo(
    () => Array.from({ length: 16 }, () => Array.from({ length: 7 }, () => 0)),
    [],
  );

  return (
    <div className="flex gap-1">
      {grid.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((_v, ri) => (
            <div key={ri} className="h-2.5 w-2.5 rounded-sm bg-white/5" />
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
              </>
            )}

            {statsTab === 'Models' && (
              <div className="py-4 text-center text-xs text-white/35">
                No model usage recorded yet.
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
