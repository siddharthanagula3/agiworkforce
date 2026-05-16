import { Copy, ExternalLink, File, RefreshCw, Search, Table } from 'lucide-react';
import { cn } from '../../lib/utils';

type ArtifactKind = 'doc' | 'table' | 'kpi';
type ArtifactStatus = 'fresh' | 'stale';

interface LiveArtifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  source: string;
  updated: string;
}

const LIVE_ARTIFACTS: LiveArtifact[] = [
  {
    id: 'a1',
    title: 'Weekly sales pipeline digest',
    kind: 'doc',
    status: 'fresh',
    source: 'Sales pipeline / 2h ago',
    updated: '2h ago',
  },
  {
    id: 'a2',
    title: 'Support ticket priority matrix',
    kind: 'table',
    status: 'fresh',
    source: 'Customer support / 45 min ago',
    updated: '45 min ago',
  },
  {
    id: 'a3',
    title: 'Revenue KPI dashboard',
    kind: 'kpi',
    status: 'fresh',
    source: 'Sales pipeline / 2h ago',
    updated: '2h ago',
  },
  {
    id: 'a4',
    title: 'Investor update summary',
    kind: 'doc',
    status: 'stale',
    source: 'Investor digest / 6 days ago',
    updated: '6 days ago',
  },
  {
    id: 'a5',
    title: 'Candidate shortlist',
    kind: 'table',
    status: 'stale',
    source: 'Hiring loop / 3 days ago',
    updated: '3 days ago',
  },
  {
    id: 'a6',
    title: 'Contract risk flags',
    kind: 'doc',
    status: 'stale',
    source: 'Legal triage / 1 week ago',
    updated: '1 week ago',
  },
];

function KindIcon({ kind }: { kind: ArtifactKind }) {
  if (kind === 'table') return <Table size={13} />;
  if (kind === 'kpi') return <span className="text-xs font-bold">KPI</span>;
  return <File size={13} />;
}

export function CoworkArtifacts() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-xl font-medium text-white/90">Live artifacts</h1>
            <p className="mt-1 text-xs text-white/40">
              Outputs from scheduled tasks. Refreshed on each run.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80"
            >
              <Search size={14} />
            </button>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Artifact grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LIVE_ARTIFACTS.map((a) => (
            <div
              key={a.id}
              className={cn(
                'group flex flex-col gap-3 rounded-xl border p-4 transition',
                a.status === 'fresh'
                  ? 'border-teal-500/20 bg-teal-500/5 hover:border-teal-500/30'
                  : 'border-white/10 bg-white/5 hover:border-white/15',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/8 text-white/50">
                  <KindIcon kind={a.kind} />
                </span>
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                    a.status === 'fresh'
                      ? 'bg-teal-500/15 text-teal-400'
                      : 'bg-white/8 text-white/35',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      a.status === 'fresh' ? 'bg-teal-400' : 'bg-white/30',
                    )}
                  />
                  {a.status === 'fresh' ? 'Fresh' : 'Stale'}
                </span>
              </div>

              <div className="text-sm font-medium text-white/90 leading-snug">{a.title}</div>

              <div className="flex items-center gap-1.5 text-xs text-white/35">
                <RefreshCw size={10} />
                <span className="truncate">{a.source}</span>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-white/25">{a.updated}</span>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:text-white/70"
                    title="Copy"
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded text-white/30 hover:text-white/70"
                    title="Open"
                  >
                    <ExternalLink size={11} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
