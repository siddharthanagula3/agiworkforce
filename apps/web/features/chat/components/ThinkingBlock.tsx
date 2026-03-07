'use client';

/**
 * ThinkingBlock – Collapsible reasoning / thinking display
 *
 * Same behaviour as the desktop ThinkingBlock but without framer-motion.
 * CSS max-height transitions are used for the expand / collapse animation.
 *
 * Props:
 *   content          – raw thinking text (may contain newlines)
 *   isStreaming       – true while the model is still generating thinking content
 *   defaultExpanded  – whether to open the block initially (default: true while streaming)
 */

import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';

interface ThinkingBlockProps {
  content: string;
  isStreaming: boolean;
  defaultExpanded?: boolean;
}

export function ThinkingBlock({
  content,
  isStreaming,
  defaultExpanded = true,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || isStreaming);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-collapse once streaming ends (unless user has manually toggled)
  const userToggledRef = useRef(false);
  useEffect(() => {
    if (!isStreaming && !userToggledRef.current) {
      setExpanded(false);
    }
  }, [isStreaming]);

  // Auto-scroll to bottom of thinking content while streaming
  useEffect(() => {
    if (isStreaming && expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, isStreaming, expanded]);

  const handleToggle = () => {
    userToggledRef.current = true;
    setExpanded((prev) => !prev);
  };

  // Single-line preview: first non-empty line, truncated at 80 chars
  const preview =
    content
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';

  const previewText = preview.length > 80 ? preview.slice(0, 77) + '…' : preview;
  const headerLabel = isStreaming ? 'Thinking…' : 'Thought';

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border',
        isStreaming
          ? 'border-purple-500/40 bg-purple-950/10 shadow-sm shadow-purple-500/10 dark:bg-purple-950/20'
          : 'border-zinc-700/40 bg-zinc-950/30 dark:bg-zinc-900/20',
      )}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} reasoning block`}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/10 dark:hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
      >
        {/* Brain icon — pulses while streaming */}
        <Brain
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            isStreaming ? 'text-purple-400 animate-pulse' : 'text-slate-400',
          )}
          aria-hidden="true"
        />

        {/* "Reasoning" label */}
        <span
          className="text-[10px] tracking-widest text-slate-400"
          style={{ fontVariant: 'small-caps' }}
        >
          Reasoning
        </span>

        {/* Streaming / done status */}
        <span className={cn('text-xs', isStreaming ? 'text-slate-300' : 'text-slate-500')}>
          {headerLabel}
        </span>

        {/* Collapsed preview */}
        {!expanded && previewText && (
          <span className="flex-1 min-w-0 truncate text-xs italic font-mono text-slate-500">
            {previewText}
          </span>
        )}

        <span className="flex-1" />

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-slate-500 transition-transform duration-200',
            expanded && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {/* ── Collapsible body with CSS transition ────────────────────────── */}
      <div
        className={cn(
          'transition-all duration-250 ease-in-out',
          expanded ? 'opacity-100' : 'opacity-0 overflow-hidden',
        )}
        style={{
          maxHeight: expanded ? '24rem' : '0px',
          transitionProperty: 'max-height, opacity',
          transitionDuration: '250ms',
          transitionTimingFunction: 'ease-in-out',
        }}
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
              {/* Blinking cursor while streaming */}
              {isStreaming && (
                <span
                  className="inline-block w-1.5 h-3 bg-purple-400/60 ml-0.5 animate-pulse align-middle"
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
