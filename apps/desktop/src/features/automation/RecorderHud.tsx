import { useCallback, useEffect, useMemo, useState } from 'react';
import { automation } from '@agiworkforce/desktop-command-client';
import { CircleStop, Mic, MicOff, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { listen } from '@/lib/tauri-mock';
import { cn } from '@/lib/utils';
import {
  RECORDER_STOP_SHORTCUT_ACTION,
  closeCurrentRecorderHud,
} from '@/services/recorderHudWindow';

import { useRecorderNarration } from './useRecorderNarration';

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function RecorderHud() {
  const [actionCount, setActionCount] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [duration, setDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const narration = useRecorderNarration();
  const {
    error: narrationError,
    isAvailable: isNarrationAvailable,
    level: narrationLevel,
    phase: narrationPhase,
    startNarration,
    stopNarration,
  } = narration;

  const finish = useCallback(async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    setError(null);
    try {
      if (narrationPhase === 'listening') {
        await stopNarration();
      }
      await automation.automationRecordStop();
      await closeCurrentRecorderHud();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not finish the recording.');
      setIsFinishing(false);
    }
  }, [isFinishing, narrationPhase, stopNarration]);

  const discard = useCallback(async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    setError(null);
    try {
      await stopNarration({ discard: true });
      await automation.automationRecordDiscard();
      await closeCurrentRecorderHud();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not discard the recording.');
      setIsFinishing(false);
    }
  }, [isFinishing, stopNarration]);

  useEffect(() => {
    let mounted = true;
    void automation
      .automationRecordGetStatus()
      .then((status) => {
        if (!mounted) return;
        if (!status?.isRecording) {
          setIsRecording(false);
          setError('This recording is no longer active.');
          return;
        }
        setActionCount(status.actionCount);
        setStartedAt(status.startTime);
        setDuration(status.durationMs);
      })
      .catch((cause) => {
        if (mounted) {
          setError(cause instanceof Error ? cause.message : 'Could not read recording status.');
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const update = () => setDuration(Math.max(0, Date.now() - startedAt));
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [isRecording, startedAt]);

  useEffect(() => {
    let mounted = true;
    let cleanups: Array<() => void> = [];
    void Promise.all([
      listen('automation:action_recorded', () => {
        if (mounted) setActionCount((count) => count + 1);
      }),
      listen('automation:recording_stopped', () => {
        if (!mounted) return;
        setIsRecording(false);
        void closeCurrentRecorderHud();
      }),
      listen('automation:recording_discarded', () => {
        if (!mounted) return;
        setIsRecording(false);
        void closeCurrentRecorderHud();
      }),
      listen<string>('shortcut_action', (event) => {
        if (mounted && event.payload === RECORDER_STOP_SHORTCUT_ACTION) void finish();
      }),
    ]).then((nextCleanups) => {
      if (mounted) cleanups = nextCleanups;
      else nextCleanups.forEach((cleanup) => cleanup());
    });
    return () => {
      mounted = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [finish]);

  const narrationLabel = useMemo(() => {
    if (narrationPhase === 'listening') return 'Narrating';
    if (narrationPhase === 'transcribing') return 'Transcribing';
    if (isNarrationAvailable === false) return 'Narration unavailable';
    return 'Narration off';
  }, [isNarrationAvailable, narrationPhase]);
  const visibleError = error ?? narrationError;

  return (
    <main className="flex h-full w-full items-start justify-center bg-transparent p-2">
      <section
        className="relative flex h-[72px] w-full items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 px-3 text-zinc-50 shadow-2xl backdrop-blur-xl"
        aria-label="Workflow capture controls"
      >
        <div
          className="flex min-w-0 flex-1 items-center gap-3"
          data-tauri-drag-region
          aria-live="polite"
        >
          <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-70 motion-safe:animate-ping" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <div className="min-w-0" data-tauri-drag-region>
            <p className="truncate text-sm font-semibold" data-tauri-drag-region>
              Capturing · {actionCount} {actionCount === 1 ? 'step' : 'steps'}
            </p>
            <p className="text-[11px] text-zinc-400" data-tauri-drag-region>
              {formatDuration(duration)} · Stop anywhere with ⌘/Ctrl ⇧ .
            </p>
          </div>
        </div>

        <div className="flex h-10 items-center gap-1.5 rounded-xl bg-white/[0.06] px-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8 rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white',
              narrationPhase === 'listening' && 'bg-amber-500/20 text-amber-300',
            )}
            disabled={
              isFinishing || narrationPhase === 'transcribing' || isNarrationAvailable !== true
            }
            onClick={() =>
              void (narrationPhase === 'listening' ? stopNarration() : startNarration())
            }
            aria-label={narrationPhase === 'listening' ? 'Stop narration' : 'Start narration'}
            title={narrationLabel}
          >
            {narrationPhase === 'listening' ? (
              <Mic className="h-4 w-4" aria-hidden="true" />
            ) : (
              <MicOff className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
          <div
            className="flex h-7 w-[58px] items-center justify-center gap-px"
            aria-label={`${narrationLabel}, input level ${Math.round(narrationLevel * 100)} percent`}
          >
            {Array.from({ length: 24 }, (_, index) => {
              const threshold = (index + 1) / 24;
              return (
                <span
                  key={index}
                  className={cn(
                    'w-px rounded-full bg-zinc-700 transition-colors',
                    narrationPhase === 'listening' &&
                      threshold <= Math.max(0.08, narrationLevel) &&
                      'bg-amber-300',
                  )}
                  style={{ height: `${6 + (index % 6) * 2}px` }}
                  aria-hidden="true"
                />
              );
            })}
          </div>
        </div>

        <div className="h-8 w-px bg-white/10" aria-hidden="true" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 text-zinc-300 hover:bg-white/10 hover:text-white"
          disabled={isFinishing}
          onClick={() => void discard()}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Discard
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 bg-white text-zinc-950 hover:bg-zinc-200"
          disabled={isFinishing || !isRecording}
          onClick={() => void finish()}
        >
          <CircleStop className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {isFinishing ? 'Finishing…' : 'Done'}
        </Button>

        {visibleError && (
          <p
            className="absolute inset-x-3 bottom-0 truncate text-center text-[10px] text-red-300"
            role="alert"
            title={visibleError}
          >
            {visibleError}
          </p>
        )}
      </section>
    </main>
  );
}
