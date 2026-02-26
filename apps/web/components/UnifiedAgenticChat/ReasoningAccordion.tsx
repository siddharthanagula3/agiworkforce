import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, Clock, Layers, Loader2, Sparkles } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { useSimpleModeStore } from '@/stores/unified/ui';

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

  // Generate an intelligent summary from thinking content
  const displaySummary = useMemo(() => {
    // In simple mode, show user-friendly text instead of technical thinking content
    if (isSimpleMode) {
      if (isStreaming) return 'Thinking about your request...';
      return 'Thought about this';
    }

    if (summary) return summary;

    // Don't generate summary while actively streaming
    if (isStreaming && content.length < 50) {
      return 'Thinking...';
    }

    // Look for key phrases that indicate the thinking topic
    const topicPatterns = [
      /(?:I need to|Let me|I'll|I should|First,? I|To answer|To solve|Looking at)/i,
      /(?:The (?:user|question|task|problem) (?:is|wants|asks|requires))/i,
      /(?:This (?:is|seems|appears|looks|involves))/i,
    ];

    // Find the first meaningful line
    const lines = content.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines.slice(0, 5)) {
      const trimmed = line.trim();
      // Skip very short lines or lines that are just numbering
      if (trimmed.length < 15 || /^[\d.*-]+\s*$/.test(trimmed)) continue;

      // Check if line starts with a topic indicator
      for (const pattern of topicPatterns) {
        if (pattern.test(trimmed)) {
          // Truncate long lines
          return trimmed.length > 80 ? trimmed.slice(0, 77) + '...' : trimmed;
        }
      }
    }

    // Fallback: use first meaningful line
    const firstLine = lines.find((line) => line.trim().length > 15)?.trim();
    if (firstLine) {
      return firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
    }

    return 'Analyzing and reasoning...';
  }, [content, summary, isStreaming, isSimpleMode]);

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
      {/* Inject scrollbar styles */}
      <style dangerouslySetInnerHTML={{ __html: reasoningScrollbarStyles }} />
      {/* Header */}
      <button
        onClick={handleToggle}
        className={cn(
          'w-full flex items-center justify-between gap-3',
          'px-4 py-3',
          'text-left',
          'hover:bg-zinc-900/50 transition-colors',
          'focus:outline-hidden focus:ring-2 focus:ring-agent-thinking/50',
        )}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Hide' : 'Show'} thinking process`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isStreaming ? (
            <div className="relative">
              <Brain className="w-4 h-4 shrink-0 text-agent-thinking" />
              <Sparkles className="w-2.5 h-2.5 absolute -top-0.5 -right-0.5 text-agent-thinking animate-pulse" />
            </div>
          ) : (
            <Brain
              className={cn('w-4 h-4 shrink-0', isOpen ? 'text-agent-thinking' : 'text-zinc-400')}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className={cn(
                  'font-semibold text-sm truncate',
                  isStreaming ? 'text-agent-thinking' : 'text-zinc-200',
                )}
              >
                {displaySummary}
              </span>
              {isStreaming && <Loader2 className="w-3 h-3 text-agent-thinking animate-spin" />}
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              {isStreaming ? (
                <span className="flex items-center gap-1 text-agent-thinking/70">
                  <Sparkles className="w-3 h-3" />
                  {isSimpleMode ? 'Thinking...' : 'Reasoning in progress...'}
                </span>
              ) : isSimpleMode ? (
                <span className="text-zinc-400">Done thinking</span>
              ) : (
                <>
                  <span className="flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    {stats.steps} {stats.steps === 1 ? 'step' : 'steps'}
                  </span>
                  {stats.duration > 0 && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {stats.duration}s
                    </span>
                  )}
                  <span>{stats.words} words</span>
                </>
              )}
            </div>
            {/* Streaming preview when collapsed (hidden in simple mode) */}
            {streamingPreview && !isOpen && !isSimpleMode && (
              <div className="mt-1.5 text-xs text-zinc-500 font-mono truncate max-w-md opacity-70">
                {streamingPreview}
                <span className="inline-block w-1.5 h-3 bg-agent-thinking/70 ml-0.5 animate-pulse" />
              </div>
            )}
          </div>
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
                  {/* Blinking cursor at end of streaming content */}
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-3.5 bg-agent-thinking ml-1 animate-pulse align-middle" />
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

export const reasoningScrollbarStyles = `
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: rgba(39, 39, 42, 0.5);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(113, 113, 122, 0.5);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(113, 113, 122, 0.8);
}
`;
