'use client';

import { useState, useEffect, useRef } from 'react';
import { Brain, ChevronDown, Loader2, Sparkles } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/ui/collapsible';
import { cn } from '@shared/lib/utils';

interface ReasoningAccordionProps {
  steps: string[];
  isStreaming?: boolean;
  durationMs?: number;
}

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

export function ReasoningAccordion({
  steps,
  isStreaming = false,
  durationMs,
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
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, hasUserCollapsed]);

  // Auto-scroll content to bottom during streaming
  useEffect(() => {
    if (isStreaming && isOpen && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [steps, isStreaming, isOpen]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && isStreaming) {
      setHasUserCollapsed(true);
    }
  };

  const durationSeconds = durationMs ? (durationMs / 1000).toFixed(1) : null;
  const summary = extractSummary(steps, isStreaming);
  const content = steps.join('\n\n');

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl border bg-zinc-950',
          isStreaming ? 'border-purple-500/50 shadow-lg shadow-purple-500/10' : 'border-zinc-800',
        )}
      >
        {/* Header */}
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-zinc-900/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50 cursor-pointer"
            aria-label={`${isOpen ? 'Hide' : 'Show'} thinking process`}
          >
            {/* Brain icon */}
            {isStreaming ? (
              <div className="relative shrink-0">
                <Brain className="w-4 h-4 text-purple-400" />
                <Sparkles className="w-2.5 h-2.5 absolute -top-0.5 -right-0.5 text-purple-400 animate-pulse" />
              </div>
            ) : (
              <Brain
                className={cn('w-4 h-4 shrink-0', isOpen ? 'text-purple-400' : 'text-zinc-400')}
              />
            )}

            {/* Label */}
            <span
              className={cn(
                'flex-1 truncate text-sm font-semibold',
                isStreaming ? 'text-purple-400' : 'text-zinc-200',
              )}
            >
              {durationSeconds && !isStreaming ? `Thought for ${durationSeconds}s` : summary}
            </span>

            {isStreaming && <Loader2 className="w-3 h-3 shrink-0 text-purple-400 animate-spin" />}

            {/* Chevron rotates 180deg when open */}
            <ChevronDown
              className={cn(
                'w-4 h-4 shrink-0 text-zinc-400 transition-transform duration-200',
                isOpen && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>

        {/* Expandable content */}
        <CollapsibleContent>
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
                  <span className="inline-block w-1.5 h-3.5 bg-purple-400 ml-1 animate-pulse align-middle" />
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
