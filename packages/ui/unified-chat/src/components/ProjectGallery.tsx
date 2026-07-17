import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Smile } from 'lucide-react';
import { cn } from '../lib/utils';
import { useProjectStore } from '../stores/projectStore';
import { ProjectCard } from './ProjectCard';
import type { Project } from '../lib/types';

/**
 * Project create presets — quick-start options that pre-fill name + emoji
 * + accent color. Mirrors the ChatGPT create-project modal pattern
 * (Investing / Homework / Writing) without copying their labels. Tuned for
 * AGI's developer + research audience.
 */
interface ProjectPreset {
  emoji: string;
  label: string;
  accentColor: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet' | 'zinc';
}

const PROJECT_PRESETS: readonly ProjectPreset[] = [
  { emoji: '💻', label: 'Coding', accentColor: 'sky' },
  { emoji: '📝', label: 'Writing', accentColor: 'amber' },
  { emoji: '🔬', label: 'Research', accentColor: 'emerald' },
  { emoji: '📚', label: 'Learning', accentColor: 'violet' },
];

/** Quick-pick emoji palette shown inline when the user opens the picker. */
const EMOJI_OPTIONS: readonly string[] = [
  '📁',
  '💻',
  '📝',
  '🔬',
  '📚',
  '🎨',
  '💼',
  '🏠',
  '🚀',
  '⭐️',
  '🛠️',
  '🌱',
];

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
  onCreate?: (input: ProjectGalleryCreateInput) => Promise<Project> | Project;
  /**
   * Called when the user chooses "Edit details" from a card context menu.
   * The host is responsible for opening the settings dialog.
   */
  onEditProject?: (project: Project) => void;
  /**
   * Called after archive is applied. The gallery marks `isArchived: true` in
   * the store; the host can sync to a backend here.
   */
  onArchiveProject?: (project: Project) => void;
  /**
   * Called after the project is removed from the store. The host can sync to
   * a backend here.
   */
  onDeleteProject?: (project: Project) => void;
  /** Optional title — defaults to "Projects". Pass null to hide. */
  title?: string | null;
  /** Optional description copy under the title. */
  description?: string;
  /** Limit visible projects to this count (sorted starred-first then by updatedAt). */
  limit?: number;
  /** Render mode: 'grid' (default — 2 columns >= 768px) or 'list' (single column). */
  layout?: 'grid' | 'list';
  /** Optional className for the outer container. */
  className?: string;
}

export interface ProjectGalleryCreateInput {
  name: string;
  iconEmoji: string;
  accentColor: ProjectPreset['accentColor'];
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
  onEditProject,
  onArchiveProject,
  onDeleteProject,
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
  const updateProject = useProjectStore((s) => s.updateProject);
  const removeProject = useProjectStore((s) => s.removeProject);

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState<string>('📁');
  const [newAccent, setNewAccent] = useState<ProjectPreset['accentColor']>('zinc');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const applyPreset = useCallback((preset: ProjectPreset) => {
    setNewName(preset.label);
    setNewEmoji(preset.emoji);
    setNewAccent(preset.accentColor);
  }, []);

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Never show archived projects in the main gallery view
    const active = projects.filter((p) => !p.isArchived);
    const filtered = q
      ? active.filter(
          (project) =>
            project.name.toLowerCase().includes(q) ||
            (project.description ?? '').toLowerCase().includes(q),
        )
      : active;
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

  const handleArchive = useCallback(
    (project: Project) => {
      updateProject(project.id, { isArchived: true });
      onArchiveProject?.(project);
    },
    [updateProject, onArchiveProject],
  );

  const handleDelete = useCallback(
    (project: Project) => {
      removeProject(project.id);
      onDeleteProject?.(project);
    },
    [removeProject, onDeleteProject],
  );

