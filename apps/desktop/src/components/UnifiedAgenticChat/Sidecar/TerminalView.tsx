import React from 'react';
import { Terminal as TerminalIcon, Maximize2, Minimize2 } from 'lucide-react';
import { TerminalPanel } from '../../execution/TerminalPanel';
import { cn } from '../../../lib/utils';

interface TerminalViewProps {
  contextId?: string;
  className?: string;
}

export function TerminalView({ contextId, className }: TerminalViewProps) {
  const [isFullHeight, setIsFullHeight] = React.useState(false);

  return (
    <div className={cn('flex h-full flex-col bg-zinc-950', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-4 w-4 text-emerald-500" />
          <span className="text-sm font-semibold text-zinc-200">Terminal Output</span>
          {contextId && (
            <span className="text-xs text-zinc-500">• Session: {contextId.slice(0, 8)}</span>
          )}
        </div>
        <button
          onClick={() => setIsFullHeight(!isFullHeight)}
          className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          title={isFullHeight ? 'Restore height' : 'Maximize height'}
        >
          {isFullHeight ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Terminal Content */}
      <div className={cn('flex-1 overflow-hidden', isFullHeight && 'h-screen')}>
        <TerminalPanel className="h-full" />
      </div>

      {/* Footer with command hints */}
      <div className="border-t border-zinc-800 bg-zinc-900/30 px-4 py-2">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">Ctrl</kbd>
            <span>+</span>
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">F</kbd>
            <span className="ml-1">Search</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">Ctrl</kbd>
            <span>+</span>
            <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono">C</kbd>
            <span className="ml-1">Copy</span>
          </div>
          <div className="ml-auto text-zinc-600">Read-only terminal • Live command output</div>
        </div>
      </div>
    </div>
  );
}
