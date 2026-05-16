import { Plus, Search } from 'lucide-react';

interface CoworkProject {
  id: string;
  name: string;
  desc: string;
  color: string;
  updated: string;
  schedule: string;
  sessions: number;
}

const COWORK_PROJECTS: CoworkProject[] = [
  {
    id: 'p1',
    name: 'Sales pipeline',
    desc: 'Monitor CRM, draft follow-ups, flag at-risk deals, and surface weekly digest.',
    color: '#21808d',
    updated: '2h ago',
    schedule: 'Every weekday 8 AM',
    sessions: 14,
  },
  {
    id: 'p2',
    name: 'Customer support triage',
    desc: 'Classify incoming tickets, draft first responses, escalate P0s to Slack.',
    color: '#da7756',
    updated: '35 min ago',
    schedule: 'Every 2h',
    sessions: 31,
  },
  {
    id: 'p3',
    name: 'Investor digest',
    desc: 'Pull portfolio updates, summarize metrics, highlight blockers for weekly LP email.',
    color: '#7c6de0',
    updated: 'Yesterday',
    schedule: 'Every Monday 7 AM',
    sessions: 8,
  },
  {
    id: 'p4',
    name: 'Hiring loop',
    desc: 'Screen resumes, prep interview briefs, schedule follow-ups with candidates.',
    color: '#2da44e',
    updated: '3 days ago',
    schedule: 'On demand',
    sessions: 5,
  },
  {
    id: 'p5',
    name: 'Legal triage',
    desc: 'Flag contract clauses, summarize terms, route to counsel when risk threshold hit.',
    color: '#e3b341',
    updated: '1 week ago',
    schedule: 'On demand',
    sessions: 3,
  },
];

export function CoworkProjects() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-white/10">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-xl font-medium text-white/90">Cowork projects</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/50 hover:text-white/80"
            >
              <Search size={14} />
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-400"
            >
              <Plus size={13} strokeWidth={2.4} />
              New project
            </button>
          </div>
        </div>

        {/* Project grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {COWORK_PROJECTS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="group flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/8"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: p.color }}
                />
                <span className="font-medium text-white/90">{p.name}</span>
              </div>
              <div className="text-xs leading-relaxed text-white/50 line-clamp-2">{p.desc}</div>
              <div className="flex items-center justify-between pt-1 text-xs text-white/30">
                <div className="flex items-center gap-1.5">
                  <span>Updated {p.updated}</span>
                  <span className="text-white/20">·</span>
                  <span>{p.sessions} sessions</span>
                </div>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-white/40">
                  {p.schedule}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
