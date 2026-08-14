'use client';

/**
 * ThinkingBlock – Collapsible reasoning / thinking display
 *
 * Presentation: a bare ACTIVITY LINE, not a card. It is the same affordance as
 * the tool timeline's "Searched the web ›" row (ToolTimeline.tsx) — one line of
 * muted text with a right-pointing chevron that rotates when opened — so a turn
 * that interleaves reasoning and tool steps reads as one continuous list
 * instead of alternating filled grey slabs with plain rows. The reasoning text
 * lives behind the disclosure, on an indented rail.
 *
 * Features:
 * - Live elapsed-second timer while the model is thinking
 * - Derived verb phrase while streaming, "Thought for Xs" when done
 * - Collapsible content with CSS max-height transition
 * - Auto-scroll to bottom as thinking text streams in
 * - Full ARIA attributes for accessibility
 * - prefers-reduced-motion: disables the blinking cursor + height transition
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
import { ChevronRight } from 'lucide-react';
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

  // ── Computed label ────────────────────────────────────────────────────────
  // While streaming: derive a live verb phrase from the reasoning content so the
  // header reads e.g. "Analyzing • 4s" instead of the static "Thinking... 4s".
  // The phrase updates every render as new thinking tokens arrive.
  //
  // A completed block whose duration resolves to 0 has no timing to report —
  // the provider sent no duration and no start/complete timestamps (segment
  // paths often don't). Printing "Thought for 0s" under a long chain of
  // reasoning states a measurement that was never taken; the plain label is the
  // honest form.
  const headerLabel = isStreaming
    ? `${deriveReasoningPhrase(content)} • ${durationLabel}`
    : resolvedDuration > 0
      ? `Thought for ${durationLabel}`
      : 'Thought process';

  // Don't render an empty completed block (edge case: <thinking></thinking>)
  if (!isStreaming && (!content || content.trim().length === 0)) {
    return null;
  }

  const headerId = `thinking-header-${content.slice(0, 8).replace(/\s/g, '')}`;

  return (
    <div>
      {/* ── Status line ─────────────────────────────────────────────────────────
          No card, no fill, no border: one muted line that matches the tool
          timeline's "Searched the web ›" row. The block used to paint a filled
          `--chat-glass` slab with a small-caps "REASONING" chip and an inline
          italic preview of the raw chain-of-thought, which dominated the turn
          and made every reasoning step louder than the answer under it. */}
      <button
        type="button"
        id={headerId}
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} reasoning`}
        className="w-full flex items-center gap-2 py-0.5 text-sm text-left text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
      >
        <span
          className={cn('flex-1 min-w-0 truncate', isStreaming && 'text-primary')}
          // aria-live polite so screen readers pick up changes but not every second
          aria-live="polite"
          aria-atomic="true"
        >
          {headerLabel}
        </span>

        {/* Chevron at the right end of the line · points right when collapsed,
            down when open (same direction/rotation as ToolTimeline's header). */}
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            !reducedMotion && 'transition-transform duration-200',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {/* ── Collapsible body ─────────────────────────────────────────────────
          Indented behind a hairline rail rather than a boxed panel, so the
          reasoning reads as a detail of the line above it. */}
      <div
        role="region"
        aria-labelledby={headerId}
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
        <div
          ref={bodyRef}
          className="mt-1 mb-1 ml-1 max-h-96 overflow-y-auto border-l border-border/40 pl-3 [scrollbar-width:thin] [scrollbar-color:var(--chat-border-strong)_transparent]"
        >
          <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
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
  );
}
