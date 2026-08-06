'use client';

/**
 * ConversationTitleMenu · the active-chat header title rendered as a dropdown
 * trigger (chevron) exposing Rename / Move to project / Delete.
 *
 * Extracted from WebChatPage so the interactive title has a focused, testable
 * home (WebChatPage itself is too heavy to mount in a unit test). All actions
 * are prop-driven; the component owns only the inline-rename UI state.
 *
 * - Rename swaps the title for an inline <input>; Enter / blur commits via
 *   onRename (no-op on empty / unchanged), Escape cancels.
 * - Move to project renders a submenu over `projects` (only when non-empty and
 *   onMoveToProject is provided).
 * - Delete calls onDelete (the caller is responsible for its own confirm).
 */

import { useCallback, useState } from 'react';
import { ChevronDown, Pencil, Trash2, FolderInput } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@agiworkforce/ui';

export interface ConversationTitleMenuProps {
  /** Current conversation title (already filtered to non-empty, != 'New Chat'). */
  title: string;
  /** Projects available as move-to targets. */
  projects: ReadonlyArray<{ id: string; name: string }>;
  /** Commit a new title. */
  onRename: (title: string) => void;
  /** Move the conversation into a project. Omit to hide the submenu. */
  onMoveToProject?: (projectId: string) => void;
  /** Delete the conversation (caller confirms). */
  onDelete: () => void;
}

export function ConversationTitleMenu({
  title,
  projects,
  onRename,
  onMoveToProject,
  onDelete,
}: ConversationTitleMenuProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draft, setDraft] = useState('');

  const startRename = useCallback(() => {
    setDraft(title);
    setIsRenaming(true);
  }, [title]);

  const commitRename = useCallback(() => {
    const next = draft.trim();
    if (next && next !== title) onRename(next);
    setIsRenaming(false);
  }, [draft, title, onRename]);

  return (
    <div
      // The cap has to reserve ABSOLUTE space, not a proportion. The header's
      // icon-button groups are fixed pixel widths, so on a narrow window they eat
      // proportionally more and a centred 46% ran straight under them. Reserving
      // 14rem total keeps the title clear of both flanks at every width, while
      // still yielding to 46% on a wide one.
      className="absolute left-1/2 flex max-w-[min(46%,calc(100%-14rem))] -translate-x-1/2 items-center"
    >
      {isRenaming ? (
        <input
          autoFocus
          aria-label="Rename conversation"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setIsRenaming(false);
            }
          }}
          className="w-[240px] max-w-full rounded-md border border-[var(--chat-border-strong)] bg-[var(--chat-surface-base)] px-2 py-0.5 text-center text-sm font-medium text-[var(--chat-text-primary)] outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Conversation options"
              className="flex min-w-0 items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium text-[var(--chat-text-secondary)] transition-colors hover:bg-black/[0.04] hover:text-[var(--chat-text-primary)] dark:hover:bg-white/[0.05] outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="truncate">{title}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-52">
            <DropdownMenuItem onSelect={() => startRename()}>
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            {onMoveToProject && projects.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="mr-2 h-4 w-4" />
                  Move to project
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
                  {projects.map((p) => (
                    <DropdownMenuItem key={p.id} onSelect={() => onMoveToProject(p.id)}>
                      <span className="truncate">{p.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete()}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
