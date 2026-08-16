import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, ChevronDown, Clock } from 'lucide-react';
import { lucideToolIcon } from '@agiworkforce/ui';
import { cn } from '../../../lib/utils';

export type StepVariant = 'thinking' | 'tool' | 'done';

export interface TimelineStepProps {
  variant: StepVariant;
  label: string;
  iconName?: string;
  sourceBadge?: string | null;
  chip?: string;
  request?: string;
  result?: string;
  isError?: boolean;
  isRunning?: boolean;
  isLast?: boolean;
  duration?: number;
}

export function TimelineStep({
  variant,
  label,
  iconName,
  sourceBadge,
  chip,
  request,
  result,
  isError = false,
  isRunning = false,
  isLast = false,
  duration,
}: TimelineStepProps) {
  const [resultOpen, setResultOpen] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);

  const THINKING_TRUNCATE = 240;
  const isLongThinking = variant === 'thinking' && label.length > THINKING_TRUNCATE;
  const shownLabel =
    isLongThinking && !textExpanded ? `${label.slice(0, THINKING_TRUNCATE).trimEnd()}…` : label;

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
      const ToolIcon = lucideToolIcon(iconName ?? 'Wrench');
      return (
        <ToolIcon
          className={cn(
            'w-3.5 h-3.5 shrink-0',
            isRunning ? 'animate-pulse text-amber-400' : 'text-muted-foreground',
          )}
        />
      );
    }
    return <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />;
  })();

  const hasResult =
    variant === 'tool' &&
    ((result !== undefined && result !== null) || (request !== undefined && request !== null));

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
          {variant === 'tool' && sourceBadge && (
            <span
              title="Integration"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-bold text-muted-foreground"
            >
              {sourceBadge}
            </span>
          )}
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
            {shownLabel}
            {isLongThinking && (
              <button
                type="button"
                onClick={() => setTextExpanded((o) => !o)}
                className="ml-1 not-italic font-medium text-muted-foreground/80 hover:text-foreground"
              >
                {textExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
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

        {/* Type / arg chip on its own line (Claude inline tool-call style) */}
        {variant === 'tool' && chip && (
          <div className="mt-1">
            <span className="inline-flex max-w-full items-center truncate rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/90">
              {chip}
            </span>
          </div>
        )}

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
              {/* Request block (tool args) — Claude inline expanded-detail style */}
              {request != null && request !== '' && (
                <>
                  <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    Request
                  </div>
                  <pre className="mt-1 max-h-48 overflow-y-auto rounded bg-card/60 p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-foreground">
                    {request}
                  </pre>
                </>
              )}
              {/* Response block (tool result) */}
              {result != null && result !== '' && (
                <>
                  <div
                    className={cn(
                      'mt-1.5 text-[10px] font-medium uppercase tracking-wide',
                      isError ? 'text-red-400/80' : 'text-muted-foreground/70',
                    )}
                  >
                    {isError ? 'Error' : 'Response'}
                  </div>
                  <pre
                    className={cn(
                      'mt-1 max-h-64 overflow-y-auto rounded p-2 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap',
                      isError ? 'bg-red-950/40 text-red-300' : 'bg-card/60 text-foreground',
                    )}
                  >
                    {result}
                  </pre>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
