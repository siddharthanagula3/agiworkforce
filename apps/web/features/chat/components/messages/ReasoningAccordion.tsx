'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@shared/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReasoningAccordionProps {
  /** Array of thinking-step strings (each rendered as a paragraph). */
  steps: string[];
  /** True while reasoning is actively being streamed. */
  isStreaming?: boolean;
  /** Elapsed duration in milliseconds (shown in collapsed header once streaming ends). */
  durationMs?: number;
  className?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the first meaningful sentence from thinking content for collapsed preview. */
function extractSummary(steps: string[], isStreaming: boolean): string {
  if (isStreaming) return 'Thinking...';

  const content = steps.join('\n');
  const lines = content.split('\n').filter((l) => l.trim().length > 15);

  const topicPatterns = [
    /(?:I need to|Let me|I'll|I should|First,? I|To answer|To solve|Looking at)/i,
    /(?:The (?:user|question|task|problem) (?:is|wants|asks|requires))/i,
    /(?:This (?:is|seems|appears|looks|involves))/i,
  ];

  for (const line of lines.slice(0, 5)) {
    const trimmed = line.trim();
    if (/^[\d.*-]+\s*$/.test(trimmed)) continue;
    for (const pattern of topicPatterns) {
      if (pattern.test(trimmed)) {
        return trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed;
      }
    }
  }

  const firstLine = lines[0]?.trim();
  if (firstLine) {
    return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
  }

  return 'Thought about this';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReasoningAccordion({
  steps,
  isStreaming = false,
  durationMs,
  className,
}: ReasoningAccordionProps) {
  const [isOpen, setIsOpen] = useState(isStreaming);
  const [hasUserCollapsed, setHasUserCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(isStreaming);

  // Auto-expand when streaming starts (unless user manually collapsed)
  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current && !hasUserCollapsed) {
      setIsOpen(true);
    }
    // Reset hasUserCollapsed when streaming ends so next streaming auto-expands
    if (!isStreaming && prevStreamingRef.current) {
      setHasUserCollapsed(false);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, hasUserCollapsed]);

  // Auto-scroll content to bottom during streaming
  useEffect(() => {
    if (isStreaming && isOpen && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [steps, isStreaming, isOpen]);

  const handleToggle = useCallback(() => {
    const next = !isOpen;
    setIsOpen(next);
    // If user collapses while streaming, mark as user-forced-closed
    if (!next && isStreaming) {
      setHasUserCollapsed(true);
    }
  }, [isOpen, isStreaming]);

  const durationSeconds = durationMs != null ? (durationMs / 1000).toFixed(1) : null;
  const summary = useMemo(() => extractSummary(steps, isStreaming), [steps, isStreaming]);
  const content = steps.join('\n\n');

  if (steps.length === 0 && !isStreaming) return null;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border',
        'bg-zinc-950',
        isStreaming ? 'border-purple-500/50 shadow-lg shadow-purple-500/10' : 'border-zinc-800',
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Hide' : 'Show'} thinking process`}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-zinc-900/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 cursor-pointer"
      >
        {/* Brain icon — animated sparkle overlay when streaming */}
        {isStreaming ? (
          <div className="relative shrink-0">
            <Brain className="w-4 h-4 text-purple-400" />
            <Sparkles className="w-2.5 h-2.5 absolute -top-0.5 -right-0.5 text-purple-400 animate-pulse" />
          </div>
        ) : (
          <Brain className={cn('w-4 h-4 shrink-0', isOpen ? 'text-purple-400' : 'text-zinc-400')} />
        )}

        {/* Label */}
        <span
          className={cn(
            'flex-1 truncate text-sm font-semibold',
            isStreaming ? 'text-purple-400' : 'text-zinc-200',
          )}
        >
          {durationSeconds != null && !isStreaming ? `Thought for ${durationSeconds}s` : summary}
        </span>

        {/* Streaming spinner */}
        {isStreaming && <Loader2 className="w-3 h-3 shrink-0 text-purple-400 animate-spin" />}

        {/* Animated chevron */}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        </motion.div>
      </button>

      {/* Expandable content — height + opacity transition via framer-motion */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.25, ease: 'easeInOut' },
              opacity: { duration: 0.18 },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800">
              <div
                ref={contentRef}
                className="max-h-96 overflow-y-auto"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(113,113,122,0.5) rgba(39,39,42,0.5)',
                }}
              >
                <div className="px-4 py-4 text-sm text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap">
                  {content}
                  {isStreaming && (
                    <span
                      className="inline-block w-1.5 h-3.5 bg-purple-400 ml-1 animate-pulse align-middle"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
