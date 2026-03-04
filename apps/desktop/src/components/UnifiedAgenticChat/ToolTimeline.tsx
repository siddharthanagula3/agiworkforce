// apps/desktop/src/components/UnifiedAgenticChat/ToolTimeline.tsx
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Wrench } from 'lucide-react';
import { ToolLabel, type ToolLabelEntry } from './ToolLabel';
import { cn } from '../../lib/utils';

interface ToolTimelineProps {
  entries: ToolLabelEntry[];
  className?: string;
}

export function ToolTimeline({ entries, className }: ToolTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasRunning = entries.some((e) => e.status === 'running');

  // Auto-expand while tools are running
  const isOpen = hasRunning || isExpanded;

  if (entries.length === 0) return null;

  const totalDuration = entries.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  const errorCount = entries.filter((e) => e.status === 'error').length;

  return (
    <div className={cn('border border-border/30 rounded-lg overflow-hidden', className)}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        <Wrench className="w-3 h-3" />
        <span>
          {hasRunning ? (
            <span className="text-violet-400">Running tools...</span>
          ) : (
            <>
              Used {entries.length} tool{entries.length !== 1 ? 's' : ''}
              {errorCount > 0 && <span className="text-red-400 ml-1">({errorCount} failed)</span>}
              {totalDuration > 0 && (
                <span className="text-muted-foreground/60 ml-1">
                  (
                  {totalDuration < 1000
                    ? `${totalDuration}ms`
                    : `${(totalDuration / 1000).toFixed(1)}s`}
                  )
                </span>
              )}
            </>
          )}
        </span>
      </button>

      {/* Expandable tool list */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-0.5 border-t border-border/20">
              {entries.map((entry) => (
                <ToolLabel key={entry.id} entry={entry} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
