import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, Clock, Layers } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';

interface ReasoningAccordionProps {
  content: string;
  summary?: string;
  metadata?: {
    duration?: number;
    steps?: number;
  };
  className?: string;
}

export function ReasoningAccordion({
  content,
  summary,
  metadata,
  className,
}: ReasoningAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Extract summary if not provided
  const displaySummary = useMemo(() => {
    if (summary) return summary;
    const firstLine = content
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim();
    return firstLine || 'Thinking process';
  }, [content, summary]);

  // Calculate stats
  const stats = useMemo(() => {
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const words = content.split(/\s+/).length;
    const duration = metadata?.duration || 0;
    const steps = metadata?.steps || lines.length;

    return { lines: lines.length, words, duration, steps };
  }, [content, metadata]);

  return (
    <div
      className={cn('overflow-hidden rounded-2xl', 'border border-zinc-800 bg-zinc-950', className)}
    >
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-3',
          'px-4 py-3',
          'text-left',
          'hover:bg-zinc-900/50 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-agent-thinking/50',
        )}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Hide' : 'Show'} thinking process`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Brain
            className={cn('w-4 h-4 shrink-0', isOpen ? 'text-agent-thinking' : 'text-zinc-400')}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-semibold text-sm text-zinc-200 truncate">{displaySummary}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
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
            </div>
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

      {/* Content */}
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
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {/* @ts-expect-error - SyntaxHighlighter type incompatibility with React 18 */}
                <SyntaxHighlighter
                  language="markdown"
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    background: 'transparent',
                    fontSize: '0.75rem',
                    lineHeight: '1.6',
                  }}
                  codeTagProps={{
                    style: {
                      fontFamily: 'Söhne Mono, Monaco, Cascadia Code, Consolas, monospace',
                    },
                  }}
                >
                  {content}
                </SyntaxHighlighter>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Styled scrollbar CSS (add to global styles if not already present)
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
