import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ThinkingBlockProps {
  content: string;
  isStreaming: boolean;
  defaultExpanded?: boolean;
  blockIndex?: number;
}

export function ThinkingBlock({
  content,
  isStreaming,
  defaultExpanded = true,
  blockIndex,
}: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [userExpanded, setUserExpanded] = useState(false);
  const isMountedRef = useRef(false);

  const startRef = useRef<number>(Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!isStreaming) return;
    startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isStreaming]);

  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (!isStreaming && !userExpanded) {
      setExpanded(false);
    }
  }, [isStreaming, userExpanded]);

  if (!content) return null;

  const preview =
    (content ?? '')
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? '';

  const blockLabel =
    blockIndex != null ? `Thought ${blockIndex + 1}` : isStreaming ? 'Thinking…' : 'Thought';

  const elapsedLabel = isStreaming && elapsedSec > 0 ? ` ${elapsedSec}s` : '';

  return (
    <div className={cn('bg-card/30 border border-border/30 rounded-lg overflow-hidden')}>
      {/* Header */}
      <button
        type="button"
        onClick={() => {
          const next = !expanded;
          setUserExpanded(next);
          setExpanded(next);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} reasoning`}
      >
        {/* Clock icon — replaces Brain; pulses while streaming */}
        <Clock
          className={cn(
            'w-3.5 h-3.5 shrink-0 text-slate-400',
            isStreaming && 'animate-pulse text-slate-300',
          )}
        />

        {/* "Thinking..." or "Thought N" label */}
        <span
          className={cn('text-xs font-medium', isStreaming ? 'text-slate-300' : 'text-slate-500')}
        >
          {blockLabel}
          {elapsedLabel}
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
          className="shrink-0 text-slate-500 ml-auto"
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

interface ThinkingBlockFlowProps {
  blocks: Array<{ content: string; isStreaming: boolean }>;
  defaultExpanded?: boolean;
}

export function ThinkingBlockFlow({ blocks, defaultExpanded = true }: ThinkingBlockFlowProps) {
  if (blocks.length === 0) return null;

  if (blocks.length === 1) {
    return (
      <ThinkingBlock
        content={blocks[0]!.content}
        isStreaming={blocks[0]!.isStreaming}
        defaultExpanded={defaultExpanded}
      />
    );
  }

  return (
    <div className="space-y-1.5 relative">
      {/* Vertical connector line behind the blocks */}
      <div className="absolute left-[15px] top-6 bottom-6 w-px bg-slate-700/40 z-0" />
      {blocks.map((block, i) => (
        <div key={i} className="relative z-10">
          <ThinkingBlock
            content={block.content}
            isStreaming={block.isStreaming}
            blockIndex={i}
            defaultExpanded={defaultExpanded && i === blocks.length - 1}
          />
        </div>
      ))}
    </div>
  );
}
