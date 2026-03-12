import { useEffect, useCallback } from 'react';
import { Monitor, Square, Play } from 'lucide-react';
import {
  useComputerUseStore,
  selectIsActive,
  selectSessionId,
  selectComputerUseError,
  subscribeToComputerUseEvents,
} from '../../stores/computerUseStore';
import { ScreenPreview } from './ScreenPreview';
import { ActionLog } from './ActionLog';
import { cn } from '../../lib/utils';

export function ComputerUseMonitor() {
  const isActive = useComputerUseStore(selectIsActive);
  const sessionId = useComputerUseStore(selectSessionId);
  const error = useComputerUseStore(selectComputerUseError);
  const startSession = useCallback(() => {
    useComputerUseStore.getState().startSession();
  }, []);
  const stopSession = useCallback(() => {
    useComputerUseStore.getState().stopSession();
  }, []);

  // Subscribe to Tauri events
  useEffect(() => {
    const cleanup = subscribeToComputerUseEvents();
    return cleanup;
  }, []);

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200">Computer Use</h2>
          {isActive ? (
            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-xs rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Active
            </span>
          ) : (
            <span className="px-2 py-0.5 bg-zinc-800 text-zinc-500 text-xs rounded-full">
              Inactive
            </span>
          )}
        </div>

        {isActive ? (
          <button type="button"
            onClick={stopSession}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              'bg-red-500/15 text-red-400 hover:bg-red-500/25',
            )}
          >
            <Square className="w-3 h-3" />
            Stop
          </button>
        ) : (
          <button type="button"
            onClick={startSession}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              'bg-teal-500/15 text-teal-400 hover:bg-teal-500/25',
            )}
          >
            <Play className="w-3 h-3" />
            Start Session
          </button>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-4 mt-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Session ID */}
      {sessionId && (
        <div className="px-4 py-1.5 text-xs text-zinc-600">
          Session: <span className="font-mono">{sessionId.slice(0, 8)}</span>
        </div>
      )}

      {/* Screen Preview (top 60%) */}
      <div className="flex-[6] min-h-0 p-3">
        <ScreenPreview />
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-800" />

      {/* Action Log header */}
      <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-800">
        <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Action Log</h3>
        <button type="button"
          onClick={() => useComputerUseStore.getState().clearLog()}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Action Log (bottom 40%) */}
      <div className="flex-[4] min-h-0 overflow-hidden">
        <ActionLog />
      </div>
    </div>
  );
}
