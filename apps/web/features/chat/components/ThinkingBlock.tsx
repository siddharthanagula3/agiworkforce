'use client';

/**
 * ThinkingBlock – Collapsible reasoning / thinking display
 *
 * Features:
 * - Live elapsed-second timer while the model is thinking
 * - "Thinking..." animated label while streaming, "Thought for Xs" when done
 * - Brain icon (pulses while active, static when complete)
 * - Collapsible content with CSS max-height transition
 * - Auto-scroll to bottom as thinking text streams in
 * - Single-line preview when collapsed
 * - Full ARIA attributes for accessibility
 * - prefers-reduced-motion: disables pulse + height transition
 *
 * Props:
 *   content              – raw thinking text (may contain newlines)
 *   isStreaming          – true while the model is still generating thinking tokens
 *   startedAt            – ISO timestamp when thinking started (for duration calc)
 *   completedAt          – ISO timestamp when thinking completed (for duration calc)
 *   durationSeconds      – server-reported duration (takes priority over computed)
 *   defaultExpanded      – whether to open the block initially (default: true while streaming)
 */

import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface ThinkingBlockProps {
  content: string;
  isStreaming: boolean;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  defaultExpanded?: boolean;
}

/** Format elapsed/total seconds as "Xs" or "Xm Ys". */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

export function ThinkingBlock({
  content,
  isStreaming,
  startedAt,
  completedAt,
  durationSeconds,
  defaultExpanded,
}: ThinkingBlockProps) {
  const initialExpanded = defaultExpanded !== undefined ? defaultExpanded : isStreaming;
  const [expanded, setExpanded] = useState(initialExpanded);

  // Live elapsed seconds while streaming
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Track whether the user has manually toggled so we do not auto-collapse on their behalf
  const userToggledRef = useRef(false);
  const prevStreamingRef = useRef(isStreaming);
  const bodyRef = useRef<HTMLDivElement>(null);

  // prefers-reduced-motion check (evaluated once — SSR safe via null default)
  const reducedMotion = useRef(
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  // ── Live timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isStreaming) return;

    // Seed the timer from startedAt so it's accurate even if mounting is delayed
    const getElapsed = () => {
      if (!startedAt) return 0;
      return Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
    };

    setElapsedSeconds(getElapsed());

    const id = setInterval(() => {
      setElapsedSeconds(getElapsed());
    }, 1000);

    return () => clearInterval(id);
  }, [isStreaming, startedAt]);

  // ── Auto-collapse when streaming ends ─────────────────────────────────────
  useEffect(() => {
    if (prevStreamingRef.current !== isStreaming) {
      prevStreamingRef.current = isStreaming;
      if (!isStreaming && !userToggledRef.current) {
        setExpanded(false);
      }
    }
  }, [isStreaming]);

  // ── Auto-scroll to bottom while streaming ─────────────────────────────────
  useEffect(() => {
    if (isStreaming && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  const handleToggle = () => {
    userToggledRef.current = true;
    setExpanded((prev) => !prev);
  };

  // ── Duration label ────────────────────────────────────────────────────────
  //
  // Priority: server-reported durationSeconds > computed from timestamps > live timer
  const resolvedDuration: number = (() => {
    if (durationSeconds !== undefined) return durationSeconds;
    if (!isStreaming && completedAt && startedAt) {
      return Math.round(
        (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
      );
    }
    return elapsedSeconds;
  })();

  const durationLabel = formatDuration(resolvedDuration);

  // ── Preview line (collapsed state) ────────────────────────────────────────
  const previewLine =
    content
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';
  const previewText =
    previewLine.length > 80 ? previewLine.slice(0, 77) + '…' : previewLine;

  // ── Computed label ────────────────────────────────────────────────────────
  const headerLabel = isStreaming
    ? `Thinking… ${durationLabel}`
    : `Thought for ${durationLabel}`;

  // Don't render an empty completed block (edge case: <thinking></thinking>)
  if (!isStreaming && (!content || content.trim().length === 0)) {
    return null;
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        isStreaming
          ? 'border-purple-500/40 bg-purple-950/10 shadow-sm shadow-purple-500/10 dark:bg-purple-950/20'
          : 'border-zinc-700/40 bg-zinc-950/30 dark:bg-zinc-900/20',
      )}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <button
        type="button"
        id={`thinking-header-${content.slice(0, 8).replace(/\s/g, '')}`}
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} reasoning block`}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/10 dark:hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
      >
        {/* Brain icon — pulses while streaming (unless reduced-motion) */}
        <Brain
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            isStreaming
              ? cn(
                  'text-purple-400',
                  !reducedMotion.current && 'animate-pulse',
                )
              : 'text-zinc-400',
          )}
          aria-hidden="true"
        />

        {/* "Reasoning" small-caps label */}
        <span
          className="text-[10px] tracking-widest text-slate-400"
          style={{ fontVariant: 'small-caps' }}
        >
          Reasoning
        </span>

        {/* Duration / status label */}
        <span
          className={cn('text-xs tabular-nums', isStreaming ? 'text-slate-300' : 'text-slate-500')}
          // aria-live polite so screen readers pick up changes but not every second
          aria-live="polite"
          aria-atomic="true"
        >
          {headerLabel}
        </span>

        {/* Collapsed preview — hidden on mobile (sm:) */}
        {!expanded && previewText && (
          <span className="hidden sm:block flex-1 min-w-0 truncate text-xs italic font-mono text-slate-500">
            {previewText}
          </span>
        )}

        <span className="flex-1" aria-hidden="true" />

        {/* Animated chevron */}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-slate-500',
            !reducedMotion.current && 'transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* ── Collapsible body ────────────────────────────────────────────────── */}
      <div
        role="region"
        aria-labelledby={`thinking-header-${content.slice(0, 8).replace(/\s/g, '')}`}
        className={cn(!reducedMotion.current && 'transition-all ease-in-out')}
        style={
          reducedMotion.current
            ? { display: expanded ? undefined : 'none' }
            : {
                maxHeight: expanded ? '24rem' : '0px',
                opacity: expanded ? 1 : 0,
                overflow: 'hidden',
                transitionProperty: 'max-height, opacity',
                transitionDuration: '250ms',
                transitionTimingFunction: 'ease-in-out',
              }
        }
      >
        <div className="border-t border-zinc-700/30">
          <div
            ref={bodyRef}
            className="max-h-96 overflow-y-auto px-4 py-3"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(113,113,122,0.4) transparent',
            }}
          >
            <p className="text-xs text-slate-400/80 font-mono italic leading-relaxed whitespace-pre-wrap">
              {content}
              {/* Blinking cursor while streaming (disabled with reduced-motion) */}
              {isStreaming && (
                <span
                  className={cn(
                    'inline-block w-1.5 h-3 bg-purple-400/60 ml-0.5 align-middle',
                    !reducedMotion.current && 'animate-pulse',
                  )}
                  aria-hidden="true"
                />
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
