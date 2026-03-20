import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, Clock, Link2 } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type StepVariant = 'thinking' | 'tool' | 'done';

export interface TimelineStepProps {
  variant: StepVariant;
  label: string;
  result?: string;
  isError?: boolean;
  isRunning?: boolean;
  isLast?: boolean;
  duration?: number;
}

export function TimelineStep({
  variant,
  label,
  result,
  isError = false,
  isRunning = false,
  isLast = false,
  duration,
}: TimelineStepProps) {
  const [resultOpen, setResultOpen] = useState(false);

  const icon = (() => {
    if (variant === 'thinking') {
      return (
        <Clock
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            isRunning ? 'animate-pulse text-amber-400' : 'text-muted-foreground',
          )}
        />
      );
    }
    if (variant === 'tool') {
      return <Link2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />;
    }
    // done
    return <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />;
  })();

  const hasResult = variant === 'tool' && result !== undefined && result !== null;

  return (
    <div className="relative flex gap-3">
      {/* Vertical connecting line */}
      {!isLast && <div className="absolute left-[6px] top-5 bottom-0 w-px bg-border" />}

      {/* Icon column */}
      <div className="relative z-10 flex h-3.5 w-3.5 shrink-0 items-center justify-center mt-0.5">
        {icon}
      </div>

      {/* Content column */}
      <div className="flex-1 min-w-0 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              'text-xs',
              variant === 'done'
                ? 'text-emerald-500 font-medium'
                : variant === 'thinking'
                  ? 'text-muted-foreground italic'
                  : 'text-foreground/80',
            )}
          >
            {label}
          </span>

          {/* Duration badge */}
          {duration !== undefined && duration > 0 && (
            <span className="text-[10px] text-muted-foreground/60 font-mono">
              {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
            </span>
          )}

          {/* Result toggle badge */}
          {hasResult && (
            <button
              type="button"
              onClick={() => setResultOpen((o) => !o)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                isError
                  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              Result
              <motion.span
                animate={{ rotate: resultOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex"
              >
                <ChevronDown className="w-2.5 h-2.5" />
              </motion.span>
            </button>
          )}
        </div>

        {/* Result content */}
        <AnimatePresence initial={false}>
          {hasResult && resultOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <pre
                className={cn(
                  'mt-1.5 max-h-64 overflow-y-auto rounded p-2 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words',
                  isError ? 'bg-red-950/40 text-red-300' : 'bg-zinc-900/60 text-zinc-300',
                )}
              >
                {result}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
