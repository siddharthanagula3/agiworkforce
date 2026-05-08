// packages/unified-chat/src/components/ToolCallCard.tsx
// Ported from apps/desktop/src/components/UnifiedAgenticChat/ToolCallCard.tsx
// No Tauri, no desktop stores.

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, XCircle, ChevronDown, Wrench, Box, Globe } from 'lucide-react';
import { cn } from '../lib/utils';

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

export interface ToolCallCardProps {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  status: ToolCallStatus;
  elapsedMs?: number;
  /** Unix timestamp (ms) — used to compute live elapsed while running. */
  startedAt?: number;
}

/** Browser-related display names that indicate browser automation actions. */
const BROWSER_DISPLAY_NAMES = new Set([
  'open website',
  'click',
  'clicking',
  'type text',
  'typing',
  'take screenshot',
  'scroll page',
  'browsing',
  'autofill application',
  'get url',
  'get page title',
  'go back',
  'go forward',
  'reload page',
  'run javascript',
  'wait for element',
  'select option',
  'hover',
  'fill input',
]);

function getSourceBadge(
  toolCallId: string,
  toolName: string,
): { label: string; BadgeIcon: React.ElementType } | null {
  const id = toolCallId.toLowerCase();
  const name = toolName.toLowerCase();
  if (
    id.startsWith('mcp__') ||
    id.startsWith('mcp_') ||
    name.startsWith('mcp__') ||
    name.startsWith('mcp_')
  ) {
    return { label: 'MCP', BadgeIcon: Box };
  }
  if (BROWSER_DISPLAY_NAMES.has(name)) {
    return { label: 'Browser', BadgeIcon: Globe };
  }
  return null;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ArgsBlock({ args }: { args?: Record<string, unknown> }) {
  if (!args || Object.keys(args).length === 0) return null;
  const json = JSON.stringify(args, null, 2);
  const lines = json.split('\n');
  const clamped = lines.slice(0, 3).join('\n') + (lines.length > 3 ? '\n  …' : '');
  return (
    <pre className="mt-1.5 text-[10px] text-muted-foreground/80 font-mono bg-background/40 rounded px-2 py-1.5 overflow-hidden leading-snug">
      {clamped}
    </pre>
  );
}

function CollapsibleSection({
  label,
  content,
  defaultOpen = false,
  contentClassName,
  sectionId,
}: {
  label: string;
  content: string;
  defaultOpen?: boolean;
  contentClassName?: string;
  sectionId: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
        {label}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={`section-body-${sectionId}`}
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
                'mt-1 text-[10px] font-mono leading-snug whitespace-pre-wrap px-2 py-1.5 rounded bg-background/40',
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

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'pending':
      return <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />;
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
      return 'border-border';
    case 'running':
      return 'border-amber-500/40';
    case 'complete':
      return 'border-green-500/40';
    case 'error':
      return 'border-red-500/40';
  }
}

export function ToolCallCard({
  toolCallId,
  toolName,
  args,
  result,
  error,
  status,
  elapsedMs,
  startedAt,
}: ToolCallCardProps) {
  const [liveElapsed, setLiveElapsed] = useState<number>(0);
  const timerStartRef = useRef<number>(startedAt ?? Date.now());

  useEffect(() => {
    if (status !== 'running' || startedAt == null) return;
    timerStartRef.current = startedAt;
    const tick = () => setLiveElapsed(Date.now() - timerStartRef.current);
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

  const sourceBadge = getSourceBadge(toolCallId, toolName);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('bg-muted/50 rounded-lg p-3 text-sm border', borderForStatus(status))}
    >
      <div className="flex items-center gap-2">
        <StatusIcon status={status} />
        <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono text-xs text-foreground font-medium truncate flex-1 min-w-0">
          {toolName}
        </span>
        {sourceBadge && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-accent/60 text-foreground shrink-0">
            <sourceBadge.BadgeIcon className="w-2.5 h-2.5" />
            {sourceBadge.label}
          </span>
        )}
        {displayDuration && (
          <span
            className={cn(
              'text-[10px] font-mono tabular-nums shrink-0',
              status === 'running' ? 'text-amber-400/80' : 'text-muted-foreground',
            )}
          >
            {displayDuration}
          </span>
        )}
      </div>

      <ArgsBlock args={args} />

      {status === 'complete' && result && (
        <CollapsibleSection
          label="Result"
          content={result}
          defaultOpen={false}
          contentClassName="text-foreground/80"
          sectionId={`${toolCallId}-result`}
        />
      )}

      {status === 'error' && error && (
        <CollapsibleSection
          label="Error detail"
          content={error}
          defaultOpen={false}
          contentClassName="text-red-400/80"
          sectionId={`${toolCallId}-error`}
        />
      )}
    </motion.div>
  );
}
