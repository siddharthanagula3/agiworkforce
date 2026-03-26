import { useCallback, useState } from 'react';
import {
  Bookmark,
  Folder,
  FolderOpen,
  Plus,
  Paperclip,
  Link,
  Brain,
  Globe,
  Check,
  X,
  ListChecks,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { isTauri } from '../../lib/tauri-mock';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/Popover';
import { ScreenCaptureButton } from '../ScreenCapture/ScreenCaptureButton';
import type { CaptureResult } from '../../types/capture';
import { cn } from '../../lib/utils';
import { useProjectStore, selectCurrentFolder, formatFolderPath } from '../../stores/projectStore';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { usePlanningStore } from '../../stores/planningStore';
import { usePromptStashStore } from '../../stores/promptStashStore';

interface PlusMenuProps {
  disabled?: boolean;
  onAttachClick: () => void;
  onScreenCapture?: (result: CaptureResult) => void;
  conversationId?: number;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  visionSupported?: boolean;
  /** Current text in the chat input (for prompt stash save) */
  promptStashText?: string;
  /** Callback to load a saved prompt into the chat input */
  onPromptStashLoad?: (text: string) => void;
}

export function PlusMenu({
  disabled,
  onAttachClick,
  onScreenCapture,
  conversationId,
  webSearchEnabled,
  onToggleWebSearch,
  visionSupported = true,
  promptStashText = '',
  onPromptStashLoad,
}: PlusMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showStashPanel, setShowStashPanel] = useState(false);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  // Folder selection
  const currentFolder = useProjectStore(selectCurrentFolder);
  const setCurrentFolder = useProjectStore((s) => s.setCurrentFolder);
  const folderDisplayName = currentFolder ? formatFolderPath(currentFolder) : null;

  // Prompt stash
  const stashEntries = usePromptStashStore((s) => s.entries);
  const stashSave = usePromptStashStore((s) => s.save);
  const stashRemove = usePromptStashStore((s) => s.remove);

  const handleClearFolder = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentFolder(null);
    },
    [setCurrentFolder],
  );

  const handleSelectFolder = useCallback(async () => {
    setIsOpen(false);
    setShowStashPanel(false);
    if (!isTauri) {
      toast.info('Folder selection requires the desktop app');
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });
      if (selected && typeof selected === 'string') {
        setCurrentFolder(selected);
      }
    } catch {
      // User cancelled -- non-fatal
    }
  }, [setCurrentFolder]);

  const handleSavePrompt = useCallback(() => {
    const trimmed = promptStashText.trim();
    if (!trimmed) return;
    stashSave(trimmed);
    toast.success('Prompt saved');
    setShowStashPanel(false);
    setIsOpen(false);
  }, [promptStashText, stashSave]);

  const handleLoadPrompt = useCallback(
    (text: string) => {
      onPromptStashLoad?.(text);
      toast.success('Prompt loaded');
      setShowStashPanel(false);
      setIsOpen(false);
    },
    [onPromptStashLoad],
  );

  // When popover closes, also close stash sub-panel
  const handleOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setShowStashPanel(false);
  }, []);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]',
            'transition-colors duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
          aria-label="Attach or toggle modes"
        >
          <Plus className="h-4 w-4" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className={cn(
          'w-56 rounded-xl border border-[hsl(var(--border))] p-1.5',
          'bg-popover shadow-xl',
        )}
      >
        {/* Stash sub-panel */}
        {showStashPanel ? (
          <div>
            <button
              type="button"
              onClick={() => setShowStashPanel(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--popover-foreground))] transition-colors"
            >
              <span>&larr;</span>
              <span>Back</span>
            </button>

            {/* Save current prompt */}
            {promptStashText.trim() && (
              <button
                type="button"
                onClick={handleSavePrompt}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              >
                <Bookmark className="h-4 w-4 shrink-0 text-primary" />
                <span>Save current prompt</span>
              </button>
            )}

            {stashEntries.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                No saved prompts yet.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                {stashEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="group flex items-start gap-2 rounded-lg px-3 py-2 cursor-pointer hover:bg-[hsl(var(--accent))] transition-colors"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLoadPrompt(entry.text)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleLoadPrompt(entry.text);
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[hsl(var(--popover-foreground))] truncate">
                        {entry.label ||
                          (entry.text.length > 50 ? `${entry.text.slice(0, 50)}...` : entry.text)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        stashRemove(entry.id);
                        toast.success('Prompt removed');
                      }}
                      className="opacity-0 group-hover:opacity-100 shrink-0 rounded p-0.5 text-[hsl(var(--muted-foreground))] hover:text-red-400 transition-all"
                      aria-label="Delete saved prompt"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Attach files (requires Tauri file dialog) */}
            {isTauri && (
              <button
                type="button"
                onClick={() => {
                  onAttachClick();
                  setIsOpen(false);
                }}
                title={
                  !visionSupported ? 'Images will not be processed by the current model' : undefined
                }
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              >
                <Paperclip
                  className={cn(
                    'h-4 w-4 shrink-0',
                    !visionSupported && 'text-[hsl(var(--muted-foreground))]',
                  )}
                />
                <span>{visionSupported ? 'Add files or photos' : 'Add files'}</span>
                {!visionSupported && (
                  <span className="ml-auto text-xs text-amber-400/80">No vision</span>
                )}
              </button>
            )}

            {/* Paste screenshot (requires Tauri screen capture) */}
            {isTauri && onScreenCapture && (
              <div title={!visionSupported ? "Selected model doesn't support images" : undefined}>
                <ScreenCaptureButton
                  conversationId={conversationId}
                  onCaptureComplete={(result) => {
                    onScreenCapture?.(result);
                    setIsOpen(false);
                  }}
                  variant="ghost"
                  size="default"
                  mode="quick"
                  suppressToasts
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors justify-start h-auto font-normal',
                    !visionSupported && 'opacity-40 pointer-events-none',
                  )}
                />
              </div>
            )}

            {/* Select folder (requires Tauri file dialog) */}
            {isTauri && (
              <button
                type="button"
                onClick={handleSelectFolder}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
              >
                {currentFolder ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0" />
                )}
                <div className="flex-1 text-left min-w-0">
                  {currentFolder ? (
                    <>
                      <div className="text-xs text-[hsl(var(--muted-foreground))] leading-tight">
                        Project folder
                      </div>
                      <div className="truncate leading-tight">{folderDisplayName}</div>
                    </>
                  ) : (
                    <span>Select folder</span>
                  )}
                </div>
                {currentFolder && (
                  <button
                    type="button"
                    onClick={handleClearFolder}
                    className="shrink-0 rounded p-0.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                    aria-label="Clear project folder"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </button>
            )}

            {/* Separator */}
            <div className="my-1.5 h-px bg-[hsl(var(--border))]" />

            {/* Saved Prompts */}
            <button
              type="button"
              onClick={() => setShowStashPanel(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              <Bookmark className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Saved Prompts</span>
              {stashEntries.length > 0 && (
                <span className="text-xs text-[hsl(var(--muted-foreground))]">
                  {stashEntries.length}
                </span>
              )}
            </button>

            {/* Connectors */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openSettings('connectors');
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              <Link className="h-4 w-4 shrink-0" />
              <span>Connectors</span>
            </button>

            {/* Skills */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openSettings('mcp');
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              <Brain className="h-4 w-4 shrink-0" />
              <span>Skills</span>
            </button>

            {/* Plan */}
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                usePlanningStore.getState().openPanel();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              <ListChecks className="h-4 w-4 shrink-0" />
              <span>Plan</span>
            </button>

            {/* Separator */}
            <div className="my-1.5 h-px bg-[hsl(var(--border))]" />

            {/* Web search toggle */}
            <button
              type="button"
              onClick={() => {
                onToggleWebSearch();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[hsl(var(--popover-foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
            >
              <Globe className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">Web search</span>
              {webSearchEnabled && <Check className="h-4 w-4 shrink-0 text-teal-400" />}
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
