import { X, Minus, Square, Search, Minimize2, Menu } from 'lucide-react';
import { WindowActions } from '../../hooks/useWindowManager';
import { Button } from '../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { cn } from '../../lib/utils';

interface TitleBarProps {
  state: {
    focused: boolean;
    maximized: boolean;
  };
  actions: WindowActions;
  onOpenCommandPalette: () => void;
  commandShortcutHint?: string;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const TitleBar = ({
  state,
  actions,
  onOpenCommandPalette,
  commandShortcutHint,
  sidebarCollapsed,
  onToggleSidebar,
}: TitleBarProps) => {
  return (
    <header
      className={cn(
        'flex items-center justify-between gap-2 px-4 py-2 h-12 shrink-0',
        'bg-background/90 backdrop-blur-xl',
        'border-b border-border/60 rounded-t-2xl',
        'shadow-[0_2px_12px_rgba(8,12,20,0.22)]',
        'select-none',
        'min-w-[640px]',
        'relative z-50',
      )}
      data-tauri-drag-region
    >
      {/* Logo and Title */}
      <div className="flex.items-center gap-3 min-w-0 shrink" data-tauri-drag-region>
        <button
          type="button"
          onClick={onToggleSidebar}
          disabled={!onToggleSidebar}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition-colors',
            'hover:bg-accent hover:text-foreground',
            !onToggleSidebar && 'cursor-not-allowed opacity-50',
          )}
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex flex-col min-w-0 overflow-hidden" data-tauri-drag-region>
          <h1 className="text-sm font-semibold leading-none truncate">AGI Workforce</h1>
          <p className="text-xs text-muted-foreground leading-none mt-0.5 truncate">
            {sidebarCollapsed ? 'Sidebar hidden' : state.focused ? 'Ready' : 'Inactive'}
          </p>
        </div>
      </div>

      {/* Window Controls */}
      <div className="flex items-center gap-1 shrink-0" data-tauri-drag-region="false">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-accent"
              onClick={onOpenCommandPalette}
              aria-label="Open command palette"
            >
              <Search className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex flex-col gap-1">
              <span>Command palette</span>
              {commandShortcutHint && (
                <span className="text-[11px] text-muted-foreground">{commandShortcutHint}</span>
              )}
            </div>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-accent"
              onClick={() => void actions.minimize()}
              aria-label="Minimize window"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Minimize</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-accent"
              onClick={() => void actions.toggleMaximize()}
              aria-label={state.maximized ? 'Restore window' : 'Maximize window'}
              aria-pressed={state.maximized}
            >
              {state.maximized ? <Minimize2 className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{state.maximized ? 'Restore' : 'Maximize'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => void actions.close()}
              aria-label="Close window"
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Close</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
};

export default TitleBar;
