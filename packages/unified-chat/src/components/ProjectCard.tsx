import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { FolderOpen, MoreHorizontal, Star } from 'lucide-react';
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
 *
 * Context menu (three-dot) actions use callback injection so this component
 * stays host-agnostic. The web host mounts ProjectSettingsDialog etc.
 */

export interface ProjectCardProps {
  project: Project;
  active?: boolean;
  onSelect?: (project: Project) => void;
  /** Called when the user chooses "Edit details" from the context menu. */
  onEdit?: (project: Project) => void;
  /** Called when the user chooses "Archive" from the context menu. */
  onArchive?: (project: Project) => void;
  /** Called when the user confirms "Delete" from the context menu. */
  onDelete?: (project: Project) => void;
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
  onEdit,
  onArchive,
  onDelete,
  formatRelativeDate = defaultFormatRelativeDate,
  className,
}: ProjectCardProps) {
  const toggleStar = useProjectStore((s) => s.toggleStar);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleStarClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      toggleStar(project.id);
    },
    [toggleStar, project.id],
  );

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleOutside(e: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const conversationCount = project.conversationIds?.length ?? 0;

  const menuItemCls =
    'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] transition-colors';

  const hasMenu = !!(onEdit || onArchive || onDelete);

  return (
    // Rendered as a role="button" div (not a native <button>) so the nested
    // star-toggle and options <button>s below are valid HTML. A <button> may
    // not contain another <button> — the old markup did, producing a React
    // hydration warning on every Projects render (live audit 2026-07-10 §9).
    // Keyboard access is preserved via tabIndex + Enter/Space handling.
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(project)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(project);
        }
      }}
      aria-current={active ? 'true' : undefined}
      aria-label={`Open project ${project.name}`}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col gap-2 rounded-xl border bg-[var(--chat-surface-elevated)] p-4 text-left transition-colors',
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

        <div className="flex shrink-0 items-center gap-1">
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

          {hasMenu && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                aria-label="Project options"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((v) => !v);
                  setConfirmDelete(false);
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
              >
                <MoreHorizontal size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label={`Options for ${project.name}`}
                  className="absolute right-0 top-full z-20 mt-1 min-w-[152px] rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] py-1 shadow-lg"
                >
                  {/* Star / Unstar */}
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItemCls}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStar(project.id);
                      setMenuOpen(false);
                    }}
                  >
                    <Star size={13} strokeWidth={1.75} aria-hidden="true" />
                    {project.starred ? 'Unstar' : 'Star'}
                  </button>

                  {onEdit && (
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemCls}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(project);
                        setMenuOpen(false);
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit details
                    </button>
                  )}

                  {onArchive && (
                    <button
                      type="button"
                      role="menuitem"
                      className={menuItemCls}
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive(project);
                        setMenuOpen(false);
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                      Archive
                    </button>
                  )}

                  {onDelete && !confirmDelete && (
                    <button
                      type="button"
                      role="menuitem"
                      className={cn(menuItemCls, 'text-red-400 hover:text-red-300')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(true);
                      }}
                    >
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4h6v2" />
                      </svg>
                      Delete
                    </button>
                  )}

                  {onDelete && confirmDelete && (
                    <div className="px-3 py-2">
                      <p className="mb-2 text-xs text-[var(--chat-text-muted)]">
                        Delete &ldquo;{project.name}&rdquo;? This cannot be undone.
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          role="menuitem"
                          className="flex-1 rounded border border-red-500/40 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(project);
                            setMenuOpen(false);
                            setConfirmDelete(false);
                          }}
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="flex-1 rounded px-2 py-1 text-xs text-[var(--chat-text-secondary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(false);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
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
    </div>
  );
}
