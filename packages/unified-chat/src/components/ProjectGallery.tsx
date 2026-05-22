import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { useProjectStore } from '../stores/projectStore';
import { ProjectCard } from './ProjectCard';
import type { Project } from '../lib/types';

/**
 * ProjectGallery — shared list/grid surface for project navigation.
 *
 * Round-2 audit P0 "Shared Projects component" (2026-05-21). Consumed by web
 * (`/projects`), desktop (Projects view), chrome ext side panel, and any
 * future light surface that needs a project picker.
 *
 * Behavior parity with Claude desktop's Projects gallery:
 *   - Starred projects pin to the top
 *   - Quick-filter search (case-insensitive, name + description)
 *   - Inline "+ New project" affordance with a one-line name input
 *   - Empty state with a hint and the same "+ New project" CTA
 *
 * Hosts that need server-backed projects (Cloud Managed) pass `onCreate`,
 * `onSelect`, and `onArchive` callbacks so the API round-trip stays in the
 * consumer; the gallery itself only manipulates `useProjectStore`.
 */

export interface ProjectGalleryProps {
  /**
   * Called when a project is selected. If omitted, the gallery falls back to
   * `useProjectStore.setActiveProject(project.id)`.
   */
  onSelect?: (project: Project) => void;
  /**
   * Optional async create hook. If provided, the gallery awaits this then
   * adds the returned project to the store. If omitted, the gallery creates
   * a device-local project directly via `useProjectStore.addProject`.
   */
  onCreate?: (name: string) => Promise<Project> | Project;
  /** Optional title — defaults to "Projects". Pass null to hide. */
  title?: string | null;
  /** Optional description copy under the title. */
  description?: string;
  /** Limit visible projects to this count (sorted starred-first then by updatedAt). */
  limit?: number;
  /** Render mode: 'grid' (default — 2 columns ≥ 768px) or 'list' (single column). */
  layout?: 'grid' | 'list';
  /** Optional className for the outer container. */
  className?: string;
}

function generateLocalId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `proj_${globalThis.crypto.randomUUID()}`;
  }
  return `proj_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function ProjectGallery({
  onSelect,
  onCreate,
  title = 'Projects',
  description = 'Group conversations, attach files, and define shared instructions per project.',
  limit,
  layout = 'grid',
  className,
}: ProjectGalleryProps) {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const addProject = useProjectStore((s) => s.addProject);

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? projects.filter(
          (project) =>
            project.name.toLowerCase().includes(q) ||
            (project.description ?? '').toLowerCase().includes(q),
        )
      : projects;
    const sorted = [...filtered].sort((a, b) => {
      if ((b.starred ?? false) !== (a.starred ?? false)) {
        return (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
      }
      return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
    });
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }, [projects, query, limit]);

  const handleSelect = useCallback(
    (project: Project) => {
      setActiveProject(project.id);
      onSelect?.(project);
    },
    [setActiveProject, onSelect],
  );

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = newName.trim();
      if (!trimmed) return;
      setSubmitting(true);
      try {
        let project: Project;
        if (onCreate) {
          project = await onCreate(trimmed);
        } else {
          const now = new Date().toISOString();
          project = {
            id: generateLocalId(),
            name: trimmed,
            createdAt: now,
            updatedAt: now,
          };
          addProject(project);
        }
        setNewName('');
        setCreating(false);
        // Auto-select the just-created project so the host can route into it.
        handleSelect(project);
      } finally {
        setSubmitting(false);
      }
    },
    [newName, onCreate, addProject, handleSelect],
  );

  return (
    <div className={cn('flex h-full flex-col gap-4', className)}>
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title ? (
            <h2 className="text-base font-semibold text-[var(--chat-text-primary)]">{title}</h2>
          ) : null}
          {description ? (
            <p className="max-w-prose text-sm text-[var(--chat-text-secondary)]">{description}</p>
          ) : null}
        </div>
      )}

      {/* Toolbar — search + new */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--chat-text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            className="w-full rounded-md border bg-[var(--chat-surface-base)] py-1.5 pl-8 pr-3 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]"
            style={{ borderColor: 'var(--chat-border)' }}
          />
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 rounded-md bg-[var(--chat-accent-primary)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
        >
          <Plus size={14} strokeWidth={2} />
          New
        </button>
      </div>

      {/* Inline create form */}
      {creating && (
        <form
          onSubmit={handleCreate}
          className="flex items-center gap-2 rounded-md border bg-[var(--chat-surface-base)] p-2"
          style={{ borderColor: 'var(--chat-border)' }}
        >
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value.slice(0, 80))}
            placeholder="Project name"
            className="flex-1 border-0 bg-transparent px-2 py-1 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
            className="rounded px-2 py-1 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || newName.trim().length === 0}
            className={cn(
              'rounded px-2 py-1 text-xs font-medium text-white',
              submitting || newName.trim().length === 0
                ? 'cursor-not-allowed bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]'
                : 'bg-[var(--chat-accent-primary)] hover:opacity-90',
            )}
          >
            Create
          </button>
        </form>
      )}

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        {visibleProjects.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-12 text-center"
            style={{ borderColor: 'var(--chat-border)' }}
          >
            <p className="text-sm text-[var(--chat-text-secondary)]">
              {query.trim() ? `No projects match "${query.trim()}".` : 'No projects yet.'}
            </p>
            <p className="text-xs text-[var(--chat-text-muted)]">
              Create one to group conversations, attach files, and share instructions.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              layout === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2' : 'flex flex-col gap-2',
            )}
          >
            {visibleProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                active={project.id === activeProjectId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
