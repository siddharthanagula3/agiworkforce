/**
 * FolderSelector Component
 *
 * Allows users to scope their chat session to a specific project folder,
 * similar to Claude Code and Windsurf. The selected folder provides context
 * for file operations and helps the AI understand the project structure.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { ChevronDown, Folder, FolderOpen, X, Clock, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { invoke } from '@/lib/tauri-mock';
import {
  useProjectStore,
  selectCurrentFolder,
  selectRecentFolders,
  formatFolderPath,
} from '@/stores/unified/projectStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';

export interface FolderSelectorProps {
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
  /** Whether to show in compact mode (icon only when no folder selected) */
  compact?: boolean;
  /** Whether in simple mode (simplified UI) */
  isSimpleMode?: boolean;
}

export const FolderSelector: React.FC<FolderSelectorProps> = ({
  disabled = false,
  className,
  compact = false,
  isSimpleMode = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const hasHydratedRef = useRef(false);

  // Store selectors
  const currentFolder = useProjectStore(selectCurrentFolder);
  const recentFolders = useProjectStore(selectRecentFolders);
  const setCurrentFolder = useProjectStore((state: any) => state.setCurrentFolder);
  const removeRecentFolder = useProjectStore((state: any) => state.removeRecentFolder);
  const clearRecentFolders = useProjectStore((state: any) => state.clearRecentFolders);

  // Format display name
  const displayName = useMemo(() => {
    if (!currentFolder) return null;
    return formatFolderPath(currentFolder);
  }, [currentFolder]);

  const syncFolderContext = useCallback(async (path: string | null) => {
    await invoke('project_context_set_folder', { path });
  }, []);

  // Handle folder selection via native dialog
  const handleSelectFolder = useCallback(async () => {
    if (isSelecting) return;

    setIsSelecting(true);
    setIsOpen(false);

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });

      if (selected && typeof selected === 'string') {
        await syncFolderContext(selected);
        setCurrentFolder(selected);
      }
    } catch {
      // Error is non-fatal; the user can try again
    } finally {
      setIsSelecting(false);
    }
  }, [isSelecting, setCurrentFolder, syncFolderContext]);

  // Handle selecting a recent folder
  const handleSelectRecentFolder = useCallback(
    async (path: string) => {
      try {
        await syncFolderContext(path);
        setCurrentFolder(path);
        setIsOpen(false);
      } catch {
        // Error is non-fatal; the user can try again
      }
    },
    [setCurrentFolder, syncFolderContext],
  );

  // Handle removing a recent folder
  const handleRemoveRecentFolder = useCallback(
    (e: React.MouseEvent, path: string) => {
      e.stopPropagation();
      removeRecentFolder(path);
    },
    [removeRecentFolder],
  );

  // Handle clearing current folder
  const handleClearFolder = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      try {
        await syncFolderContext(null);
        setCurrentFolder(null);
        setIsOpen(false);
      } catch (error) {
        console.error('[FolderSelector] Failed to clear folder context:', error);
      }
    },
    [setCurrentFolder, syncFolderContext],
  );

  useEffect(() => {
    if (hasHydratedRef.current) {
      return;
    }
    hasHydratedRef.current = true;

    if (!currentFolder) {
      void syncFolderContext(null);
      return;
    }

    void (async () => {
      try {
        await syncFolderContext(currentFolder);
      } catch (error) {
        console.warn('[FolderSelector] Persisted folder is invalid, clearing selection', error);
        setCurrentFolder(null);
      }
    })();
  }, [currentFolder, setCurrentFolder, syncFolderContext]);

  // Filter recent folders to not include current folder
  const filteredRecentFolders = useMemo(() => {
    return recentFolders.filter((f: string) => f !== currentFolder);
  }, [recentFolders, currentFolder]);

  // Render the trigger button content
  const renderTriggerContent = () => {
    if (currentFolder) {
      // In compact mode, show just the icon
      if (compact) {
        return <FolderOpen size={18} className="text-primary" aria-hidden="true" />;
      }
      return (
        <>
          <FolderOpen size={16} className="text-primary shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[100px] text-sm font-medium">{displayName}</span>
          <ChevronDown
            size={14}
            className={cn(
              'text-gray-400 dark:text-gray-500 shrink-0 transition-transform',
              isOpen && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </>
      );
    }

    if (compact) {
      return <Folder size={18} className="text-gray-400 dark:text-gray-500" aria-hidden="true" />;
    }

    return (
      <>
        <Folder
          size={16}
          className="text-gray-400 dark:text-gray-500 shrink-0"
          aria-hidden="true"
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {isSimpleMode ? 'Select folder' : 'No folder selected'}
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'text-gray-400 dark:text-gray-500 shrink-0 transition-transform',
            isOpen && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </>
    );
  };

  const triggerButton = (
    <button
      type="button"
      disabled={disabled || isSelecting}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors',
        'hover:bg-gray-100 dark:hover:bg-charcoal-700',
        'focus:outline-none focus:ring-2 focus:ring-primary/20',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        currentFolder && 'bg-primary/5 dark:bg-primary/10',
        className,
      )}
      aria-label={currentFolder ? `Project folder: ${displayName}` : 'Select project folder'}
    >
      {renderTriggerContent()}
    </button>
  );

  const dropdownMenu = (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>{triggerButton}</DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400">
          Project Folder
        </DropdownMenuLabel>

        {/* Current folder section */}
        {currentFolder && (
          <>
            <div className="px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-primary/5 dark:bg-primary/10">
                <div className="flex items-center gap-2 min-w-0">
                  <FolderOpen size={14} className="text-primary shrink-0" />
                  <span className="text-sm truncate" title={currentFolder}>
                    {displayName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleClearFolder}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-charcoal-600 transition-colors"
                  title="Clear folder selection"
                >
                  <X size={14} className="text-gray-500 dark:text-gray-400" />
                </button>
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Browse action */}
        <DropdownMenuItem
          onClick={handleSelectFolder}
          disabled={isSelecting}
          className="cursor-pointer"
        >
          <Folder size={14} className="mr-2 text-gray-500 dark:text-gray-400" />
          <span>{isSelecting ? 'Opening...' : 'Browse for folder...'}</span>
        </DropdownMenuItem>

        {/* Recent folders */}
        {filteredRecentFolders.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1.5">
              <DropdownMenuLabel className="text-xs text-gray-500 dark:text-gray-400 p-0">
                <Clock size={12} className="inline mr-1" />
                Recent Folders
              </DropdownMenuLabel>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearRecentFolders();
                }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Clear recent folders"
              >
                Clear all
              </button>
            </div>
            {filteredRecentFolders.slice(0, 5).map((folder: string) => (
              <DropdownMenuItem
                key={folder}
                onClick={() => handleSelectRecentFolder(folder)}
                className="cursor-pointer group"
              >
                <Folder size={14} className="mr-2 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="truncate flex-1" title={folder}>
                  {formatFolderPath(folder)}
                </span>
                <button
                  type="button"
                  onClick={(e) => handleRemoveRecentFolder(e, folder)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-charcoal-600 transition-all"
                  title="Remove from recent"
                >
                  <Trash2 size={12} className="text-gray-400" />
                </button>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* Help text */}
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs text-gray-400 dark:text-gray-500">
          {isSimpleMode
            ? 'Select a folder to work with files in that location.'
            : 'Scope your session to a specific project directory for file operations.'}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Wrap in Tooltip only in compact mode
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{dropdownMenu}</div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{currentFolder ? displayName : 'Select a project folder to scope your session'}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return dropdownMenu;
};

export default FolderSelector;
