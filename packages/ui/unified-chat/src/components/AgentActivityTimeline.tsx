import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  DatabaseZap,
  ExternalLink,
  FileOutput,
  Globe2,
  Loader2,
  PauseCircle,
} from 'lucide-react';
import type { AgentEventToolCategory } from '@agiworkforce/types/protocol';
import type {
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { cn } from '../lib/utils';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard';
import type { InlineToolKind } from './InlineToolCall';

const ACTIVITY_PAGE_SIZE = 40;
const TOKEN_NUMBER_FORMAT = new Intl.NumberFormat('en-US');

export interface AgentActivityTimelineProps {
  activity: AgentActivityState;
  className?: string;
  defaultExpanded?: boolean;
  /** Deterministic clock injection for tests and static previews. */
  nowMs?: number;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  onCancel?: (toolCallId: string) => void;
  onResend?: (toolCallId: string) => void;
  isApprovalExpired?: (toolCallId: string) => boolean;
}

function formatDuration(ms: number): string {
  const safeMs = Math.max(0, ms);
  if (safeMs < 1_000) return `${safeMs}ms`;
  const totalSeconds = Math.floor(safeMs / 1_000);
  if (totalSeconds < 60) {
    const tenths = Math.floor(safeMs / 100) / 10;
    return `${tenths.toFixed(tenths % 1 === 0 ? 0 : 1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m ${seconds}s`;
}

function runElapsed(activity: AgentActivityState, nowMs: number): number {
  return Math.max(0, (activity.completedAtMs ?? nowMs) - activity.startedAtMs);
}

function latestActiveSummary(activity: AgentActivityState): string | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (!entry) continue;
    if (
      (entry.kind === 'tool' || entry.kind === 'progress') &&
      (entry.status === 'running' || entry.status === 'awaiting-approval')
    ) {
      return entry.summary;
    }
  }
  return undefined;
}

function completedSummary(activity: AgentActivityState): string {
  const tools = activity.entries.filter((entry) => entry.kind === 'tool').length;
  const artifacts = activity.entries.filter((entry) => entry.kind === 'artifact').length;
  const steps = activity.entries.length;
  const parts: string[] = [];
  if (tools > 0) parts.push(`${tools} tool${tools === 1 ? '' : 's'}`);
  if (artifacts > 0) parts.push(`${artifacts} file${artifacts === 1 ? '' : 's'} created`);
  if (parts.length === 0 && steps > 0) parts.push(`${steps} step${steps === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

export function buildAgentActivitySummary(activity: AgentActivityState, nowMs: number): string {
  const elapsed = formatDuration(runElapsed(activity, nowMs));
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Needs approval · ${active}` : 'Needs approval';
  }
  if (activity.status === 'paused') return `Paused after ${elapsed}`;
  if (activity.status === 'failed') return `Stopped after ${elapsed}`;
  if (activity.status === 'cancelled') return `Cancelled after ${elapsed}`;
  if (activity.status === 'completed') {
    const completed = completedSummary(activity);
    return `Done in ${elapsed}${completed ? ` · ${completed}` : ''}`;
  }
  return active ? `${active} · ${elapsed}` : `Working for ${elapsed}`;
}

