import { useCallback, useMemo, useState } from 'react';
import { X, Minus, Square, Pin, PinOff, Eye, EyeOff, Search, Minimize2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { DockPosition, WindowActions } from '../../hooks/useWindowManager';
import { Button } from '../ui/Button';
import { Separator } from '../ui/Separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { cn } from '../../lib/utils';

interface TitleBarProps {
  state: {
    pinned: boolean;
    alwaysOnTop: boolean;
    dock: DockPosition | null;
    focused: boolean;
    maximized: boolean;
    fullscreen: boolean;
  };
  actions: WindowActions;
  onOpenCommandPalette: () => void;
  commandShortcutHint?: string;
}

const TitleBar = ({ state, actions, onOpenCommandPalette, commandShortcutHint }: TitleBarProps) => {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenuOpen(true);
  }, []);

  const docked = useMemo(() => state.dock !== null, [state.dock]);

  return (
    <motion.header
      className={cn(
        'flex items-center justify-between gap-2 px-3 py-2',
        'bg-gradient-to-r from-muted/60 to-muted/20',
        'border-b border-border/80',
        'backdrop-blur-md',
        'select-none',
        'cursor-move',
        'relative',
      )}
      data-tauri-drag-region
      onContextMenu={handleContextMenu}
      initial={false}
      animate={{
        borderRadius: docked ? 0 : 16,
        boxShadow: state.focused
          ? '0px 12px 28px rgba(79, 70, 229, 0.25)'
          : '0px 6px 18px rgba(15, 23, 42, 0.12)',
        opacity: state.focused ? 1 : 0.95,
      }}
      transition={{ type: 'spring', stiffness: 260, damping: 26, mass: 0.9 }}
      style={{ borderBottomLeftRadius: docked ? 0 : 16, borderBottomRightRadius: docked ? 0 : 16 }}
    >
      {/* Logo and Title */}
      <motion.div
        className="flex items-center gap-2 pointer-events-none"
        data-tauri-drag-region
        layout
        transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
      >
        <div
          className={cn(
            'flex items-center justify-center',
            'w-7 h-7 rounded-lg',
            'bg-primary/20 border border-primary/40',
            'text-xs font-bold tracking-wider text-primary',
          )}
        >
          AGI
        </div>
        <div className="flex flex-col" data-tauri-drag-region>
          <motion.h1
            className="text-sm font-semibold leading-none"
            layout
            transition={{ type: 'spring', stiffness: 320, damping: 26, mass: 0.7 }}
          >
            AGI Workforce
          </motion.h1>
          <motion.p
            key={`${state.focused}-${state.dock ?? 'floating'}`}
            className="text-xs text-muted-foreground leading-none mt-0.5"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            {state.focused ? 'Ready' : 'Inactive'} ·{' '}
            {state.dock ? `Docked ${state.dock}` : 'Floating'}
          </motion.p>
        </div>
      </motion.div>

      {/* Window Controls */}
      <motion.div
        className="flex items-center gap-1"
        data-tauri-drag-region="false"
        layout
        transition={{ type: 'spring', stiffness: 280, damping: 24, mass: 0.8 }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={state.pinned ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => void actions.togglePinned()}
              aria-pressed={state.pinned}
            >
              {state.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{state.pinned ? 'Unpin window' : 'Pin window'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpenCommandPalette}>
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
              variant={state.alwaysOnTop ? 'default' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => void actions.toggleAlwaysOnTop()}
              aria-pressed={state.alwaysOnTop}
            >
              {state.alwaysOnTop ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{state.alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}</p>
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <DropdownMenu open={contextMenuOpen} onOpenChange={setContextMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <span className="text-xs">···</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void actions.togglePinned()}>
              {state.pinned ? 'Unpin window' : 'Pin window'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void actions.toggleAlwaysOnTop()}>
              {state.alwaysOnTop ? 'Disable always on top' : 'Enable always on top'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void actions.dock('left')}>Dock left</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void actions.dock('right')}>
              Dock right
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void actions.dock(null)}>Undock</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void actions.hide()}>Hide to tray</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void actions.minimize()}
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
              className="h-8 w-8"
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
              className="h-8 w-8 hover:bg-destructive/20 hover:text-destructive"
              onClick={() => void actions.hide()}
            >
              <X className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Hide to tray</p>
          </TooltipContent>
        </Tooltip>
      </motion.div>
    </motion.header>
  );
};

export default TitleBar;
