import { Plus } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { toast } from 'sonner';
import { useProjectStore, type Project } from '../../stores/projectStore';

const PROJECT_COLORS = [
  'var(--chat-accent-secondary)',
  'var(--chat-accent-primary)',
  'var(--chat-info)',
  'var(--chat-success)',
  'var(--chat-warning)',
  'var(--chat-destructive)',
];

function projectColor(project: Project, index: number): string {
  if (project.color) return project.color;
  return PROJECT_COLORS[index % PROJECT_COLORS.length] ?? 'var(--chat-accent-secondary)';
}

function timeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return t('time.justNow');
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.mAgoShort', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hAgo', { count: h });
  const d = Math.floor(h / 24);
  if (d === 1) return t('sidebar.groups.yesterday').toLowerCase();
  if (d < 7) return t('time.daysAgo', { count: d });
  return t('time.weeksAgo', { count: Math.floor(d / 7) });
}

export function AgiWorkProjects() {
  const { t } = useTranslation('v3');
  const allProjects = useProjectStore((s) => s.projects);
  const isLoading = useProjectStore((s) => s.isLoading);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const createProject = useProjectStore((s) => s.createProject);
  const projects = useMemo(() => allProjects.filter((p) => !p.isArchived), [allProjects]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[var(--chat-border-strong)]">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-xl font-medium text-[var(--chat-text-primary)]">
            {t('agiWork.projects.title')}
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                void createProject({
                  name: t('agiWork.projects.untitled'),
                  description: '',
                  customInstructions: '',
                  files: [],
                  conversationIds: [],
                  isArchived: false,
                }).catch((error) => {
                  const message = error instanceof Error ? error.message : String(error);
                  toast.error(message);
                });
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--chat-accent-primary)] px-3 py-1.5 text-xs font-medium text-[var(--chat-accent-primary-contrast)] hover:opacity-85"
            >
              <Plus size={13} strokeWidth={2.4} />
              {t('agiWork.projects.newProject')}
            </button>
          </div>
        </div>

        {/* Project grid */}
        {isLoading && projects.length === 0 ? (
          <div className="py-8 text-center text-sm text-[var(--chat-text-muted)]">
            {t('common.loading')}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--chat-border)] px-4 py-8 text-center text-sm text-[var(--chat-text-muted)]">
            {t('agiWork.projects.empty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {projects.map((p, i) => (
              <div
                key={p.id}
                className="flex flex-col gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-4 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ background: projectColor(p, i) }}
                  />
                  <span className="font-medium text-[var(--chat-text-primary)]">{p.name}</span>
                </div>
                {p.description && (
                  <div className="text-xs leading-relaxed text-[var(--chat-text-secondary)] line-clamp-2">
                    {p.description}
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 text-xs text-[var(--chat-text-muted)]">
                  <div className="flex items-center gap-1.5">
                    <span>{t('agiWork.projects.updated', { when: timeAgo(p.updatedAt, t) })}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {t('agiWork.projects.sessions', { count: p.conversationIds.length })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
