import { useCallback, useState } from 'react';
import { Folder, FolderOpen, Plus, Paperclip, Link, Brain, Globe, Check, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/Popover';
import { ScreenCaptureButton } from '../ScreenCapture/ScreenCaptureButton';
import type { CaptureResult } from '../../types/capture';
import { cn } from '../../lib/utils';
import { useProjectStore, selectCurrentFolder, formatFolderPath } from '../../stores/projectStore';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';

interface PlusMenuProps {
  disabled?: boolean;
  onAttachClick: () => void;
  onScreenCapture?: (result: CaptureResult) => void;
  conversationId?: number;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  visionSupported?: boolean;
}

export function PlusMenu({
  disabled,
  onAttachClick,
  onScreenCapture,
  conversationId,
  webSearchEnabled,
  onToggleWebSearch,
  visionSupported = true,
}: PlusMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const openSettings = useSettingsDialogStore((s) => s.openSettings);

  // Folder selection
  const currentFolder = useProjectStore(selectCurrentFolder);
  const setCurrentFolder = useProjectStore((s) => s.setCurrentFolder);
  const folderDisplayName = currentFolder ? formatFolderPath(currentFolder) : null;

  const handleClearFolder = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentFolder(null);
    },
    [setCurrentFolder],
  );

  const handleSelectFolder = useCallback(async () => {
    setIsOpen(false);
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
      // User cancelled — non-fatal
    }
  }, [setCurrentFolder]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            'bg-charcoal-800 text-white/70 hover:text-white hover:bg-charcoal-700',
            'transition-colors duration-150',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'dark:bg-charcoal-800 dark:hover:bg-charcoal-700',
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
          'w-56 rounded-xl border border-white/10 p-1.5',
          'bg-charcoal-800 shadow-xl',
          'dark:bg-charcoal-800',
        )}
      >
        {/* Attach files */}
        <button
          type="button"
          onClick={() => {
            onAttachClick();
            setIsOpen(false);
          }}
          title={!visionSupported ? 'Images will not be processed by the current model' : undefined}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
        >
          <Paperclip className={cn('h-4 w-4 shrink-0', !visionSupported && 'text-white/40')} />
          <span>{visionSupported ? 'Add files or photos' : 'Add files'}</span>
          {!visionSupported && <span className="ml-auto text-xs text-amber-400/80">No vision</span>}
        </button>

        {/* Paste screenshot */}
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
              'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors justify-start h-auto font-normal',
              !visionSupported && 'opacity-40 pointer-events-none',
            )}
          />
        </div>

        {/* Select folder */}
        <button
          type="button"
          onClick={handleSelectFolder}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
        >
          {currentFolder ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0" />
          )}
          <div className="flex-1 text-left min-w-0">
            {currentFolder ? (
              <>
                <div className="text-xs text-white/40 leading-tight">Project folder</div>
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
              className="shrink-0 rounded p-0.5 text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors"
              aria-label="Clear project folder"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </button>

        {/* Separator */}
        <div className="my-1.5 h-px bg-white/10" />

        {/* Connectors */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            openSettings('connectors');
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
        >
          <Brain className="h-4 w-4 shrink-0" />
          <span>Skills</span>
        </button>

        {/* Separator */}
        <div className="my-1.5 h-px bg-white/10" />

        {/* Web search toggle */}
        <button
          type="button"
          onClick={() => {
            onToggleWebSearch();
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/10 transition-colors"
        >
          <Globe className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Web search</span>
          {webSearchEnabled && <Check className="h-4 w-4 shrink-0 text-teal-400" />}
        </button>
      </PopoverContent>
    </Popover>
  );
}
