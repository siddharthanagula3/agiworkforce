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
  autoExpandOnStream = false,
  showPreview = false,
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

  const collapsedLabel = useMemo(() => {
    if (isStreaming) {
      return isSimpleMode ? 'Thinking...' : 'Thinking';
    }

    if (metadata?.duration && metadata.duration > 0) {
      return `Thought for ${metadata.duration}s`;
    }

    if (stats.steps > 0) {
      return `Thought in ${stats.steps} step${stats.steps === 1 ? '' : 's'}`;
    }

    return 'Thought';
  }, [isSimpleMode, isStreaming, metadata?.duration, stats.steps]);

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
        'overflow-hidden border bg-card/80',
        isOpen ? 'w-full rounded-2xl' : 'inline-flex max-w-full rounded-full shadow-xs',
        isStreaming
          ? 'border-agent-thinking/50 shadow-lg shadow-agent-thinking/10'
          : 'border-border',
        className,
      )}
    >
      {/* Inject scrollbar styles */}
      <style dangerouslySetInnerHTML={{ __html: reasoningScrollbarStyles }} />
      {/* Header */}
      <button
        onClick={handleToggle}
        className={cn(
          'text-left transition-colors hover:bg-muted/30',
          'focus:outline-hidden focus:ring-2 focus:ring-agent-thinking/50',
          isOpen
            ? 'flex w-full items-center justify-between gap-3 px-4 py-3'
            : 'flex items-center gap-2 px-3 py-2',
          'text-left',
        )}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Hide' : 'Show'} thinking process`}
      >
        <div
          className={cn(
            'min-w-0 flex-1',
            isOpen ? 'flex items-center gap-3' : 'flex items-center gap-2',
          )}
        >
          {isStreaming ? (
            <div className="relative">
              <Brain className="w-4 h-4 shrink-0 text-agent-thinking" />
              <Sparkles className="w-2.5 h-2.5 absolute -top-0.5 -right-0.5 text-agent-thinking animate-pulse" />
            </div>
          ) : (
            <Brain
              className={cn(
                'w-4 h-4 shrink-0',
                isOpen ? 'text-agent-thinking' : 'text-muted-foreground',
              )}
            />
          )}
          <div className="min-w-0 flex-1">
            {!isOpen ? (
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'truncate text-sm font-medium',
                    isStreaming ? 'text-agent-thinking' : 'text-foreground',
                  )}
                >
                  {collapsedLabel}
                </span>
                {isStreaming && <Loader2 className="h-3 w-3 animate-spin text-agent-thinking" />}
              </div>
            ) : (
              <>
                <div className="mb-0.5 flex items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-sm font-semibold',
                      isStreaming ? 'text-agent-thinking' : 'text-foreground',
                    )}
                  >
                    {displaySummary}
                  </span>
                  {isStreaming && <Loader2 className="w-3 h-3 animate-spin text-agent-thinking" />}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {isStreaming ? (
                    <span className="flex items-center gap-1 text-agent-thinking/70">
                      <Sparkles className="w-3 h-3" />
                      {isSimpleMode ? 'Thinking...' : 'Reasoning in progress...'}
                    </span>
                  ) : isSimpleMode ? (
                    <span className="text-muted-foreground">Done thinking</span>
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
                {streamingPreview && !isSimpleMode && (
                  <div className="mt-1.5 max-w-md truncate font-mono text-xs text-muted-foreground opacity-70">
                    {streamingPreview}
                    <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-agent-thinking/70" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
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
            <div className="border-t border-border">
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
