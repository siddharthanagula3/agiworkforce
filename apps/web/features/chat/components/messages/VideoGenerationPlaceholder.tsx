'use client';

/**
 * In-flight state for a video generation.
 *
 * The previous inline version painted a shimmer and put its only label behind
 * `motion-safe:opacity-0`, so the text "Generating your video…" was visible
 * ONLY to readers with prefers-reduced-motion. Everyone else — every demo
 * viewer — got an unexplained grey rectangle for the 1-3 minutes Veo takes,
 * which reads as a hung or broken product rather than as work in progress.
 *
 * The label and elapsed time are now unconditional; the shimmer is decoration
 * behind them, not the message itself.
 */

import { useEffect, useState } from 'react';
import { Video } from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface VideoGenerationPlaceholderProps {
  /** ISO timestamp the generation started, for the elapsed counter. */
  startedAt?: string;
  className?: string;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export function VideoGenerationPlaceholder({
  startedAt,
  className,
}: VideoGenerationPlaceholderProps) {
  const [elapsed, setElapsed] = useState(0);

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
        'relative mt-4 aspect-video w-full max-w-lg overflow-hidden rounded-xl bg-muted',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Generating your video"
      data-testid="video-generation-placeholder"
    >
      {/* Drives @keyframes shimmer in globals.css, which animates
          background-position — so the highlight must be an oversized
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
      </div>
    </div>
  );
}