function buildAgentActivityAnnouncement(activity: AgentActivityState): string {
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Approval needed: ${active}` : 'Approval needed';
  }
  if (activity.status === 'paused') return 'Agent activity paused';
  if (activity.status === 'failed') return 'Agent activity failed';
  if (activity.status === 'cancelled') return 'Agent activity cancelled';
  if (activity.status === 'completed') return 'Agent activity completed';
  return active ? `Agent working: ${active}` : 'Agent working';
}

function toToolStatus(entry: AgentActivityToolEntry): ToolCallStatus {
  switch (entry.status) {
    case 'completed':
      return 'complete';
    case 'failed':
      return 'error';
    case 'awaiting-approval':
      return 'awaiting_approval';
    case 'cancelled':
      return 'cancelled';
    case 'running':
      return 'running';
    case 'pending':
      return 'pending';
  }
}

function categoryToKind(category: AgentEventToolCategory): InlineToolKind {
  switch (category) {
    case 'web-search':
      return 'web-search';
    case 'web-fetch':
      return 'web-fetch';
    case 'shell':
    case 'code-execution':
      return 'bash';
    case 'filesystem':
      return 'fs-list';
    case 'computer-use':
      return 'browser';
    case 'connector':
    case 'mcp':
      return 'mcp-custom';
    case 'artifact':
      return 'write';
    case 'skill':
    case 'memory':
    case 'other':
      return 'unknown';
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { input: value };
}

function asResult(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function safeHref(value: string): string | undefined {
  if (value.startsWith('/')) return value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Favicon for a source row: real favicon (Google service) with a Globe2 fallback. */
function SourceFavicon({ url }: { url: string }) {
  const [errored, setErrored] = useState(false);
  let domain = '';
  try {
    domain = new URL(url).hostname;
  } catch {
    /* keep empty */
  }
  const src = !errored && domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
  if (!src) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
        <Globe2 className="h-3 w-3" aria-hidden="true" />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-5 w-5 shrink-0 rounded-full"
      onError={() => setErrored(true)}
    />
  );
}

/** How many source rows to show before collapsing the rest behind "+N more". */
const MAX_VISIBLE_SOURCES = 5;

function SourceLinks({
  entry,
}: {
  entry: Extract<AgentActivityEntry, { kind: 'tool' | 'sources' }>;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!entry.sources || entry.sources.length === 0) return null;
  const total = entry.sources.length;
  const visible = showAll ? entry.sources : entry.sources.slice(0, MAX_VISIBLE_SOURCES);
  const hidden = total - visible.length;
  return (
    <div className="ml-8 mt-1.5 space-y-1.5 pb-1" aria-label="Sources">
      <div className="flex items-center gap-2">
        {entry.query && (
          <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">
            {entry.query}
          </p>
        )}
        <span className="shrink-0 text-[11px] text-muted-foreground/70">
          {total} result{total === 1 ? '' : 's'}
        </span>
      </div>
      {visible.map((source, index) => {
        const href = safeHref(source.url);
        const content = (
          <>
            <SourceFavicon url={source.url} />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">
              {source.title || sourceDomain(source.url)}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {sourceDomain(source.url)}
            </span>
            {href && <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />}
          </>
        );
        return href ? (
          <a
            key={`${source.url}:${index}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 touch-manipulation items-center gap-2 rounded-lg border border-border/50 px-2 py-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {content}
          </a>
        ) : (
          <div
            key={`${source.url}:${index}`}
            className="flex min-w-0 items-center gap-2 rounded-lg border border-border/50 px-2 py-1.5 text-muted-foreground"
          >
            {content}
          </div>
        );
      })}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="touch-manipulation rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          +{hidden} more
        </button>
      )}
    </div>
  );
}

