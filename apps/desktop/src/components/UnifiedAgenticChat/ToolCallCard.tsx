// apps/desktop/src/components/UnifiedAgenticChat/ToolCallCard.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, ChevronDown, Wrench } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

interface ToolCallCardProps {
  toolName: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  status: ToolCallStatus;
  elapsedMs?: number;
  startedAt?: number; // timestamp for computing live elapsed
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ArgsBlock({ args }: { args?: Record<string, unknown> }) {
  if (!args || Object.keys(args).length === 0) return null;

  const json = JSON.stringify(args, null, 2);
  // Clamp to roughly 3 visible lines
  const lines = json.split('\n');
  const clamped = lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n  …' : '');

  return (
    <pre className="mt-1.5 text-[10px] text-slate-400/80 font-mono bg-slate-950/40 rounded px-2 py-1.5 overflow-hidden leading-snug">
      {clamped}
    </pre>
  );
}

function CollapsibleSection({
  label,
  content,
  defaultOpen = false,
  contentClassName,
}: {
  label: string;
  content: string;
  defaultOpen?: boolean;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-300 transition-colors"
      >
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="section-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.2, ease: 'easeInOut' },
              opacity: { duration: 0.15 },
            }}
            className="overflow-hidden"
          >
            <pre
              className={cn(
                'mt-1 text-[10px] font-mono leading-snug whitespace-pre-wrap px-2 py-1.5 rounded bg-slate-950/40',
                contentClassName,
              )}
            >
              {content}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Status-specific decorations
// ────────────────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'pending':
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />;
    case 'running':
      return (
        <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-amber-500/40 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
        </span>
      );
    case 'complete':
      return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />;
    case 'error':
      return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  }
}

function borderForStatus(status: ToolCallStatus): string {
  switch (status) {
    case 'pending':
      return 'border-slate-700';
    case 'running':
      return 'border-amber-500/40';
    case 'complete':
      return 'border-green-500/40';
    case 'error':
      return 'border-red-500/40';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export function ToolCallCard({
  toolName,
  args,
  result,
  error,
  status,
  elapsedMs,
  startedAt,
}: ToolCallCardProps) {
  // Live elapsed timer for 'running' state
  const [liveElapsed, setLiveElapsed] = useState<number>(0);

  useEffect(() => {
    if (status !== 'running' || !startedAt) return;

    const tick = () => setLiveElapsed(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [status, startedAt]);

  const displayDuration =
    status === 'running' && startedAt
      ? formatDuration(liveElapsed)
      : elapsedMs != null
        ? formatDuration(elapsedMs)
        : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('bg-slate-800/50 rounded-lg p-3 text-sm border', borderForStatus(status))}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="font-mono text-xs text-slate-200 font-medium truncate flex-1 min-w-0">
          {toolName}
        </span>
        {displayDuration && (
          <span
            className={cn(
              'text-[10px] font-mono tabular-nums shrink-0',
              status === 'running' ? 'text-amber-400/80' : 'text-slate-500',
            )}
          >
            {displayDuration}
          </span>
        )}
      </div>

      {/* Args preview */}
      <ArgsBlock args={args} />

      {/* Result (complete) — collapsible, default collapsed */}
      {status === 'complete' && result && (
        <CollapsibleSection
          label="Result"
          content={result}
          defaultOpen={false}
          contentClassName="text-slate-300/80"
        />
      )}

      {/* Error (error) — collapsible, default collapsed */}
      {status === 'error' && error && (
        <CollapsibleSection
          label="Error detail"
          content={error}
          defaultOpen={false}
          contentClassName="text-red-400/80"
        />
      )}
    </motion.div>
  );
}
