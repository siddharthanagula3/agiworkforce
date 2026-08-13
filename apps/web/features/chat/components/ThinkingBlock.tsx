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
import { Clock, ChevronDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { deriveReasoningPhrase, formatThinkingDuration } from '@agiworkforce/utils/reasoning';

interface ThinkingBlockProps {
  content: string;
  isStreaming: boolean;
  startedAt?: string;
  completedAt?: string;
  durationSeconds?: number;
  defaultExpanded?: boolean;
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

  /**
   * AUDIT-FIX BUG-30: `window.matchMedia(...)` was read inside a `useRef`
   * initializer, which runs during render — including on the SERVER, where the
   * guarded fallback made it always `false`. A ref never re-reads, so a reader
   * with prefers-reduced-motion kept the pulsing clock, the blinking cursor and
   * the height transition forever.
   *
   * State + effect instead: SSR and the first client render both use `false`
   * (identical markup, no hydration mismatch), the effect then reads the real
   * preference and subscribes to changes so toggling it in OS settings takes
   * effect without a reload.
   */
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

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
      return Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    }
    return elapsedSeconds;
  })();

  const durationLabel = formatThinkingDuration(resolvedDuration);

  // ── Preview line (collapsed state) ────────────────────────────────────────
  const previewLine =
    content
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';
  const previewText = previewLine.length > 80 ? previewLine.slice(0, 77) + '…' : previewLine;

  // ── Computed label ────────────────────────────────────────────────────────
  // While streaming: derive a live verb phrase from the reasoning content so the
  // header reads e.g. "Analyzing • 4s" instead of the static "Thinking... 4s".
  // The phrase updates every render as new thinking tokens arrive.
  const headerLabel = isStreaming
    ? `${deriveReasoningPhrase(content)} • ${durationLabel}`
    : `Thought for ${durationLabel}`;

  // Don't render an empty completed block (edge case: <thinking></thinking>)
  if (!isStreaming && (!content || content.trim().length === 0)) {
    return null;
  }

  return (
    <div
      /**
       * Theme tokens, not fixed zinc/slate values.
       *
       * The block previously painted `bg-zinc-950/*` in BOTH themes and drew
       * its text in `slate-400`. In dark mode that reads correctly; in light
       * mode it produced a dark slab of low-contrast grey text on the light
       * page — the reasoning body was effectively unreadable. `--chat-glass`
       * and `--chat-border-subtle` already flip per theme, and the text now
       * uses `muted-foreground`, which is contrast-checked in both.
       */
      className={cn(
        'overflow-hidden rounded-lg border border-[var(--chat-border-subtle)]',
        isStreaming ? 'bg-[var(--chat-glass)]' : 'bg-[var(--chat-glass)]/70',
      )}
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <button
        type="button"
        id={`thinking-header-${content.slice(0, 8).replace(/\s/g, '')}`}
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} reasoning block`}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--chat-surface-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {/* Clock icon · pulses while streaming (unless reduced-motion) */}
        <Clock
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-muted-foreground',
            isStreaming && !reducedMotion && 'animate-pulse',
          )}
          aria-hidden="true"
        />

        {/* "Reasoning" small-caps label */}
        <span className="text-[10px] tracking-widest text-muted-foreground [font-variant:small-caps]">
          Reasoning
        </span>

        {/* Duration / status label */}
        <span
          className={cn(
            'text-xs tabular-nums',
            isStreaming ? 'text-foreground/80' : 'text-muted-foreground',
          )}
          // aria-live polite so screen readers pick up changes but not every second
          aria-live="polite"
          aria-atomic="true"
        >
          {headerLabel}
        </span>

        {/* Collapsed preview · hidden on mobile (sm:) */}
        {!expanded && previewText && (
          <span className="hidden sm:block flex-1 min-w-0 truncate text-xs italic font-mono text-muted-foreground">
            {previewText}
          </span>
        )}

        <span className="flex-1" aria-hidden="true" />

        {/* Animated chevron */}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-muted-foreground',
            !reducedMotion && 'transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* ── Collapsible body ────────────────────────────────────────────────── */}
      <div
        role="region"
        aria-labelledby={`thinking-header-${content.slice(0, 8).replace(/\s/g, '')}`}
        className={cn(!reducedMotion && 'transition-all ease-in-out')}
        style={
          reducedMotion
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
        <div className="border-t border-[var(--chat-border-subtle)]">
          <div
            ref={bodyRef}
            className="max-h-96 overflow-y-auto px-4 py-3 [scrollbar-width:thin] [scrollbar-color:var(--chat-border-strong)_transparent]"
          >
            <p className="text-xs text-muted-foreground font-mono italic leading-relaxed whitespace-pre-wrap">
              {content}
              {/* Blinking cursor while streaming (disabled with reduced-motion) */}
              {isStreaming && (
                <span
                  className={cn(
                    'inline-block w-1.5 h-3 bg-muted-foreground/60 ml-0.5 align-middle',
                    !reducedMotion && 'animate-pulse',
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