  const handleCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = newName.trim();
      if (!trimmed) return;
      setSubmitting(true);
      setCreateError(null);
      try {
        let project: Project;
        if (onCreate) {
          project = await onCreate({
            name: trimmed,
            iconEmoji: newEmoji,
            accentColor: newAccent,
          });
          // Best-effort merge of emoji + accent — when the host's onCreate
          // doesn't echo them back, layer them on top of the returned
          // project so the auto-select handoff still carries them.
          project = {
            ...project,
            iconEmoji: project.iconEmoji ?? newEmoji,
            accentColor: project.accentColor ?? newAccent,
          };
        } else {
          const now = new Date().toISOString();
          project = {
            id: generateLocalId(),
            name: trimmed,
            iconEmoji: newEmoji,
            accentColor: newAccent,
            createdAt: now,
            updatedAt: now,
          };
        }
        // Hosts return the canonical server row but do not mutate this shared
        // view model themselves. Local and managed creates therefore converge
        // through the same single insertion point.
        addProject(project);
        setNewName('');
        setNewEmoji('📁');
        setNewAccent('zinc');
        setEmojiPickerOpen(false);
        setCreating(false);
        // Auto-select the just-created project so the host can route into it.
        handleSelect(project);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create project');
      } finally {
        setSubmitting(false);
      }
    },
    [newName, newEmoji, newAccent, onCreate, addProject, handleSelect],
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
          onClick={() => {
            setCreateError(null);
            setCreating((v) => !v);
          }}
          className="flex items-center gap-1.5 rounded-md bg-[var(--chat-accent-primary)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
        >
          <Plus size={14} strokeWidth={2} />
          New
        </button>
      </div>

      {/* Inline create form — emoji picker + name input + presets */}
      {creating && (
        <form
          onSubmit={handleCreate}
          data-testid="project-create-form"
          className="flex flex-col gap-2 rounded-md border bg-[var(--chat-surface-base)] p-3"
          style={{ borderColor: 'var(--chat-border)' }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((v) => !v)}
              aria-label="Choose project emoji"
              aria-expanded={emojiPickerOpen}
              data-testid="project-create-emoji-trigger"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-[var(--chat-surface-elevated)] text-lg hover:bg-[var(--chat-surface-hover)]"
              style={{ borderColor: 'var(--chat-border)' }}
            >
              {newEmoji ? (
                <span>{newEmoji}</span>
              ) : (
                <Smile size={14} className="text-[var(--chat-text-muted)]" />
              )}
            </button>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 80))}
              placeholder="Project name"
              data-testid="project-create-name-input"
              className="flex-1 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent-secondary)]"
            />
          </div>

          {emojiPickerOpen && (
            <div
              role="listbox"
              aria-label="Project emoji"
              data-testid="project-create-emoji-picker"
              className="flex flex-wrap gap-1 rounded-md border bg-[var(--chat-surface-elevated)] p-2"
              style={{ borderColor: 'var(--chat-border)' }}
            >
              {EMOJI_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="option"
                  aria-selected={emoji === newEmoji}
                  onClick={() => {
                    setNewEmoji(emoji);
                    setEmojiPickerOpen(false);
                  }}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded text-base hover:bg-[var(--chat-surface-hover)]',
                    emoji === newEmoji && 'bg-[var(--chat-surface-hover)]',
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          <div
            data-testid="project-create-presets"
            className="flex flex-wrap items-center gap-1.5 pt-1"
          >
            <span className="text-[10px] uppercase tracking-wide text-[var(--chat-text-muted)]">
              Quick start
            </span>
            {PROJECT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset)}
                data-testid={`project-create-preset-${preset.label.toLowerCase()}`}
                className="inline-flex items-center gap-1 rounded-full border bg-[var(--chat-surface-elevated)] px-2.5 py-0.5 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]"
                style={{ borderColor: 'var(--chat-border)' }}
              >
                <span>{preset.emoji}</span>
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {createError ? (
            <p role="alert" className="text-xs text-[var(--chat-error,#f43f5e)]">
              {createError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName('');
                setNewEmoji('📁');
                setNewAccent('zinc');
                setEmojiPickerOpen(false);
                setCreateError(null);
              }}
              className="rounded px-2 py-1 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || newName.trim().length === 0}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium text-white',
                submitting || newName.trim().length === 0
                  ? 'cursor-not-allowed bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]'
                  : 'bg-[var(--chat-accent-primary)] hover:opacity-90',
              )}
            >
              Create project
            </button>
          </div>
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
                onEdit={onEditProject}
                onArchive={onArchiveProject ? handleArchive : undefined}
                onDelete={onDeleteProject ? handleDelete : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
