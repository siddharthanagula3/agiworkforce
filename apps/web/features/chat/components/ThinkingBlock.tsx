'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { ChevronRight } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { deriveReasoningPhrase, formatThinkingDuration } from '@agiworkforce/utils/reasoning';

const MarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.MarkdownContent),
  { loading: () => <div className="h-4 w-32 animate-pulse rounded bg-muted" /> },
);

const StreamingMarkdownContent = dynamic(
  () => import('@agiworkforce/unified-chat').then((mod) => mod.StreamingMarkdownContent),
  { loading: () => <div className="h-4 w-32 animate-pulse rounded bg-muted" /> },
);

const REASONING_BODY_CLASS =
  'text-[13px] leading-relaxed text-muted-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-foreground';

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

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const userToggledRef = useRef(false);
  const prevStreamingRef = useRef(isStreaming);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!isStreaming) return;

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

  useEffect(() => {
    if (prevStreamingRef.current !== isStreaming) {
      prevStreamingRef.current = isStreaming;
      if (!isStreaming && !userToggledRef.current) {
        setExpanded(false);
      }
    }
  }, [isStreaming]);

  useEffect(() => {
    if (isStreaming && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  const handleToggle = () => {
    userToggledRef.current = true;
    setExpanded((prev) => !prev);
  };

  const resolvedDuration: number = (() => {
    if (durationSeconds !== undefined) return durationSeconds;
    if (!isStreaming && completedAt && startedAt) {
      return Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000);
    }
    return elapsedSeconds;
  })();

  const durationLabel = formatThinkingDuration(resolvedDuration);

  const headerLabel = isStreaming
    ? `${deriveReasoningPhrase(content)} • ${durationLabel}`
    : resolvedDuration > 0
      ? `Thought for ${durationLabel}`
      : 'Thought process';

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
          <div className={REASONING_BODY_CLASS}>
            {isStreaming ? (
              <StreamingMarkdownContent content={content} isStreaming />
            ) : (
              <MarkdownContent content={content} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
