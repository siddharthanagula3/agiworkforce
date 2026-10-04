import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  DEFAULT_PROJECT_ICON_ID,
  PROJECT_ACCENT_REGISTRY,
  PROJECT_ICON_REGISTRY,
  resolveProjectAccentHex,
  resolveProjectIcon,
  useMenuKeyboard,
} from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import { toUserMessage } from '../lib/network-error';
import { useProjectStore } from '../stores/projectStore';
import { ProjectCard } from './ProjectCard';
import type { Project } from '../lib/types';

interface ProjectPreset {
  icon: string;
  label: string;
  accentColor: 'emerald' | 'sky' | 'amber' | 'rose' | 'violet' | 'zinc';
}

const PROJECT_PRESETS: readonly ProjectPreset[] = [
  { icon: 'code', label: 'Coding', accentColor: 'sky' },
  { icon: 'file-text', label: 'Writing', accentColor: 'amber' },
  { icon: 'brain', label: 'Research', accentColor: 'emerald' },
  { icon: 'book-open', label: 'Learning', accentColor: 'violet' },
];

export interface ProjectGalleryProps {
  onSelect?: (project: Project) => void;
  /** Where each row links to, so the card is an anchor and not only a button. */
  projectHref?: (project: Project) => string;
  onCreate?: (input: ProjectGalleryCreateInput) => Promise<Project> | Project;
  onShareProject?: (project: Project) => void;
  onEditProject?: (project: Project) => void;
  onArchiveProject?: (project: Project) => void;
  onDeleteProject?: (project: Project) => void;
  onStarProject?: (projectId: string, starred: boolean) => void;
  title?: string | null;
  description?: string;
  limit?: number;
  moreAvailable?: boolean;
  layout?: 'grid' | 'list';
  className?: string;
}

export interface ProjectGalleryCreateInput {
  name: string;
  iconEmoji: string;
  accentColor: ProjectPreset['accentColor'];
}

function NewProjectIcon({ iconId }: { iconId: string }) {
  const Icon = resolveProjectIcon(iconId);
  return <Icon className="h-3.5 w-3.5" aria-hidden="true" />;
}

