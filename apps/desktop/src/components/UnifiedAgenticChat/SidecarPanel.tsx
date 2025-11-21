import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pin, Maximize2, Minimize2 } from 'lucide-react';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { CodeCanvas, BrowserPreview, TerminalView, DiffViewer } from './Sidecar';
import { cn } from '../../lib/utils';
import { useReducedMotion } from '../../hooks/useReducedMotion';

export interface SidecarPanelProps {
  className?: string;
}

const MIN_WIDTH = 400;
const MAX_WIDTH = 1200;
const DEFAULT_WIDTH = 600;

export function SidecarPanel({ className }: SidecarPanelProps) {
  const { sidecar, closeSidecar } = useUnifiedChatStore();
  const [width, setWidth] = React.useState(DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = React.useState(false);
  const [isPinned, setIsPinned] = React.useState(false);
  const [isMaximized, setIsMaximized] = React.useState(false);
  const prefersReducedMotion = useReducedMotion();

  const panelRef = React.useRef<HTMLDivElement>(null);

  // Handle resize drag
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      setWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Get mode label for header
  const getModeLabel = () => {
    switch (sidecar.activeMode) {
      case 'code':
        return 'Code Editor';
      case 'browser':
        return 'Browser Preview';
      case 'terminal':
        return 'Terminal Output';
      case 'diff':
        return 'Diff Viewer';
      case 'preview':
        return 'Preview';
      default:
        return 'Sidecar';
    }
  };

  // Render mode-specific content
  const renderContent = () => {
    switch (sidecar.activeMode) {
      case 'code':
        return <CodeCanvas contextId={sidecar.contextId || undefined} className="h-full" />;
      case 'browser':
        return <BrowserPreview contextId={sidecar.contextId || undefined} className="h-full" />;
      case 'terminal':
        return <TerminalView contextId={sidecar.contextId || undefined} className="h-full" />;
      case 'diff':
        return <DiffViewer contextId={sidecar.contextId || undefined} className="h-full" />;
      case 'preview':
        return (
          <div className="flex h-full items-center justify-center bg-zinc-950">
            <div className="text-center">
              <p className="text-sm text-zinc-400">Preview mode</p>
              <p className="mt-1 text-xs text-zinc-500">Content preview will appear here</p>
            </div>
          </div>
        );
      default:
        return (
          <div className="flex h-full items-center justify-center bg-zinc-950">
            <div className="text-center">
              <p className="text-sm text-zinc-400">No content to display</p>
              <p className="mt-1 text-xs text-zinc-500">
                Sidecar will open automatically when relevant
              </p>
            </div>
          </div>
        );
    }
  };

  if (!sidecar.isOpen) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={panelRef}
        initial={prefersReducedMotion ? { opacity: 1 } : { x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { x: '100%', opacity: 0 }}
        transition={
          prefersReducedMotion
            ? { duration: 0.15 }
            : {
                type: 'spring',
                stiffness: 300,
                damping: 30,
              }
        }
        className={cn(
          'fixed right-0 top-0 z-40 flex h-screen flex-col',
          'border-l border-zinc-800 bg-zinc-950',
          'shadow-2xl',
          className,
        )}
        style={{
          width: isMaximized ? '100vw' : `${width}px`,
          willChange: isResizing ? 'width' : 'auto',
        }}
      >
        {/* Resize Handle */}
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1 hover:w-1.5',
            'bg-transparent hover:bg-teal cursor-col-resize transition-all',
            isResizing && 'bg-teal w-1.5',
          )}
          onMouseDown={handleMouseDown}
        />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-200">{getModeLabel()}</h3>
            {sidecar.contextId && (
              <span className="text-xs text-zinc-500">
                • {sidecar.contextId.slice(0, 20)}
                {sidecar.contextId.length > 20 && '...'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1" role="toolbar" aria-label="Sidecar controls">
            {/* Maximize/Minimize */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className={cn(
                'rounded-lg p-1.5 transition-colors',
                'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200',
              )}
              title={isMaximized ? 'Restore size' : 'Maximize'}
              aria-label={isMaximized ? 'Restore sidecar size' : 'Maximize sidecar'}
              aria-pressed={isMaximized}
            >
              {isMaximized ? (
                <Minimize2 size={14} aria-hidden="true" />
              ) : (
                <Maximize2 size={14} aria-hidden="true" />
              )}
            </button>

            {/* Pin */}
            <button
              onClick={() => setIsPinned(!isPinned)}
              className={cn(
                'rounded-lg p-1.5 transition-colors',
                isPinned
                  ? 'bg-teal/20 text-teal'
                  : 'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200',
              )}
              title={isPinned ? 'Unpin' : 'Pin'}
              aria-label={isPinned ? 'Unpin sidecar' : 'Pin sidecar'}
              aria-pressed={isPinned}
            >
              <Pin size={14} aria-hidden="true" />
            </button>

            {/* Close */}
            <button
              onClick={closeSidecar}
              className={cn(
                'rounded-lg p-1.5 transition-colors',
                'hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200',
              )}
              title="Close sidecar"
              aria-label="Close sidecar"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={sidecar.activeMode}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={{ duration: prefersReducedMotion ? 0.1 : 0.15 }}
              className="h-full"
              style={{ willChange: prefersReducedMotion ? 'auto' : 'opacity, transform' }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Auto-trigger indicator */}
        {sidecar.autoTrigger && (
          <div className="absolute bottom-4 left-4 right-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 backdrop-blur-sm"
            >
              <p className="text-xs text-teal">
                <span className="font-semibold">Auto-opened</span> • This sidecar was automatically
                triggered based on message content
              </p>
            </motion.div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default SidecarPanel;
