'use client';

import { useCallback, useState } from 'react';
import {
  ChevronDown,
  Download,
  GitFork,
  Pencil,
  Printer,
  Share2,
  Trash2,
  FolderInput,
} from 'lucide-react';
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
  title: string;
  projects: ReadonlyArray<{ id: string; name: string }>;
  onRename: (title: string) => void;
  onMoveToProject?: (projectId: string) => void;
  onDelete: () => void;
  onPrint?: () => void;
  onExport?: () => void;
  onShare?: () => void;
  onFork?: () => void;
}

export function ConversationTitleMenu({
  title,
  projects,
  onRename,
  onMoveToProject,
  onDelete,
  onFork,
  onPrint,
  onExport,
  onShare,
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
    <div className="flex min-w-0 flex-1 items-center justify-start">
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
          className="w-[240px] max-w-full rounded-md border border-[var(--chat-border-strong)] bg-[var(--chat-surface-base)] px-2 py-0.5 text-start text-sm font-medium text-[var(--chat-text-primary)] outline-none focus:ring-2 focus:ring-primary"
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
          <DropdownMenuContent align="start" className="w-52">
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
            {/*
              Share also has a header button, which a phone hides: at 320px the
              header's two fixed groups left the title 24px of a 255px name.
              The action has to keep a home before the button can go.
            */}
            {onShare && (
              <DropdownMenuItem onSelect={() => onShare()}>
                <Share2 className="mr-2 h-4 w-4" />
                Share…
              </DropdownMenuItem>
            )}
            {onPrint && (
              <DropdownMenuItem onSelect={() => onPrint()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </DropdownMenuItem>
            )}
            {onExport && (
              <DropdownMenuItem onSelect={() => onExport()}>
                <Download className="mr-2 h-4 w-4" />
                Export…
              </DropdownMenuItem>
            )}
            {onFork && (
              <DropdownMenuItem onSelect={() => onFork()}>
                <GitFork className="mr-2 h-4 w-4" />
                Duplicate as branch
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => onDelete()}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
