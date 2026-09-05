import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { FolderOpen, MoreHorizontal, Share2, Star } from 'lucide-react';
import { useConfirmAction, useMenuKeyboard } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import { useProjectStore } from '../stores/projectStore';
import type { Project } from '../lib/types';

export interface ProjectCardProps {
  project: Project;
  active?: boolean;
  onSelect?: (project: Project) => void;
  onShare?: (project: Project) => void;
  onEdit?: (project: Project) => void;
  onArchive?: (project: Project) => void;
  onUnarchive?: (project: Project) => void;
  onDelete?: (project: Project) => void;
  onStarChange?: (projectId: string, starred: boolean) => void;
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
  onShare,
  onEdit,
  onArchive,
  onUnarchive,
  onStarChange,
  onDelete,
  formatRelativeDate = defaultFormatRelativeDate,
  className,
}: ProjectCardProps) {
  const toggleStar = useProjectStore((s) => s.toggleStar);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const handleStarClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      toggleStar(project.id);
      onStarChange?.(project.id, !project.starred);
    },
    [toggleStar, project.id, project.starred, onStarChange],
  );

  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);
  // role="menu" promises the keyboard contract; this panel had outside-click
  // dismissal only, so a keyboard user could open it and reach nothing.
  useMenuKeyboard({
    open: menuOpen && !confirmDialog,
    onClose: closeMenu,
    panelRef: menuPanelRef,
    triggerRef: menuTriggerRef,
  });

  useEffect(() => {
    if (!menuOpen || confirmDialog) return;
    function handleOutside(e: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen, confirmDialog]);

  const conversationCount = project.conversationCount ?? project.conversationIds?.length ?? 0;

  const menuItemCls =
    'flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] transition-colors';

  const archiveAction = project.isArchived ? onUnarchive : onArchive;
  const hasMenu = !!(onShare || onEdit || archiveAction || onDelete);

  return (
    <>
      {confirmDialog}
      {/* The card used to BE the button, with the star and menu buttons nested
      inside it. A control cannot contain other controls: assistive tech has no
      way to represent it, and axe reports nested-interactive. The open action
      is now its own element stretched over the card, so the row still clicks
      anywhere while the action buttons stay siblings rather than descendants. */}
      <div
        aria-current={active ? 'true' : undefined}
        className={cn(
          'group relative flex w-full flex-col gap-2 rounded-xl border bg-[var(--chat-surface-elevated)] p-4 text-left transition-colors',
          'hover:bg-[var(--chat-surface-hover)] focus-within:ring-2 focus-within:ring-[var(--chat-accent-secondary)]',
          active
            ? 'border-[var(--chat-accent-primary)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--chat-accent-primary)_18%,transparent)]'
            : 'border-[var(--chat-border)]',
          className,
        )}
      >
        <button
          type="button"
          onClick={() => onSelect?.(project)}
          aria-label={`Open project ${project.name}`}
          className="absolute inset-0 z-0 cursor-pointer rounded-xl focus:outline-none"
        />
        <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
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

          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={handleStarClick}
              aria-label={project.starred ? 'Unstar project' : 'Star project'}
              aria-pressed={project.starred ?? false}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md transition-colors',
                'hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]',
                project.starred
                  ? 'text-[var(--chat-accent-primary-text)]'
                  : 'text-[var(--chat-text-muted)] hover:text-[var(--chat-text-primary)]',
              )}
            >
              <Star size={14} strokeWidth={1.75} fill={project.starred ? 'currentColor' : 'none'} />
            </button>

            {hasMenu && (
              <div ref={menuRef} className="relative">
                <button
                  ref={menuTriggerRef}
                  type="button"
                  aria-label="Project options"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen((v) => !v);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-secondary)]"
                >
                  <MoreHorizontal size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>

                {menuOpen && (
                  <div
                    ref={menuPanelRef}
                    role="menu"
                    aria-label={`Options for ${project.name}`}
                    className="absolute right-0 top-full z-20 mt-1 min-w-[152px] rounded-lg border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] py-1 shadow-lg"
                  >
                    {/* Order matches the leaders' project row menu: share,
                        edit (rename + settings), archive, delete. Star lives
                        as its own always-visible toggle beside the menu
                        trigger, so it is not duplicated inside the menu. */}
                    {onShare && (
                      <button
                        type="button"
                        role="menuitem"
                        className={menuItemCls}
                        onClick={(e) => {
                          e.stopPropagation();
                          onShare(project);
                          setMenuOpen(false);
                        }}
                      >
                        <Share2 size={13} strokeWidth={1.75} aria-hidden="true" />
                        Share
                      </button>
                    )}

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

                    {archiveAction && (
                      <button
                        type="button"
                        role="menuitem"
                        className={menuItemCls}
                        onClick={(e) => {
                          e.stopPropagation();
                          archiveAction(project);
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
                        {project.isArchived ? 'Unarchive' : 'Archive'}
                      </button>
                    )}

                    {onDelete && (
                      <button
                        type="button"
                        role="menuitem"
                        className={cn(menuItemCls, 'text-red-400 hover:text-red-300')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          confirm({
                            title: `Delete "${project.name}"?`,
                            description: 'This cannot be undone.',
                            confirmLabel: 'Delete',
                            destructive: true,
                            onConfirm: () => onDelete(project),
                          });
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
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {project.description ? (
          <p className="pointer-events-none relative z-10 line-clamp-2 text-xs text-[var(--chat-text-secondary)]">
            {project.description}
          </p>
        ) : null}

        <div className="pointer-events-none relative z-10 flex items-center justify-between text-[12px] text-[var(--chat-text-muted)]">
          <span>
            {conversationCount === 0
              ? 'No conversations yet'
              : `${conversationCount} conversation${conversationCount === 1 ? '' : 's'}`}
          </span>
          <span>Updated {formatRelativeDate(project.updatedAt)}</span>
        </div>
      </div>
    </>
  );
}