function ProgressRow({ entry }: { entry: Extract<AgentActivityEntry, { kind: 'progress' }> }) {
  return (
    <div className="relative pl-8 py-1.5">
      <span className="absolute left-0 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground">
        {entry.status === 'running' ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : entry.status === 'failed' || entry.status === 'cancelled' ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
        ) : (
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </span>
      <p className="break-words text-sm text-foreground/90">{entry.summary}</p>
      {entry.detail && (
        <details className="mt-1 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Show more
          </summary>
          <p className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{entry.detail}</p>
        </details>
      )}
    </div>
  );
}

function StaticRow({
  entry,
}: {
  entry: Exclude<AgentActivityEntry, { kind: 'tool' | 'progress' }>;
}) {
  if (entry.kind === 'sources') {
    return (
      <div className="relative pl-8 py-1.5">
        <Globe2
          className="absolute left-0 top-2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm text-foreground/90">
          Found {entry.sources.length} source{entry.sources.length === 1 ? '' : 's'}
        </p>
        <SourceLinks entry={entry} />
      </div>
    );
  }

  if (entry.kind === 'artifact') {
    const href = safeHref(entry.uri);
    const label = (
      <>
        <FileOutput className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{entry.name}</span>
        {href && <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />}
      </>
    );
    return (
      <div className="relative pl-8 py-1.5">
        <CheckCircle2
          className="absolute left-0 top-2 h-4 w-4 text-emerald-500"
          aria-hidden="true"
        />
        <p className="mb-1 text-sm text-foreground/90">Created a file</p>
        {href ? (
          <a
            href={href}
            className="flex max-w-xl touch-manipulation items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {label}
          </a>
        ) : (
          <div className="flex max-w-xl items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
            {label}
          </div>
        )}
      </div>
    );
  }

  if (entry.kind === 'context') {
    return (
      <div className="relative pl-8 py-1.5">
        <DatabaseZap
          className="absolute left-0 top-2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm text-foreground/90">{entry.summary}</p>
        {entry.beforeTokens !== undefined && entry.afterTokens !== undefined && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {TOKEN_NUMBER_FORMAT.format(entry.beforeTokens)} →{' '}
            {TOKEN_NUMBER_FORMAT.format(entry.afterTokens)} tokens
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative pl-8 py-1.5">
      <AlertCircle className="absolute left-0 top-2 h-4 w-4 text-destructive" aria-hidden="true" />
      <p className="break-words text-sm text-destructive">{entry.message}</p>
      {entry.retryable && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">Retry available</p>
      )}
    </div>
  );
}

function RunStatusIcon({ status }: { status: AgentActivityState['status'] }) {
  if (status === 'running') {
    return (
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    );
  }
  if (status === 'paused') return <PauseCircle className="h-4 w-4" aria-hidden="true" />;
  if (status === 'failed' || status === 'cancelled') {
    return <AlertCircle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  }
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
  }
  return <BrainCircuit className="h-4 w-4 text-amber-500" aria-hidden="true" />;
}

export function AgentActivityTimeline({
  activity,
  className,
  defaultExpanded = false,
  nowMs,
  onApprove,
  onReject,
  onCancel,
  onResend,
  isApprovalExpired,
}: AgentActivityTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // While the run is active (running / awaiting approval) the timeline auto-opens
  // so the user watches the steps stream live (Claude/ChatGPT behaviour), then
  // collapses to the summary pill when the run finishes. `userForcedClosed` lets
  // the user override the auto-open during a run; it resets when the run ends.
  const [userForcedClosed, setUserForcedClosed] = useState(false);
  const [liveNow, setLiveNow] = useState(() => nowMs ?? activity.updatedAtMs);
  const [entryVisibility, setEntryVisibility] = useState(() => ({
    turnId: activity.turnId,
    count: ACTIVITY_PAGE_SIZE,
  }));

  useEffect(() => {
    if (nowMs !== undefined || activity.status !== 'running') return;
    const timer = window.setInterval(() => setLiveNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [activity.status, nowMs]);

  const isActive = activity.status === 'running' || activity.status === 'awaiting-approval';
  // Effective open state: auto-open while active (unless the user closed it),
  // else follow the manual `expanded` toggle.
  const isOpen = userForcedClosed ? false : isActive || expanded;

  // When a run finishes, clear the manual-close and collapse to the summary so
  // the next run auto-opens and the completed trace reads as a single pill.
  const prevActive = useRef(isActive);
  useEffect(() => {
    if (prevActive.current && !isActive) {
      setUserForcedClosed(false);
      setExpanded(false);
    }
    prevActive.current = isActive;
  }, [isActive]);

  const handleToggle = () => {
    if (isOpen) {
      // Closing: during an active run, remember the manual close.
      if (isActive) setUserForcedClosed(true);
      else setExpanded(false);
    } else {
      setUserForcedClosed(false);
      setExpanded(true);
    }
  };

  const effectiveNow = nowMs ?? Math.max(liveNow, activity.updatedAtMs);
  const summary = useMemo(
    () => buildAgentActivitySummary(activity, effectiveNow),
    [activity, effectiveNow],
  );
  const announcement = buildAgentActivityAnnouncement(activity);
  const visibleEntryCount =
    entryVisibility.turnId === activity.turnId ? entryVisibility.count : ACTIVITY_PAGE_SIZE;
  const hiddenEntryCount = Math.max(0, activity.entries.length - visibleEntryCount);
  const visibleEntries = activity.entries.slice(hiddenEntryCount);

  if (activity.entries.length === 0 && activity.status === 'completed') return null;

  return (
    <section className={cn('w-full max-w-3xl', className)} aria-label="Agent activity">
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? 'Hide' : 'Show'} agent activity: ${summary}`}
        className="group flex w-full min-w-0 touch-manipulation items-center gap-2 rounded-md py-1.5 text-left text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <RunStatusIcon status={activity.status} />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none',
            isOpen && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div className="relative ml-2 mt-1 space-y-0.5 border-l border-border/70 pl-4">
          {hiddenEntryCount > 0 && (
            <button
              type="button"
              onClick={() =>
                setEntryVisibility({
                  turnId: activity.turnId,
                  count: visibleEntryCount + ACTIVITY_PAGE_SIZE,
                })
              }
              className="ml-7 touch-manipulation rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Show {Math.min(ACTIVITY_PAGE_SIZE, hiddenEntryCount)} earlier steps
            </button>
          )}
          {visibleEntries.map((entry) => {
            if (entry.kind === 'progress') return <ProgressRow key={entry.id} entry={entry} />;
            if (entry.kind === 'tool') {
              return (
                <div key={entry.id} className="relative py-1 pl-7">
                  <ToolCallCard
                    id={entry.toolCallId}
                    name={entry.summary}
                    status={toToolStatus(entry)}
                    requiresApproval={entry.status === 'awaiting-approval'}
                    args={asRecord(entry.input)}
                    result={asResult(entry.output)}
                    error={entry.error}
                    elapsedMs={entry.elapsedMs}
                    startedAt={entry.status === 'running' ? entry.startedAtMs : undefined}
                    kind={categoryToKind(entry.category)}
                    expired={isApprovalExpired?.(entry.toolCallId) ?? false}
                    onApprove={onApprove}
                    onReject={onReject}
                    onCancel={onCancel}
                    onResend={onResend}
                    footer={entry.sources ? <SourceLinks entry={entry} /> : undefined}
                  />
                </div>
              );
            }
            return <StaticRow key={entry.id} entry={entry} />;
          })}
          {activity.status === 'completed' && (
            <div className="relative pl-8 py-1.5 text-sm text-muted-foreground">
              <CheckCircle2
                className="absolute left-0 top-2 h-4 w-4 text-emerald-500"
                aria-hidden="true"
              />
              Done
            </div>
          )}
        </div>
      )}
    </section>
  );
}
