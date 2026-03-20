import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, Clock, Layers } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';
import { useSimpleModeStore } from '../../stores/ui';

/**
 * Format a duration in milliseconds into a human-readable string.
 * Under 60 s → "12s"
 * 60 s+      → "2m 13s"
 * Exactly on minute → "1m"
 */
function formatThinkingDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

interface ReasoningAccordionProps {
  content: string;
  summary?: string;
  metadata?: {
    duration?: number;
    steps?: number;
    thinkingPattern?: string;
  };
  className?: string;
  isStreaming?: boolean;
  /** Auto-expand when streaming starts */
  autoExpandOnStream?: boolean;
  /** Show preview of content in header when collapsed */
  showPreview?: boolean;
}

export function ReasoningAccordion({
  content,
  summary,
  metadata,
  className,
  isStreaming = false,
  autoExpandOnStream = true,
  showPreview = true,
}: ReasoningAccordionProps) {
  const isSimpleMode = useSimpleModeStore((state) => state.mode === 'simple');
  const [isOpen, setIsOpen] = useState(false);
  const [hasUserCollapsed, setHasUserCollapsed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const prevStreamingRef = useRef(isStreaming);
  // Track when thinking started for live elapsed timer
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  // Live elapsed timer — ticks every second while streaming, cleans up when done
  useEffect(() => {
    if (!isStreaming) {
      return;
    }
    // Reset start time when streaming begins
    startTimeRef.current = Date.now();
    setElapsedMs(0);

    const intervalId = setInterval(() => {
      const start = startTimeRef.current;
      setElapsedMs(Date.now() - start);
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isStreaming]);

  // Auto-expand when streaming starts (unless user manually collapsed or in simple mode)
  useEffect(() => {
    if (
      autoExpandOnStream &&
      isStreaming &&
      !prevStreamingRef.current &&
      !hasUserCollapsed &&
      !isSimpleMode
    ) {
      setIsOpen(true);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, autoExpandOnStream, hasUserCollapsed, isSimpleMode]);

  // Auto-scroll to bottom when content updates during streaming
  useEffect(() => {
    if (isStreaming && isOpen && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content, isStreaming, isOpen]);

  // Handle user toggle
  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (!newState && isStreaming) {
      setHasUserCollapsed(true);
    }
  };

  const stats = useMemo(() => {
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const words = content.split(/\s+/).length;
    const duration = metadata?.duration || 0;
    const steps = metadata?.steps || lines.length;

    return { lines: lines.length, words, duration, steps };
  }, [content, metadata]);

  // Get last few lines for streaming preview
  const streamingPreview = useMemo(() => {
    if (!isStreaming || !showPreview || isOpen) return null;
    const lines = content.split('\n').filter((l) => l.trim());
    const lastLines = lines.slice(-3).join('\n');
    return lastLines.length > 150 ? '...' + lastLines.slice(-147) : lastLines;
  }, [content, isStreaming, showPreview, isOpen]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl',
        'border bg-zinc-950',
        isStreaming
          ? 'border-agent-thinking/50 shadow-lg shadow-agent-thinking/10'
          : 'border-zinc-800',
        className,
      )}
    >
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center justify-between gap-3',
          'px-4 py-3',
          'text-left',
          'hover:bg-zinc-900/50 transition-colors',
          'focus:outline-hidden focus:ring-2 focus:ring-agent-thinking/50',
        )}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Hide' : 'Show'} thinking process${summary ? `: ${summary}` : ''}`}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Brain icon — animated pulse while streaming */}
          <Brain
            className={cn(
              'w-4 h-4 shrink-0',
              isStreaming
                ? 'text-agent-thinking animate-pulse'
                : isOpen
                  ? 'text-agent-thinking'
                  : 'text-zinc-400',
            )}
          />

          {/* Primary label: "Thinking... 12s" or "Thought for 2m 13s" */}
          {isStreaming ? (
            <span className="font-medium text-sm text-agent-thinking">
              {isSimpleMode ? 'Thinking...' : `Thinking\u2026 ${formatThinkingDuration(elapsedMs)}`}
            </span>
          ) : (
            <span className={cn('font-medium text-sm', isOpen ? 'text-zinc-200' : 'text-zinc-300')}>
              {isSimpleMode
                ? 'Thought about this'
                : (() => {
                    // Prefer server-reported duration (seconds → ms), fall back to client elapsed
                    const durationMs = stats.duration > 0 ? stats.duration * 1000 : elapsedMs;
                    return `Thought for ${formatThinkingDuration(durationMs)}`;
                  })()}
            </span>
          )}

          {/* Streaming preview when collapsed (hidden in simple mode) */}
          {streamingPreview && !isOpen && !isSimpleMode && (
            <span className="text-xs text-zinc-500 font-mono truncate opacity-70 hidden sm:inline">
              {streamingPreview}
            </span>
          )}
        </div>

        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="w-4 h-4 text-zinc-400" />
        </motion.div>
      </button>

      {}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.3, ease: 'easeInOut' },
              opacity: { duration: 0.2 },
            }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800">
              {/* Secondary stats row — shown in body when expanded, hidden in simple mode */}
              {!isSimpleMode && (
                <div className="flex items-center gap-3 px-4 pt-3 pb-1 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {stats.steps} {stats.steps === 1 ? 'step' : 'steps'}
                  </span>
                  <span>{stats.words} words</span>
                  {stats.duration > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {stats.duration}s
                    </span>
                  )}
                </div>
              )}
              <div ref={contentRef} className="max-h-96 overflow-y-auto custom-scrollbar">
                <div className="relative p-4 text-xs font-mono leading-relaxed">
                  <SyntaxHighlighter
                    language="markdown"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      padding: 0,
                      background: 'transparent',
                      fontSize: 'inherit',
                      lineHeight: 'inherit',
                      display: 'inline',
                    }}
                    codeTagProps={{
                      style: {
                        fontFamily: 'Söhne Mono, Monaco, Cascadia Code, Consolas, monospace',
                        display: 'inline',
                      },
                    }}
                  >
                    {content}
                  </SyntaxHighlighter>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
