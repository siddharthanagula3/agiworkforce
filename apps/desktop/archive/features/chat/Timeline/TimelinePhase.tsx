import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../../lib/utils';

export interface TimelinePhaseProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export function TimelinePhase({ title, defaultExpanded = false, children }: TimelinePhaseProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-lg border border-border/30 overflow-hidden">
      {/* Phase header */}
      <button
        type="button"
        onClick={() => setIsExpanded((o) => !o)}
        aria-expanded={isExpanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="inline-flex shrink-0 text-muted-foreground"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </motion.span>
        <span
          className={cn(
            'text-xs font-medium truncate transition-colors',
            isExpanded ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {title}
        </span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/20 px-3 pt-2 pb-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
