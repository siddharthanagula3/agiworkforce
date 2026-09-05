'use client';

import { memo, useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  Archive,
  ArchiveRestore,
  Folder,
  Link2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  Star,
  Trash2,
} from '@agiworkforce/icons';
import { cn } from '../cn';
import { useUiTranslation } from '../i18n';
import { Menu, MenuItem, MenuSeparator } from './Menu';
import type { SidebarProject, SidebarSession } from './types';

export interface SessionItemHandlers {
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onStar?: (id: string) => void;
  onArchive?: (id: string) => void;
  onRestore?: (id: string) => void;
  onShare?: (id: string) => void;
  onMoveToProject?: (id: string, projectId: string) => void;
  onOpenCustomInstructions?: (id: string) => void;
}

export interface SessionItemProps extends SessionItemHandlers {
  session: SidebarSession;
  isActive: boolean;
  isKeyboardFocused?: boolean;
  projectName?: string;
  projects?: SidebarProject[];
  simple?: boolean;
  href?: string;
}

function SessionItemBase({
  session,
  isActive,
  isKeyboardFocused = false,
  projectName,
  projects,
  simple = false,
  href,
  onSelect,
  onRename,
  onDelete,
  onTogglePin,
  onStar,
  onArchive,
  onRestore,
  onShare,
  onMoveToProject,
  onOpenCustomInstructions,
}: SessionItemProps) {
  const { t } = useUiTranslation('chat');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);
  // The row this instance renders for is tied to session.id, not to its index
  // in the list (the parent keys it by id), so a ref here keeps pointing at
  // the right row even when a rename reorders the visible list out from
  // under it, unlike the sidebar's own index-based keyboard-focus tracking,
  // which is exactly what went stale and left the ring on a neighboring row.
  const selectButtonRef = useRef<HTMLAnchorElement | HTMLButtonElement>(null);
  const returnFocusOnExitRef = useRef(false);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      return;
    }
    if (returnFocusOnExitRef.current) {
      returnFocusOnExitRef.current = false;
      selectButtonRef.current?.focus();
    }
  }, [isRenaming]);

  const submitRename = () => {
    const next = renameValue.trim();
    if (next && next !== session.title) {
      onRename(session.id, next);
    }
    setIsRenaming(false);
  };

  const cancelRename = () => {
    setIsRenaming(false);
  };

  const rowLabel = session.title || t('sidebar.untitled', 'Untitled');
  const rowTitle = projectName
    ? `${rowLabel} (${t('sidebar.inProject', 'in {{name}}', { name: projectName })})`
    : rowLabel;

  const handleRowActivate = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onSelect(session.id);
  };

  const rowContent = (
    <div className="flex min-w-0 items-center gap-1.5">
      {session.starred && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
      {session.runState === 'running' && (
        <span
          data-testid={`session-running-${session.id}`}
          className="relative flex h-2 w-2 shrink-0"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          <span className="sr-only">{t('sidebar.running', 'Running')}</span>
        </span>
      )}
      {session.agiWork && (
        <span
          data-testid={`session-agi-work-${session.id}`}
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
      <span className="truncate text-sm font-medium text-[hsl(var(--foreground))]">{rowLabel}</span>
    </div>
  );

  // The dot is the only thing separating a task from a chat, so the row's
  // accessible name has to carry the mode rather than leave it to colour.
  const rowAccessibleName = session.agiWork
    ? `${rowLabel}, ${t('sidebar.agiWork', 'AGI Work')}`
    : undefined;

  const rowClassName = 'flex h-[34px] min-w-0 flex-1 items-center overflow-hidden px-3 text-left';

  if (isRenaming) {
    return (
      <div className="mb-1 rounded-lg px-2 py-1.5">
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              returnFocusOnExitRef.current = true;
              submitRename();
            }
            if (e.key === 'Escape') {
              returnFocusOnExitRef.current = true;
              cancelRename();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'w-full rounded-md border bg-[hsl(var(--background))] px-2 py-1 text-sm',
            'border-[hsl(var(--border))] text-[hsl(var(--foreground))]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative mb-1 rounded-lg transition-colors',
        isActive ? 'bg-[hsl(var(--accent))]' : 'hover:bg-[hsl(var(--accent))]',
        isKeyboardFocused && 'ring-2 ring-[hsl(var(--ring))] ring-offset-1',
        session.incognito && 'ring-1 ring-purple-500/20',
      )}
    >
      <div className="flex items-center">
        {href ? (
          <a
            ref={(el) => {
              selectButtonRef.current = el;
            }}
            href={href}
            onClick={handleRowActivate}
            onDoubleClick={() => setIsRenaming(true)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={rowAccessibleName}
            title={rowTitle}
            className={rowClassName}
          >
            {rowContent}
          </a>
        ) : (
          <button
            ref={(el) => {
              selectButtonRef.current = el;
            }}
            type="button"
            onClick={() => onSelect(session.id)}
            onDoubleClick={() => setIsRenaming(true)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={rowAccessibleName}
            title={rowTitle}
            className={rowClassName}
          >
            {rowContent}
          </button>
        )}

        {/*
         * Revealed on hover OR focus-within OR on any device that cannot hover.
         * Keyboard users were already covered by group-focus-within, but a phone
         * has no hover state at all: rename / pin / archive / delete were simply
         * unreachable, while the invisible 0-opacity strip still absorbed taps
         * meant for the conversation row. `(hover: none)` is the correct query.
         * `pointer: coarse` also matches some hybrid laptops that DO hover.
         */}
        <div className="flex items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
          {session.hasCustomInstructions && onOpenCustomInstructions && (
            <button
              type="button"
              title={t('sidebar.customInstructions', 'Custom instructions')}
              onClick={(e) => {
                e.stopPropagation();
                onOpenCustomInstructions(session.id);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-amber-500 hover:bg-[hsl(var(--muted))] [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
            >
              <Sparkles className="h-3 w-3" />
            </button>
          )}
          <Menu
            align="end"
            trigger={({ toggle }) => (
              <button
                type="button"
                title={t('sidebar.moreActions', 'More actions')}
                aria-label={t('sidebar.conversationActions', 'Conversation actions')}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] [@media(hover:none)]:h-9 [@media(hover:none)]:w-9"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            )}
          >
            {({ close }) => (
              <>
                {!simple && onTogglePin && (
                  <MenuItem
                    close={close}
                    onSelect={() => onTogglePin(session.id)}
                    icon={
                      session.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />
                    }
                  >
                    {session.pinned ? t('sidebar.unpin', 'Unpin') : t('sidebar.pin', 'Pin')}
                  </MenuItem>
                )}
                {!simple && onStar && (
                  <MenuItem
                    close={close}
                    onSelect={() => onStar(session.id)}
                    icon={<Star className="h-4 w-4" />}
                  >
                    {session.starred ? t('sidebar.unstar', 'Unstar') : t('sidebar.star', 'Star')}
                  </MenuItem>
                )}
                {!simple && (
                  <MenuItem
                    close={close}
                    onSelect={() => setIsRenaming(true)}
                    icon={<Pencil className="h-4 w-4" />}
                  >
                    {t('sidebar.rename', 'Rename')}
                  </MenuItem>
                )}
                {!simple && onShare && (
                  <MenuItem
                    close={close}
                    onSelect={() => onShare(session.id)}
                    icon={<Link2 className="h-4 w-4" />}
                  >
                    {t('sidebar.share', 'Share')}
                  </MenuItem>
                )}
                {!simple && onMoveToProject && projects && projects.length > 0 && (
                  <>
                    <MenuSeparator />
                    <div className="px-2 py-1 text-[12px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {t('sidebar.moveToProject', 'Move to project')}
                    </div>
                    {projects.map((project) => (
                      <MenuItem
                        key={project.id}
                        close={close}
                        onSelect={() => onMoveToProject(session.id, project.id)}
                        icon={
                          project.iconEmoji ? (
                            <span className="text-sm leading-none">{project.iconEmoji}</span>
                          ) : (
                            <Folder className="h-4 w-4" />
                          )
                        }
                        active={session.projectId === project.id}
                      >
                        {project.name}
                      </MenuItem>
                    ))}
                  </>
                )}
                {!simple && (onArchive || onRestore) && (
                  <>
                    <MenuSeparator />
                    {session.archived
                      ? onRestore && (
                          <MenuItem
                            close={close}
                            onSelect={() => onRestore(session.id)}
                            icon={<ArchiveRestore className="h-4 w-4" />}
                          >
                            {t('sidebar.restore', 'Restore')}
                          </MenuItem>
                        )
                      : onArchive && (
                          <MenuItem
                            close={close}
                            onSelect={() => onArchive(session.id)}
                            icon={<Archive className="h-4 w-4" />}
                          >
                            {t('sidebar.archive', 'Archive')}
                          </MenuItem>
                        )}
                  </>
                )}
                <MenuItem
                  close={close}
                  onSelect={() => onDelete(session.id)}
                  icon={<Trash2 className="h-4 w-4" />}
                  destructive
                >
                  {t('sidebar.delete', 'Delete')}
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
    </div>
  );
}

export const SessionItem = memo(SessionItemBase);
SessionItem.displayName = 'SessionItem';
