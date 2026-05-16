import { Plus, Search } from 'lucide-react';
import { useEffect } from 'react';
import { useProjectStore, type Project } from '../../stores/projectStore';

const PROJECT_COLORS = [
  '#21808d',
  '#da7756',
  '#7c6de0',
  '#2da44e',
  '#e3b341',
  '#e06c75',
  '#56b6c2',
  '#d19a66',
];

function projectColor(project: Project, index: number): string {
  if (project.color) return project.color;
  return PROJECT_COLORS[index % PROJECT_COLORS.length] ?? '#21808d';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return `${Math.floor(d / 7)}w ago`;
}

export function CoworkProjects() {
  const { projects, isLoading, loadProjects } = useProjectStore((s) => ({
    projects: s.projects.filter((p) => !p.isArchived),
    isLoading: s.isLoading,
    loadProjects: s.loadProjects,
  }));

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

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
        {isLoading && projects.length === 0 ? (
          <div className="py-8 text-center text-sm text-white/30">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/30">
            No projects yet. Click &ldquo;New project&rdquo; to get started.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className="group flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/20 hover:bg-white/8"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ background: projectColor(p, i) }}
                  />
                  <span className="font-medium text-white/90">{p.name}</span>
                </div>
                {p.description && (
                  <div className="text-xs leading-relaxed text-white/50 line-clamp-2">
                    {p.description}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 text-xs text-white/30">
                  <div className="flex items-center gap-1.5">
                    <span>Updated {timeAgo(p.updatedAt)}</span>
                    <span className="text-white/20">·</span>
                    <span>{p.conversationIds.length} sessions</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
