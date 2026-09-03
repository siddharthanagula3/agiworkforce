'use client';

import { useEffect, useState } from 'react';
import { Video, X } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { addCsrfHeaders } from '@/lib/client/csrf';

interface VideoGenerationPlaceholderProps {
  /** ISO timestamp the generation started, for the elapsed counter. */
  startedAt?: string;
  /** Aspect ratio requested for the video (e.g. '16:9', '9:16'); sizes the placeholder box. */
  aspectRatio?: string;
  /**
   * The durable job to cancel. Without it there is no way to stop a generation
   * at all: the composer's Stop button is driven by the SSE chat stream, and a
   * video runs as a background job that never sets those flags, so Stop never
   * appears no matter how long the job runs.
   */
  taskId?: string;
  className?: string;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

const VIDEO_ASPECT_CLASSES: Readonly<Record<string, string>> = {
  '16:9': 'aspect-video',
  '4:3': 'aspect-[4/3]',
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '9:16': 'aspect-[9/16]',
  '21:9': 'aspect-[21/9]',
};
// Written as a literal (not indexed from the map above) so its type stays
// `string` under noUncheckedIndexedAccess; keep it in sync with the '16:9' entry.
const DEFAULT_VIDEO_ASPECT_CLASS = 'aspect-video';

function videoAspectClass(aspectRatio: string | undefined): string {
  if (!aspectRatio) return DEFAULT_VIDEO_ASPECT_CLASS;
  return VIDEO_ASPECT_CLASSES[aspectRatio] ?? DEFAULT_VIDEO_ASPECT_CLASS;
}

export function VideoGenerationPlaceholder({
  startedAt,
  aspectRatio,
  taskId,
  className,
}: VideoGenerationPlaceholderProps) {
  const [elapsed, setElapsed] = useState(0);
  const [cancelState, setCancelState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [cancelNote, setCancelNote] = useState<string | null>(null);

  useEffect(() => {
    // Seed from startedAt so a remount mid-generation does not restart at 0.
    const base = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <div
      className={cn(
        'relative mt-4 max-w-lg max-h-96 overflow-hidden rounded-xl bg-muted',
        videoAspectClass(aspectRatio),
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Generating your video"
      data-testid="video-generation-placeholder"
    >
      {/* Drives @keyframes shimmer in globals.css, which animates
          background-position, so the highlight must be an oversized
          background gradient. A translate-based sweep would not move. */}
      <div
        className={cn(
          'absolute inset-0',
          'bg-[linear-gradient(90deg,transparent,var(--color-accent),transparent)]',
          'bg-[length:200%_100%]',
          'motion-safe:animate-[shimmer_1.8s_ease-in-out_infinite]',
        )}
        aria-hidden="true"
      />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
        <span className="grid size-10 place-items-center rounded-full bg-background/80 shadow-sm backdrop-blur">
          <Video className="size-5 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="text-[13px] font-medium text-foreground">Generating your video…</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatElapsed(elapsed)} · this usually takes a minute or two
        </span>

        {taskId && cancelState !== 'sent' && (
          <button
            type="button"
            onClick={() => void cancelGeneration()}
            disabled={cancelState === 'sending'}
            className={cn(
              'mt-1 inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/85 px-3 py-1',
              'text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors',
              'hover:bg-background disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <X className="size-3" aria-hidden="true" />
            {cancelState === 'sending' ? 'Stopping…' : 'Stop generating'}
          </button>
        )}

        {cancelNote && (
          <span
            className="max-w-[22rem] text-balance text-xs text-muted-foreground"
            role={cancelState === 'failed' ? 'alert' : undefined}
          >
            {cancelNote}
          </span>
        )}
      </div>
    </div>
  );

  async function cancelGeneration() {
    if (!taskId || cancelState === 'sending') return;
    setCancelState('sending');
    setCancelNote(null);
    try {
      const response = await fetch('/api/media/video/cancel', {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
        body: JSON.stringify({ task_id: taskId }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        setCancelState('failed');
        setCancelNote(body.error?.message ?? 'Could not stop this generation. Try again.');
        return;
      }
      setCancelState('sent');
      // The route answers honestly: some providers expose no verified
      // cancellation, so it records the request and says so rather than
      // claiming the job stopped. Show its wording, not our own.
      setCancelNote(body.message ?? 'Cancellation requested.');
    } catch {
      setCancelState('failed');
      setCancelNote('Could not reach the server to stop this generation.');
    }
  }
}
