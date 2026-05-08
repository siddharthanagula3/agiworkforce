/**
 * RewindTimeline
 *
 * Displays a vertical timeline of coding checkpoints and allows rewinding
 * to any saved checkpoint.
 *
 * Ported from apps/desktop/src/components/UnifiedAgenticChat/RewindTimeline.tsx
 *
 * Breaking changes vs source:
 *  - `listen` (Tauri IPC) removed. Real-time updates are handled via the
 *    `onToolEvent` prop — hosts pass a subscription callback that fires
 *    whenever a tool completes. When omitted, checkpoints refresh only on
 *    mount and after rewind.
 *  - `codeEditing` (@agiworkforce/api) removed. Hosts pass `fetchCheckpoints`
 *    and `rewindCheckpoint` async callbacks so this component has zero backend
 *    coupling and can be tested in isolation.
 */

import { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CodingCheckpoint {
  id: string;
  toolName: string;
  filePath?: string;
  createdAtMs: number;
  description?: string;
}

export interface RewindTimelineProps {
  /**
   * Called on mount (and after each rewind) to load the checkpoint list.
   * Must return an array of CodingCheckpoint objects.
   */
  fetchCheckpoints: () => Promise<CodingCheckpoint[]>;
  /**
   * Called when the user confirms a rewind.
   * Should throw on failure so RewindTimeline can display an error.
   */
  rewindCheckpoint: (checkpointId: string) => Promise<void>;
  /**
   * Optional: host passes a function that takes a `listener` callback and
   * returns an unlisten/unsubscribe function. When a tool completes
   * (payload.type === "completed"), the listener is invoked and the
   * checkpoint list refreshes.
   *
   * Example:
   *   onToolEvent={(listener) => {
   *     const unsub = eventBus.on('tool:event', listener);
   *     return unsub;
   *   }}
   */
  onToolEvent?: (listener: (payload: { type: string }) => void) => () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getRelativeTime(ms: number): string {
  const diffMs = Date.now() - ms;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function getFileBasename(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? filePath;
}

interface RewindConfirmState {
  checkpointId: string;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RewindTimeline({
  fetchCheckpoints,
  rewindCheckpoint,
  onToolEvent,
}: RewindTimelineProps) {
  const [checkpoints, setCheckpoints] = useState<CodingCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rewinding, setRewinding] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<RewindConfirmState | null>(null);

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCheckpoints();
      setCheckpoints(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error('[RewindTimeline] Failed to fetch checkpoints:', err);
      setError('Failed to load checkpoints');
    } finally {
      setLoading(false);
    }
  }, [fetchCheckpoints]);

  // Fetch on mount
  useEffect(() => {
    void loadCheckpoints();
  }, [loadCheckpoints]);

  // Subscribe to tool events for real-time refresh (optional)
  useEffect(() => {
    if (!onToolEvent) return;

    const unlisten = onToolEvent((payload) => {
      if (payload?.type === 'completed') {
        void loadCheckpoints();
      }
    });

    return () => {
      unlisten();
    };
  }, [onToolEvent, loadCheckpoints]);

  const handleRewindRequest = useCallback((checkpoint: CodingCheckpoint) => {
    const label = checkpoint.filePath ? getFileBasename(checkpoint.filePath) : checkpoint.toolName;
    setConfirmState({ checkpointId: checkpoint.id, label });
  }, []);

  const handleRewindConfirm = useCallback(async () => {
    if (!confirmState) return;
    const { checkpointId } = confirmState;
    setConfirmState(null);
    setRewinding(checkpointId);
    try {
      await rewindCheckpoint(checkpointId);
      await loadCheckpoints();
    } catch (err) {
      console.error('[RewindTimeline] Rewind failed:', err);
      setError('Rewind failed. Please try again.');
    } finally {
      setRewinding(null);
    }
  }, [confirmState, rewindCheckpoint, loadCheckpoints]);

  const handleRewindCancel = useCallback(() => {
    setConfirmState(null);
  }, []);

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <History className="w-3.5 h-3.5" />
          <span>
            {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={loadCheckpoints}
          disabled={loading}
          aria-label="Refresh checkpoints"
          className={cn(
            'rounded p-1 text-muted-foreground hover:text-foreground transition-colors',
            loading && 'animate-spin',
          )}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Confirmation dialog */}
      {confirmState && (
        <div className="mx-3 my-2 rounded border border-amber-500/30 bg-amber-500/10 p-3 shrink-0">
          <p className="text-xs text-amber-300 mb-2">
            Rewind to checkpoint at{' '}
            <span className="font-mono font-semibold">{confirmState.label}</span>? This will undo
            file changes made after this point.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRewindConfirm}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-amber-600 hover:bg-amber-500 text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Confirm rewind
            </button>
            <button
              type="button"
              onClick={handleRewindCancel}
              className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-3 my-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 shrink-0">
          {error}
        </div>
      )}

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {loading && checkpoints.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 animate-spin mr-2" />
            Loading…
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-xs text-muted-foreground px-4 text-center">
            <History className="w-5 h-5 opacity-40" />
            <span>
              No checkpoints yet. Checkpoints are created automatically when files are edited.
            </span>
          </div>
        ) : (
          <ul className="relative px-3 py-3">
            <div className="absolute left-6 top-4 bottom-4 w-px bg-white/10" aria-hidden />

            {checkpoints.map((checkpoint, index) => {
              const isRewinding = rewinding === checkpoint.id;
              const fileLabel = checkpoint.filePath ? getFileBasename(checkpoint.filePath) : null;

              return (
                <li
                  key={checkpoint.id}
                  className={cn(
                    'relative flex items-start gap-3 pl-6 pb-4',
                    index === checkpoints.length - 1 && 'pb-0',
                  )}
                >
                  <div
                    className={cn(
                      'absolute left-[18px] top-1.5 w-2 h-2 rounded-full border-2 shrink-0 -translate-x-1/2',
                      index === 0
                        ? 'border-violet-400 bg-violet-900/50'
                        : 'border-white/20 bg-[#0b0c14]',
                    )}
                    aria-hidden
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-xs font-mono text-foreground/80 font-medium">
                          {checkpoint.toolName}
                        </span>
                        {fileLabel && (
                          <span
                            className="ml-1 text-xs text-muted-foreground font-mono truncate block max-w-[160px]"
                            title={checkpoint.filePath}
                          >
                            {fileLabel}
                          </span>
                        )}
                        {checkpoint.description && (
                          <p
                            className="text-xs text-muted-foreground/70 mt-0.5 truncate"
                            title={checkpoint.description}
                          >
                            {checkpoint.description}
                          </p>
                        )}
                        <span className="text-xs text-muted-foreground/50 tabular-nums">
                          {getRelativeTime(checkpoint.createdAtMs)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRewindRequest(checkpoint)}
                        disabled={isRewinding || rewinding !== null}
                        aria-label={`Rewind to ${checkpoint.toolName} checkpoint`}
                        className={cn(
                          'flex items-center gap-1 shrink-0 rounded px-1.5 py-0.5 text-xs',
                          'text-muted-foreground hover:text-foreground',
                          'border border-white/10 hover:border-white/20 transition-colors',
                          (isRewinding || rewinding !== null) && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <RotateCcw className={cn('w-3 h-3', isRewinding && 'animate-spin')} />
                        {isRewinding ? 'Rewinding' : 'Rewind'}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default RewindTimeline;