function generateLocalId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `proj_${globalThis.crypto.randomUUID()}`;
  }
  return `proj_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export function ProjectGallery({
  onSelect,
  projectHref,
  onCreate,
  onShareProject,
  onEditProject,
  onArchiveProject,
  onDeleteProject,
  onStarProject,
  title = 'Projects',
  description = 'Group conversations, attach files, and define shared instructions per project.',
  limit,
  moreAvailable = false,
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
  const [newIcon, setNewIcon] = useState<string>(DEFAULT_PROJECT_ICON_ID);
  const [newAccent, setNewAccent] = useState<ProjectPreset['accentColor']>('zinc');
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const iconTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeIconPicker = useCallback(() => setIconPickerOpen(false), []);
  useMenuKeyboard({
    open: iconPickerOpen,
    onClose: closeIconPicker,
    panelRef: iconPickerRef,
    triggerRef: iconTriggerRef,
    itemSelector: '[role="option"]',
  });

  const applyPreset = useCallback((preset: ProjectPreset) => {
    setNewName(preset.label);
    setNewIcon(preset.icon);
    setNewAccent(preset.accentColor);
  }, []);

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
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

  const hasQuery = query.trim().length > 0;
  const hasActiveProjects = projects.some((p) => !p.isArchived);
  const filteredEmpty = hasQuery && hasActiveProjects;

  const clearSearch = useCallback(() => {
    setQuery('');
    searchInputRef.current?.focus();
  }, []);

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
            iconEmoji: newIcon,
            accentColor: newAccent,
          });
          project = {
            ...project,
            iconEmoji: project.iconEmoji ?? newIcon,
            accentColor: project.accentColor ?? newAccent,
          };
        } else {
          const now = new Date().toISOString();
          project = {
            id: generateLocalId(),
            name: trimmed,
            iconEmoji: newIcon,
            accentColor: newAccent,
            createdAt: now,
            updatedAt: now,
          };
        }
        addProject(project);
        setNewName('');
        setNewIcon(DEFAULT_PROJECT_ICON_ID);
        setNewAccent('zinc');
        setIconPickerOpen(false);
        setCreating(false);
        handleSelect(project);
      } catch (error) {
        setCreateError(toUserMessage(error, 'Could not create this project. Try again.'));
      } finally {
        setSubmitting(false);
      }
    },
    [newName, newIcon, newAccent, onCreate, addProject, handleSelect],
  );

  return (
    <div className={cn('flex h-full flex-col gap-4', className)}>
      {(title || description) && (
        <div className="flex flex-col gap-1">
          {title ? <h2 className="text-h4 text-[var(--chat-text-primary)]">{title}</h2> : null}
          {description ? (
            <p className="max-w-prose text-sm text-[var(--chat-text-secondary)]">{description}</p>
          ) : null}
        </div>
      )}

      {/* Toolbar, search + new */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--chat-text-muted)]"
            aria-hidden="true"
          />
          <input
            ref={searchInputRef}
            type="search"
            aria-label="Search projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects"
            className="w-full rounded-md border bg-[var(--chat-surface-base)] py-1.5 ps-8 pe-3 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-focus-ring)]"
            style={{ borderColor: 'var(--chat-border)' }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError(null);
            setCreating((v) => !v);
          }}
          className="flex items-center gap-1.5 rounded-md bg-[var(--chat-accent-primary)] px-3 py-1.5 text-sm font-medium text-[var(--chat-accent-on-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
        >
          <Plus size={14} strokeWidth={2} />
          New
        </button>
      </div>

      {/* Inline create form, emoji picker + name input + presets */}
      {creating && (
        <form
          onSubmit={handleCreate}
          data-testid="project-create-form"
          className="flex flex-col gap-2 rounded-md border bg-[var(--chat-surface-base)] p-3"
          style={{ borderColor: 'var(--chat-border)' }}
        >
          <div className="flex items-center gap-2">
            <button
              ref={iconTriggerRef}
              type="button"
              onClick={() => setIconPickerOpen((v) => !v)}
              aria-label="Choose project icon"
              aria-expanded={iconPickerOpen}
              aria-haspopup="listbox"
              data-testid="project-create-emoji-trigger"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-[var(--chat-surface-elevated)] hover:bg-[var(--chat-surface-hover)]"
              style={{
                borderColor: 'var(--chat-border)',
                color: resolveProjectAccentHex(newAccent),
              }}
            >
              <NewProjectIcon iconId={newIcon} />
            </button>
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 80))}
              placeholder="Project name"
              data-testid="project-create-name-input"
              className="flex-1 rounded-md border-0 bg-transparent px-2 py-1 text-sm text-[var(--chat-text-primary)] placeholder:text-[var(--chat-text-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--chat-focus-ring)]"
            />
          </div>

          {iconPickerOpen && (
            <div
              ref={iconPickerRef}
              role="listbox"
              aria-label="Project icon"
              data-testid="project-create-emoji-picker"
              className="flex flex-wrap gap-1 rounded-md border bg-[var(--chat-surface-elevated)] p-2"
              style={{ borderColor: 'var(--chat-border)' }}
            >
              {PROJECT_ICON_REGISTRY.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-label={label}
                  aria-selected={id === newIcon}
                  onClick={() => {
                    setNewIcon(id);
                    setIconPickerOpen(false);
                  }}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-compact text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]',
                    id === newIcon && 'bg-[var(--chat-surface-hover)]',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          <div
            role="radiogroup"
            aria-label="Project colour"
            data-testid="project-create-accents"
            className="flex flex-wrap items-center gap-1.5"
          >
            {PROJECT_ACCENT_REGISTRY.map((accent) => (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={accent.id === newAccent}
                aria-label={accent.label}
                onClick={() => setNewAccent(accent.id as ProjectPreset['accentColor'])}
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
                  accent.id === newAccent && 'ring-2 ring-[var(--chat-border-strong)]',
                )}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: accent.hex }}
                />
              </button>
            ))}
          </div>

          <div
            data-testid="project-create-presets"
            className="flex flex-wrap items-center gap-1.5 pt-1"
          >
            <span className="text-caption uppercase tracking-wide text-[var(--chat-text-muted)]">
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
                <NewProjectIcon iconId={preset.icon} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>

          {createError ? (
            <p role="alert" className="text-xs text-[var(--chat-destructive-text)]">
              {createError}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setNewName('');
                setNewIcon(DEFAULT_PROJECT_ICON_ID);
                setNewAccent('zinc');
                setIconPickerOpen(false);
                setCreateError(null);
              }}
              className="rounded-compact px-2 py-1 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || newName.trim().length === 0}
              className={cn(
                'rounded-compact px-3 py-1 text-xs font-medium',
                submitting || newName.trim().length === 0
                  ? 'cursor-not-allowed bg-[var(--chat-surface-hover)] text-[var(--chat-text-muted)]'
                  : 'bg-[var(--chat-accent-primary)] text-[var(--chat-accent-on-primary)] hover:opacity-90',
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
            <p className="max-w-full break-words text-sm text-[var(--chat-text-secondary)]">
              {filteredEmpty
                ? moreAvailable
                  ? 'No match in the projects loaded so far.'
                  : `No projects match "${query.trim()}".`
                : 'No projects yet.'}
            </p>
            {filteredEmpty ? (
              <>
                <p className="text-xs text-[var(--chat-text-muted)]">
                  Try another name or description, or clear the search.
                </p>
                <button
                  type="button"
                  data-testid="projects-clear-search"
                  onClick={clearSearch}
                  className="min-h-8 rounded-compact px-3 py-1 text-xs text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                >
                  Clear search
                </button>
              </>
            ) : (
              <p className="text-xs text-[var(--chat-text-muted)]">
                Create one to group conversations, attach files, and share instructions.
              </p>
            )}
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
                {...(projectHref ? { href: projectHref(project) } : {})}
                onSelect={handleSelect}
                onShare={project.space === 'health' ? undefined : onShareProject}
                onEdit={onEditProject}
                onArchive={onArchiveProject ? handleArchive : undefined}
                onDelete={onDeleteProject ? handleDelete : undefined}
                onStarChange={onStarProject}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
