import { useCallback, type MouseEvent } from 'react';
import { FolderOpen, Star } from 'lucide-react';
import { cn } from '../lib/utils';
import { useProjectStore } from '../stores/projectStore';
import type { Project } from '../lib/types';

/**
 * ProjectCard — single-card visual for the shared project gallery / sidebar.
 *
 * Round-2 audit P0 "Shared Projects component" (2026-05-21). Mirrors the
 * Claude desktop Projects gallery card pattern: name + description, star
 * toggle, conversation count, last-updated relative timestamp.
 *
 * Consumer surfaces (web, desktop, mobile-web preview, chrome-ext side-panel)
 * import this directly. Native React Native (apps/mobile) implements its own
 * `ProjectCard` because the platform's text rendering differs.
 */

export interface ProjectCardProps {
  project: Project;
  active?: boolean;
  onSelect?: (project: Project) => void;
  /** Override the default time formatter — useful for i18n. */
  formatRelativeDate?: (iso: string) => string;
  className?: string;
}

function defaultFormatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'just now';
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ProjectCard({
  project,
  active = false,
  onSelect,
  formatRelativeDate = defaultFormatRelativeDate,
  className,
}: ProjectCardProps) {
  const toggleStar = useProjectStore((s) => s.toggleStar);

  const handleStarClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      // Don't bubble up — the parent card's onSelect should not fire when the
      // user is only toggling the star.
      event.stopPropagation();
      toggleStar(project.id);
    },
    [toggleStar, project.id],
  );

  const conversationCount = project.conversationIds?.length ?? 0;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(project)}
      aria-current={active ? 'true' : undefined}
      aria-label={`Open project ${project.name}`}
      className={cn(
        'group relative flex w-full flex-col gap-2 rounded-xl border bg-[var(--chat-surface-elevated)] p-4 text-left transition-colors',
        'hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
        active
          ? 'border-[var(--chat-accent-primary)] shadow-[0_0_0_2px_rgba(218,119,86,0.18)]'
          : 'border-[var(--chat-border)]',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen
            size={16}
            strokeWidth={1.75}
            className="shrink-0 text-[var(--chat-accent-secondary)]"
            aria-hidden="true"
          />
          <span className="truncate text-sm font-semibold text-[var(--chat-text-primary)]">
            {project.name}
          </span>
        </div>
        <button
          type="button"
          onClick={handleStarClick}
          aria-label={project.starred ? 'Unstar project' : 'Star project'}
          aria-pressed={project.starred ?? false}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
            'hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
            project.starred
              ? 'text-[var(--chat-accent-primary)]'
              : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)]',
          )}
        >
          <Star size={14} strokeWidth={1.75} fill={project.starred ? 'currentColor' : 'none'} />
        </button>
      </div>

      {project.description ? (
        <p className="line-clamp-2 text-xs text-[var(--chat-text-secondary)]">
          {project.description}
        </p>
      ) : null}

      <div className="flex items-center justify-between text-[11px] text-[var(--chat-text-muted)]">
        <span>
          {conversationCount === 0
            ? 'No conversations yet'
            : `${conversationCount} conversation${conversationCount === 1 ? '' : 's'}`}
        </span>
        <span>Updated {formatRelativeDate(project.updatedAt)}</span>
      </div>
    </button>
  );
}
