'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { X } from '@agiworkforce/icons';
import { cn } from '@shared/lib/utils';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import {
  mediaFrameStyle,
  type MediaFrame,
  type MediaTurnCategory,
} from '@/features/chat/lib/media-turn';

interface MediaGenerationPlaceholderProps {
  category: MediaTurnCategory;
  frame: MediaFrame;
  startedAt?: string;
  aspectRatio?: string;
  taskId?: string;
  progress?: number;
  className?: string;
}

const LABEL: Readonly<Record<MediaTurnCategory, string>> = {
  image: 'Creating your image',
  video: 'Creating your video',
};

const PROGRESS_NAME: Readonly<Record<MediaTurnCategory, string>> = {
  image: 'Image progress',
  video: 'Video progress',
};

const FRAME_RADIUS: Readonly<Record<MediaFrame, string>> = {
  'image-card': 'rounded-2xl',
  'inline-image': 'rounded-lg',
  'video-player': 'rounded-xl',
};

const DOT_FIELD = {
  pitchPx: 14,
  restRadiusPx: 0.9,
  peakRadiusPx: 2.2,
  restAlpha: 0.16,
  peakAlpha: 0.8,
  wavelengthPx: 280,
  periodSeconds: 3.8,
  swellWavelengthPx: 520,
  swellPeriodSeconds: 9,
  frameIntervalMs: 33,
  stillSeconds: 1.4,
} as const;

const TURN = Math.PI * 2;
const PILL =
  'rounded-full border border-[var(--chat-border-strong)] bg-[var(--chat-surface-elevated)] px-3 text-sm font-medium text-[var(--chat-text-primary)]';

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
}

function reportedPercent(progress: number | undefined): number | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return null;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function paintDotField(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  seconds: number,
  ink: string,
) {
  context.clearRect(0, 0, width, height);
  if (width <= 0 || height <= 0) return;
  context.fillStyle = ink;
  const columns = Math.max(1, Math.floor(width / DOT_FIELD.pitchPx));
  const rows = Math.max(1, Math.floor(height / DOT_FIELD.pitchPx));
  const left = (width - (columns - 1) * DOT_FIELD.pitchPx) / 2;
  const top = (height - (rows - 1) * DOT_FIELD.pitchPx) / 2;
  const travel = (seconds / DOT_FIELD.periodSeconds) * TURN;
  const swell = (seconds / DOT_FIELD.swellPeriodSeconds) * TURN;
  for (let row = 0; row < rows; row += 1) {
    const y = top + row * DOT_FIELD.pitchPx;
    for (let column = 0; column < columns; column += 1) {
      const x = left + column * DOT_FIELD.pitchPx;
      const crest =
        0.5 + 0.5 * Math.sin(((x * 0.82 - y * 0.57) / DOT_FIELD.wavelengthPx) * TURN - travel);
      const tide =
        0.5 + 0.5 * Math.sin(((x * 0.34 + y * 0.94) / DOT_FIELD.swellWavelengthPx) * TURN + swell);
      const level = crest * crest * (0.6 + 0.4 * tide);
      context.globalAlpha =
        DOT_FIELD.restAlpha + (DOT_FIELD.peakAlpha - DOT_FIELD.restAlpha) * level;
      context.beginPath();
      context.arc(
        x,
        y,
        DOT_FIELD.restRadiusPx + (DOT_FIELD.peakRadiusPx - DOT_FIELD.restRadiusPx) * level,
        0,
        TURN,
      );
      context.fill();
    }
  }
}

const DotField = memo(function DotField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let paintedAt = 0;
    let onScreen = true;
    let width = 0;
    let height = 0;
    let ink = '';

    const measure = () => {
      const box = canvas.getBoundingClientRect();
      const scale = window.devicePixelRatio || 1;
      width = box.width;
      height = box.height;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      ink = getComputedStyle(canvas).color;
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (now - paintedAt < DOT_FIELD.frameIntervalMs) return;
      paintedAt = now;
      paintDotField(context, width, height, now / 1000, ink);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (reducedMotion.matches) {
        paintDotField(context, width, height, DOT_FIELD.stillSeconds, ink);
        return;
      }
      if (onScreen && document.visibilityState === 'visible') frame = requestAnimationFrame(loop);
    };
    const remeasure = () => {
      measure();
      sync();
    };

    const resize = new ResizeObserver(remeasure);
    resize.observe(canvas);
    const viewport = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    viewport.observe(canvas);
    const theme = new MutationObserver(remeasure);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    remeasure();

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      viewport.disconnect();
      theme.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="media-generation-dot-field"
      className="absolute inset-0 h-full w-full text-[var(--chat-text-primary)]"
    />
  );
});

export function MediaGenerationPlaceholder({
  category,
  frame,
  startedAt,
  aspectRatio,
  taskId,
  progress,
  className,
}: MediaGenerationPlaceholderProps) {
  const [elapsed, setElapsed] = useState(0);
  const [cancelState, setCancelState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  const percent = reportedPercent(progress);

  useEffect(() => {
    const base = startedAt ? new Date(startedAt).getTime() : Date.now();
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - base) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <div
      className={cn('flex flex-col gap-2', className)}
      data-testid="media-generation-placeholder"
      data-category={category}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm text-[var(--chat-text-primary)]">
        {/* The live region holds the label alone. The clock beside it changes
            every second, and inside the region it would be read aloud each time. */}
        <span role="status">{LABEL[category]}</span>
        <span className="tabular-nums text-[var(--chat-text-secondary)]">
          <span className="sr-only">Elapsed </span>
          {formatElapsed(elapsed)}
        </span>
      </div>

      <div
        className={cn(
          'relative overflow-hidden border border-[var(--chat-border)] bg-[var(--chat-surface-hover)]',
          FRAME_RADIUS[frame],
        )}
        style={mediaFrameStyle(frame, aspectRatio)}
        data-testid="media-generation-frame"
      >
        <DotField />

        {percent !== null && (
          <span
            role="progressbar"
            aria-label={PROGRESS_NAME[category]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className={cn(PILL, 'absolute bottom-3 end-3 py-1 tabular-nums')}
          >
            {percent}%
          </span>
        )}

        {taskId && cancelState !== 'sent' && (
          <button
            type="button"
            onClick={() => void cancelGeneration()}
            disabled={cancelState === 'sending'}
            className={cn(
              PILL,
              'absolute end-3 top-3 inline-flex min-h-8 items-center gap-1.5',
              'transition-colors duration-instant hover:bg-[var(--chat-surface-hover)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
              'disabled:cursor-not-allowed disabled:opacity-60 pointer-coarse:min-h-11',
            )}
          >
            <X className="size-4" aria-hidden="true" />
            {cancelState === 'sending' ? 'Stopping…' : 'Stop generating'}
          </button>
        )}
      </div>

      {cancelNote && (
        <p
          className="max-w-prose text-sm text-[var(--chat-text-secondary)]"
          role={cancelState === 'failed' ? 'alert' : undefined}
        >
          {cancelNote}
        </p>
      )}
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
        const error = Object.assign(new Error(body.error?.message ?? `HTTP ${response.status}`), {
          status: response.status,
        });
        setCancelNote(toUserMessage(error, 'Could not stop this generation. Try again.'));
        return;
      }
      setCancelState('sent');
      setCancelNote(body.message ?? 'Cancellation requested.');
    } catch {
      setCancelState('failed');
      setCancelNote('Could not reach the server to stop this generation.');
    }
  }
}
