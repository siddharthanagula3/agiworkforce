// apps/desktop/src/features/chat/ToolCallCard.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Wrench,
  Box,
  Globe,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToolCallStatus = 'pending' | 'running' | 'complete' | 'error';

interface ToolCallCardProps {
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  status: ToolCallStatus;
  elapsedMs?: number;
  startedAt?: number; // timestamp for computing live elapsed
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

/** Derive the source badge label from tool call context. */
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

/** One-line summary extracted from the result string. */
function extractResultSummary(result: string): string {
  const trimmed = result.trim();
  const firstLine = trimmed.split('\n')[0] ?? '';
  return firstLine.length > 80 ? firstLine.slice(0, 77) + '…' : firstLine;
}

/** Attempt to parse a string as JSON; return the original string on failure. */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Syntax-colored JSON renderer — no external dep, uses simple token coloring. */
function JsonBlock({ value, copyLabel }: { value: unknown; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const json = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  }, [json]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const coloredLines = json.split('\n').map((line, i) => {
    // Simple token pass: strings, numbers, booleans, null, keys
    const colored = line
      .replace(
        /("(?:[^"\\]|\\.)*")(\s*:)/g,
        '<span class="text-blue-300">$1</span><span class="text-muted-foreground">$2</span>',
      )
      .replace(/:\s*("(?:[^"\\]|\\.)*")/g, ': <span class="text-emerald-300">$1</span>')
      .replace(
        /:\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
        ': <span class="text-amber-300">$1</span>',
      )
      .replace(/:\s*(true|false|null)/g, ': <span class="text-violet-300">$1</span>');
    return { colored, key: i };
  });

  return (
    <div className="relative rounded bg-black/50 border border-white/10 overflow-hidden">
      <button
        type="button"
        onClick={handleCopy}
        title={`Copy ${copyLabel}`}
        aria-label={`Copy ${copyLabel}`}
        className="absolute top-1.5 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground bg-black/40 hover:bg-black/60 transition-colors"
      >
        {copied ? (
          <Check className="w-2.5 h-2.5 text-emerald-400" />
        ) : (
          <Copy className="w-2.5 h-2.5" />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <div className="overflow-x-auto max-h-48 overflow-y-auto">
        <pre className="font-mono text-[10px] leading-snug p-2 pr-14 select-text">
          {coloredLines.map(({ colored, key }) => (
            <div
              key={key}
              className="text-foreground/80"
              dangerouslySetInnerHTML={{ __html: colored }}
            />
          ))}
        </pre>
      </div>
    </div>
  );
}

/** Expanded detail panel: labeled Request + Response sections with JSON + copy. */
function ExpandedDetail({
  args,
  result,
  error,
  status,
}: {
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  status: ToolCallStatus;
}) {
  const hasRequest = args && Object.keys(args).length > 0;
  const responseContent = status === 'error' ? error : result;
  const hasResponse = Boolean(responseContent);

  if (!hasRequest && !hasResponse) return null;

  return (
    <div className="mt-2 space-y-2">
      {hasRequest && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Request
          </p>
          <JsonBlock value={args} copyLabel="request" />
        </div>
      )}
      {hasResponse && responseContent && (
        <div>
          <p
            className={cn(
              'text-[10px] font-medium uppercase tracking-wide mb-1',
              status === 'error' ? 'text-red-400' : 'text-muted-foreground',
            )}
          >
            Response
          </p>
          <JsonBlock value={tryParseJson(responseContent)} copyLabel="response" />
        </div>
      )}
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
  const [expanded, setExpanded] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState<number>(0);
  // BUG-TCC-002: Use a ref for startTime so it can be reset when status flips back to 'running'
  const timerStartRef = useRef<number>(startedAt ?? Date.now());

  useEffect(() => {
    // BUG-315: Don't start interval when startedAt is undefined
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

  const resultSummary = status === 'complete' && result ? extractResultSummary(result) : undefined;
  const errorSummary = status === 'error' && error ? extractResultSummary(error) : undefined;
  const briefSummary = resultSummary ?? errorSummary;

  const hasExpandableDetail =
    (args && Object.keys(args).length > 0) || Boolean(result) || Boolean(error);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('bg-muted/50 rounded-lg text-sm border', borderForStatus(status))}
    >
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={() => hasExpandableDetail && setExpanded((v) => !v)}
        disabled={!hasExpandableDetail}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse tool details' : 'Expand tool details'}
        className={cn(
          'w-full flex items-center gap-2 px-3 py-2.5 text-left',
          hasExpandableDetail && 'hover:bg-white/[0.03] transition-colors cursor-pointer',
          !hasExpandableDetail && 'cursor-default',
        )}
      >
        <StatusIcon status={status} />
        <Wrench className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="font-mono text-xs text-foreground font-medium truncate min-w-0 flex-1">
          {toolName}
        </span>

        {/* Brief result summary in collapsed state */}
        {!expanded && briefSummary && (
          <span
            className={cn(
              'text-[10px] font-mono truncate max-w-[180px] shrink-0',
              status === 'error' ? 'text-red-400/70' : 'text-muted-foreground/70',
            )}
          >
            {briefSummary}
          </span>
        )}

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
        {hasExpandableDetail && (
          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.15 }}
            className="shrink-0"
          >
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          </motion.div>
        )}
      </button>

      {/* Expanded JSON request/response detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key={`detail-${toolCallId}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.2, ease: 'easeInOut' },
              opacity: { duration: 0.15 },
            }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 border-t border-white/5">
              <ExpandedDetail args={args} result={result} error={error} status={status} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
