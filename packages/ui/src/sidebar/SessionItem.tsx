'use client';

/**
 * SessionItem — a single conversation row, ChatGPT-style: title + preview,
 * active highlight, inline-rename, and a hover 3-dots menu exposing pin/star/
 * rename/share/archive/move-to-project/delete. Ported from the desktop
 * ConversationItem hover-action layout + the web ConversationListItem menu,
 * merged into one prop-driven, store-free component.
 *
 * Every action is an injected callback; the component performs NO IO.
 */
import { memo, useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { cn } from '../cn';
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
  /** When set, shows a "in <name>" attribution line under the preview. */
  projectName?: string;
  /** Projects offered in the "Move to project" submenu. */
  projects?: SidebarProject[];
  /** Compact menu (delete only) — mirrors desktop Simple Mode. */
  simple?: boolean;
}

function SessionItemBase({
  session,
  isActive,
  isKeyboardFocused = false,
  projectName,
  projects,
  simple = false,
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
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const submitRename = () => {
    const next = renameValue.trim();
    if (next && next !== session.title) {
      onRename(session.id, next);
    }
    setIsRenaming(false);
  };

  const preview = session.lastMessage ?? session.preview;

  if (isRenaming) {
    return (
      <div className="mb-1 rounded-lg px-2 py-1.5">
        <input
          ref={inputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={submitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename();
            if (e.key === 'Escape') setIsRenaming(false);
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
        <button
          type="button"
          onClick={() => onSelect(session.id)}
          onDoubleClick={() => setIsRenaming(true)}
          aria-current={isActive ? 'page' : undefined}
          className="min-w-0 flex-1 overflow-hidden px-3 py-2 text-left"
        >
          <div className="flex items-center gap-1.5">
            {session.starred && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
            <span className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
              {session.title || 'Untitled'}
            </span>
          </div>
          {preview && (
            <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">{preview}</div>
          )}
          {projectName && (
            <div className="mt-0.5 truncate text-[10px] text-[hsl(var(--muted-foreground))]">
              in <span className="font-medium text-[hsl(var(--foreground))]/60">{projectName}</span>
            </div>
          )}
        </button>

        <div className="flex items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          {session.hasCustomInstructions && onOpenCustomInstructions && (
            <button
              type="button"
              title="Custom instructions"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCustomInstructions(session.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-amber-500 hover:bg-[hsl(var(--muted))]"
            >
              <Sparkles className="h-3 w-3" />
            </button>
          )}
          <Menu
            align="end"
            trigger={({ toggle }) => (
              <button
                type="button"
                title="More actions"
                aria-label="Conversation actions"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
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
                    {session.pinned ? 'Unpin' : 'Pin'}
                  </MenuItem>
                )}
                {!simple && onStar && (
                  <MenuItem
                    close={close}
                    onSelect={() => onStar(session.id)}
                    icon={<Star className="h-4 w-4" />}
                  >
                    {session.starred ? 'Unstar' : 'Star'}
                  </MenuItem>
                )}
                {!simple && (
                  <MenuItem
                    close={close}
                    onSelect={() => setIsRenaming(true)}
                    icon={<Pencil className="h-4 w-4" />}
                  >
                    Rename
                  </MenuItem>
                )}
                {!simple && onShare && (
                  <MenuItem
                    close={close}
                    onSelect={() => onShare(session.id)}
                    icon={<Link2 className="h-4 w-4" />}
                  >
                    Share
                  </MenuItem>
                )}
                {!simple && onMoveToProject && projects && projects.length > 0 && (
                  <>
                    <MenuSeparator />
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      Move to project
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
                            Restore
                          </MenuItem>
                        )
                      : onArchive && (
                          <MenuItem
                            close={close}
                            onSelect={() => onArchive(session.id)}
                            icon={<Archive className="h-4 w-4" />}
                          >
                            Archive
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
                  Delete
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
