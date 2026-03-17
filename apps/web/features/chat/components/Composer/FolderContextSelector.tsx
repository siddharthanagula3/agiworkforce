'use client';

/**
 * FolderContextSelector
 *
 * Compact dropdown in the composer footer that lets the user attach a
 * folder/project context to the current conversation.
 *
 * - Fetches the user's folders from FolderManagementService on mount
 * - Shows a "No folder" option to clear context
 * - Gracefully hides if user is not authenticated or has no folders
 */

import { useEffect, useState, useCallback, memo } from 'react';
import { Folder, FolderOpen, ChevronDown } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui/popover';
import { cn } from '@shared/lib/utils';
import {
  folderManagementService,
  type ChatFolder,
} from '@features/chat/services/folder-management-service';
import { useAuthStore } from '@shared/stores/authentication-store';

interface FolderContextSelectorProps {
  selectedFolderId: string | null;
  onChange: (folderId: string | null) => void;
  disabled?: boolean;
}

const FOLDER_COLOR_MAP: Record<string, string> = {
  blue: 'text-blue-500',
  green: 'text-green-500',
  red: 'text-red-500',
  purple: 'text-purple-500',
  yellow: 'text-yellow-500',
  pink: 'text-pink-500',
  orange: 'text-orange-500',
  gray: 'text-muted-foreground',
};

const FolderContextSelectorComponent = ({
  selectedFolderId,
  onChange,
  disabled = false,
}: FolderContextSelectorProps) => {
  const { user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<ChatFolder[]>([]);

  const loadFolders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await folderManagementService.getUserFolders(user.id);
      setFolders(data);
    } catch {
      // Silently degrade — folder context is optional
    }
  }, [user?.id]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Don't render when there's nothing to show
  if (folders.length === 0) return null;

  const selectedFolder = folders.find((f) => f.id === selectedFolderId) ?? null;
  const FolderIcon = selectedFolder ? FolderOpen : Folder;
  const iconColorClass = selectedFolder
    ? (FOLDER_COLOR_MAP[selectedFolder.color] ?? 'text-muted-foreground')
    : 'text-muted-foreground';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors',
            'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            selectedFolder && 'text-foreground',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          aria-label={selectedFolder ? `Project: ${selectedFolder.name}` : 'Select project folder'}
          aria-expanded={open}
        >
          <FolderIcon className={cn('h-3 w-3 shrink-0', iconColorClass)} />
          <span className="hidden max-w-[100px] truncate sm:inline">
            {selectedFolder ? selectedFolder.name : 'Folder'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-56 p-1.5">
        <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Project Context
        </div>

        {/* No folder option */}
        <button
          onClick={() => {
            onChange(null);
            setOpen(false);
          }}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
            !selectedFolderId ? 'bg-muted/60 font-medium' : 'hover:bg-muted/40',
          )}
        >
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left text-muted-foreground">No folder</span>
          {!selectedFolderId && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
        </button>

        {/* Folder list */}
        {folders.map((folder) => {
          const isSelected = folder.id === selectedFolderId;
          const colorClass = FOLDER_COLOR_MAP[folder.color] ?? 'text-muted-foreground';
          return (
            <button
              key={folder.id}
              onClick={() => {
                onChange(folder.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                isSelected ? 'bg-muted/60 font-medium' : 'hover:bg-muted/40',
              )}
            >
              <FolderOpen className={cn('h-3.5 w-3.5 shrink-0', colorClass)} />
              <span className="flex-1 truncate text-left">{folder.name}</span>
              {isSelected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};

export const FolderContextSelector = memo(FolderContextSelectorComponent);
FolderContextSelector.displayName = 'FolderContextSelector';
