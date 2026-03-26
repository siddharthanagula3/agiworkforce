// apps/desktop/src/components/UnifiedAgenticChat/ThinkingBlock.tsx
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

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
  const [expanded, setExpanded] = useState(defaultExpanded);
  // BUG-TB-001: Track whether the user manually expanded so auto-collapse is skipped
  const [userExpanded, setUserExpanded] = useState(false);
  // BUG-331: Guard so auto-collapse only fires after streaming transitions from true→false,
  // not on initial mount when isStreaming is already false (e.g. historical messages)
  const isMountedRef = useRef(false);

  // Auto-collapse when streaming finishes, unless user manually expanded
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (!isStreaming && !userExpanded) {
      setExpanded(false);
    }
  }, [isStreaming, userExpanded]);

  // BUG-TB-002: Guard against undefined content before splitting
  if (!content) return null;

  // Single-line preview: first non-empty line, truncated
  const preview =
    (content ?? '')
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';

  const headerLabel = isStreaming ? 'Thinking...' : 'Thought';

  return (
    <div className={cn('bg-card/30 border border-border/30 rounded-lg overflow-hidden')}>
      {/* Header */}
      <button
        type="button"
        onClick={() => {
          // BUG-TB-001: Update userExpanded before toggling so auto-collapse logic is aware
          const next = !expanded;
          setUserExpanded(next);
          setExpanded(next);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} reasoning`}
      >
        {/* Brain icon — pulses while streaming */}
        <Brain
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-slate-400',
            isStreaming && 'animate-pulse text-slate-300',
          )}
        />

        {/* "Reasoning" label in small caps */}
        <span
          className="text-[10px] tracking-widest text-slate-400"
          style={{ fontVariant: 'small-caps' }}
        >
          Reasoning
        </span>

        {/* Streaming / done label */}
        <span className={cn('text-xs', isStreaming ? 'text-slate-300' : 'text-slate-500')}>
          {headerLabel}
        </span>

        {/* Collapsed preview */}
        {!expanded && preview && (
          <span className="flex-1 text-xs text-slate-500 truncate min-w-0 italic font-mono">
            {preview}
          </span>
        )}

        {/* Chevron toggle */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-slate-500"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.div>
      </button>

      {/* Collapsible body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="thinking-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.25, ease: 'easeInOut' },
              opacity: { duration: 0.15 },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-700/30 px-4 py-3">
              <p
                className={cn(
                  'text-xs text-slate-400/70 font-mono italic leading-relaxed whitespace-pre-wrap',
                )}
              >
                {content}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
