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
  Info,
  Loader2,
  PauseCircle,
} from 'lucide-react';
import type { AgentEventToolCategory } from '@agiworkforce/types/protocol';
import type { CloudWorkMode } from '@agiworkforce/types';
import {
  isGenerationProgressEntry,
  isLocalPlaceholderActivityEntry,
  REASONING_PROGRESS_SUMMARY,
  type AgentActivityEntry,
  type AgentActivityState,
  type AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { cn } from '../lib/utils';
import { ToolCallCard, type ToolCallStatus } from './ToolCallCard';
import type { InlineToolKind } from './InlineToolCall';
import {
  readConnectorConnectRequest,
  type ConnectorConnectRequest,
} from '../lib/connector-connect-required';
import {
  agiWorkPlanSentence,
  isAgiWorkGoalEntry,
  isAgiWorkPlanEntry,
} from '../lib/agi-work-progress';
import { ConnectorConnectCard } from './ConnectorConnectCard';

const ACTIVITY_PAGE_SIZE = 40;
const TOKEN_NUMBER_FORMAT = new Intl.NumberFormat('en-US');
const GENERIC_START_LABEL = 'Working';
const GENERIC_START_WINDOW_MS = 1_000;
const LABEL_HOLD_MS = 400;
const SECONDS_PER_MINUTE = 60;
const MIN_REPORTED_DURATION_SECONDS = 1;
const RUN_TICK_INTERVAL_MS = 1_000;
const AGI_WORK_MODE: CloudWorkMode = 'agiwork';
const AGI_WORK_RUNNING_PREFIX = 'Working for';
const AGI_WORK_COMPLETED_PREFIX = 'Worked for';

export interface AgentActivityTimelineProps {
  activity: AgentActivityState;
  /**
   * The mode the turn was sent in. In AGI Work the collapsed line is a live
   * elapsed counter rather than the latest step label, which is what both
   * leaders show for an autonomous run.
   */
  workMode?: CloudWorkMode;
  className?: string;
  defaultExpanded?: boolean;
  onApprove?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;
  onCancel?: (toolCallId: string) => void;
  onResend?: (toolCallId: string) => void;
  isApprovalExpired?: (toolCallId: string) => boolean;
  onRetryTurn?: () => void;
}

export function hasCanonicalToolActivity(
  activity: Pick<AgentActivityState, 'entries'> | undefined,
): boolean {
  return activity?.entries.some((entry) => entry.kind === 'tool') ?? false;
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

const WEB_SEARCH_COMPLETED_SUMMARY = 'Searched the web';
const WEB_SEARCH_CANCELLED_SUMMARY = 'Search stopped';
const WEB_SEARCH_IN_PROGRESS_PREFIX = 'Searching';

function sourceCountLabel(sourceCount: number): string {
  return `${sourceCount} source${sourceCount === 1 ? '' : 's'}`;
}

function webSearchCompletedLabel(sourceCount: number): string {
  return sourceCount > 0
    ? `${WEB_SEARCH_COMPLETED_SUMMARY} · ${sourceCountLabel(sourceCount)}`
    : WEB_SEARCH_COMPLETED_SUMMARY;
}

function finalSummary(activity: AgentActivityState): string | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (!entry || !('summary' in entry) || !entry.summary) continue;
    if (entry.kind === 'tool' && entry.category === 'web-search') {
      if (entry.status === 'cancelled') return WEB_SEARCH_CANCELLED_SUMMARY;
      if (entry.status !== 'failed') {
        if (!entry.summary.startsWith(WEB_SEARCH_IN_PROGRESS_PREFIX)) return entry.summary;
        return webSearchCompletedLabel(entry.sources?.length ?? 0);
      }
    }
    return entry.summary;
  }
  return undefined;
}

function thinkingLabel(startedAtMs: number, nowMs: number): string {
  const elapsedSeconds = Math.max(0, Math.round((nowMs - startedAtMs) / 1000));
  return elapsedSeconds > 0 ? `Thinking · ${elapsedSeconds}s` : 'Thinking';
}

function labelForActivity(activity: AgentActivityState, nowMs: number): string | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (!entry) continue;
    if (
      (entry.kind === 'tool' || entry.kind === 'progress') &&
      (entry.status === 'running' || entry.status === 'awaiting-approval')
    ) {
      if (isLocalPlaceholderActivityEntry(entry)) return undefined;
      if (entry.kind === 'tool' && entry.category === 'web-search') {
        const sourceCount = entry.sources?.length ?? 0;
        if (sourceCount > 0) {
          return `Reading ${sourceCountLabel(sourceCount)}`;
        }
        return entry.summary || 'Searching the web';
      }
      if (isGenerationProgressEntry(entry) && entry.summary === REASONING_PROGRESS_SUMMARY) {
        return thinkingLabel(entry.startedAtMs, nowMs);
      }
      return entry.summary;
    }
  }
  return undefined;
}

function isSearchOnlyRun(entries: readonly AgentActivityEntry[]): boolean {
  const toolEntries = entries.filter(
    (entry): entry is AgentActivityToolEntry => entry.kind === 'tool',
  );
  return toolEntries.length > 0 && toolEntries.every((entry) => entry.category === 'web-search');
}

function totalSearchSources(entries: readonly AgentActivityEntry[]): number {
  return entries.reduce((total, entry) => {
    if (entry.kind !== 'tool' || entry.category !== 'web-search') return total;
    return total + (entry.sources?.length ?? 0);
  }, 0);
}

function formatElapsedDuration(startedAtMs: number, endedAtMs: number): string {
  const totalSeconds = Math.max(
    MIN_REPORTED_DURATION_SECONDS,
    Math.round((endedAtMs - startedAtMs) / 1000),
  );
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatRunDuration(activity: AgentActivityState): string {
  return formatElapsedDuration(
    activity.startedAtMs,
    activity.completedAtMs ?? activity.updatedAtMs,
  );
}

function hasReportableWork(entries: readonly AgentActivityEntry[]): boolean {
  return entries.some((entry) => !isLocalPlaceholderActivityEntry(entry));
}

function collapsedCompletionSummary(activity: AgentActivityState): string {
  if (isSearchOnlyRun(activity.entries)) {
    return webSearchCompletedLabel(totalSearchSources(activity.entries));
  }
  return `${AGI_WORK_COMPLETED_PREFIX} ${formatRunDuration(activity)}`;
}

export function buildAgentActivitySummary(
  activity: AgentActivityState,
  nowMs: number,
  workMode?: CloudWorkMode,
): string {
  const isAgiWork = workMode === AGI_WORK_MODE;
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Needs approval · ${active}` : 'Needs approval';
  }
  if (activity.status === 'paused') return active ?? 'Paused';
  if (activity.status === 'failed') return finalSummary(activity) ?? 'Failed';
  if (activity.status === 'partial') return finalSummary(activity) ?? 'Finished with errors';
  if (activity.status === 'cancelled') return finalSummary(activity) ?? 'Cancelled';
  if (activity.status === 'completed') {
    return isAgiWork
      ? `${AGI_WORK_COMPLETED_PREFIX} ${formatRunDuration(activity)}`
      : collapsedCompletionSummary(activity);
  }
  if (isAgiWork) {
    return `${AGI_WORK_RUNNING_PREFIX} ${formatElapsedDuration(activity.startedAtMs, nowMs)}`;
  }
  const liveLabel = labelForActivity(activity, nowMs);
  const withinGenericWindow = nowMs - activity.startedAtMs < GENERIC_START_WINDOW_MS;
  if (withinGenericWindow || liveLabel === undefined) return GENERIC_START_LABEL;
  return liveLabel;
}

function buildAgentActivityAnnouncement(activity: AgentActivityState, summary: string): string {
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Approval needed: ${active}` : 'Approval needed';
  }
  if (activity.status === 'paused') return 'Agent activity paused';
  if (activity.status === 'failed') return 'Agent activity failed';
  if (activity.status === 'partial') return 'Agent activity finished with errors';
  if (activity.status === 'cancelled') return 'Agent activity cancelled';
  if (activity.status === 'completed') return 'Agent activity completed';
  return `Agent working: ${summary}`;
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

const GENERIC_CONNECTOR_LABELS = new Set(['connector', 'mcp', 'tool', 'action']);

const SUMMARY_VERBS = new Set(['using', 'review']);
const SUMMARY_NOUNS = new Set(['connector', 'tool', 'action']);

// A custom connector's qualified name is an opaque `mcp__custom-<id>__<tool>`, so the
// user's chosen display name only reaches this component inside the server-built summary
// ("Using <Name> connector" / "Review <Name> action" from canonicalToolSummary).
function summaryConnectorInitial(summary: string): string | undefined {
  const words = summary.trim().split(/\s+/);
  if (words.length < 3) return undefined;
  if (!SUMMARY_VERBS.has(words[0]!.toLowerCase())) return undefined;
  if (!SUMMARY_NOUNS.has(words[words.length - 1]!.toLowerCase())) return undefined;
  const label = words.slice(1, -1).join(' ');
  if (GENERIC_CONNECTOR_LABELS.has(label.toLowerCase())) return undefined;
  return label.match(/[\p{L}\p{N}]/u)?.[0]?.toUpperCase();
}

function connectorInitial(entry: AgentActivityToolEntry): string | undefined {
  const fromSummary = summaryConnectorInitial(entry.summary);
  if (fromSummary) return fromSummary;
  if (!/^mcp__/i.test(entry.name)) return undefined;
  const serverId = entry.name.slice('mcp__'.length).split('__')[0];
  if (!serverId || /^custom-/i.test(serverId)) return undefined;
  return serverId[0]?.toUpperCase();
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
      return 'skill';
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

function connectRequestFor(entry: AgentActivityToolEntry): ConnectorConnectRequest | null {
  return readConnectorConnectRequest({
    qualifiedToolName: entry.name,
    result: typeof entry.output === 'string' ? entry.output : undefined,
    isError: entry.status === 'failed',
  });
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
          <p className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{entry.query}</p>
        )}
        <span className="shrink-0 text-[12px] text-muted-foreground">
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
            <span className="shrink-0 text-[12px] text-muted-foreground">
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
          className="touch-manipulation rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
        ) : (
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </span>
      <p className="break-words text-sm text-foreground">{entry.summary}</p>
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
        <p className="text-sm text-foreground">
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
          className="absolute left-0 top-2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="mb-1 text-sm text-foreground">Created a file</p>
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
        <p className="text-sm text-foreground">{entry.summary}</p>
        {entry.beforeTokens !== undefined && entry.afterTokens !== undefined && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {TOKEN_NUMBER_FORMAT.format(entry.beforeTokens)} →{' '}
            {TOKEN_NUMBER_FORMAT.format(entry.afterTokens)} tokens
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative pl-8 py-1.5">
      <AlertCircle className="absolute left-0 top-2 h-4 w-4 text-danger" aria-hidden="true" />
      <p className="break-words text-sm text-danger">{entry.message}</p>
      {entry.retryable && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">Retry available</p>
      )}
    </div>
  );
}

function useGenericStartWindowExpiry(
  startedAtMs: number,
  status: AgentActivityState['status'],
  setNowMs: (nowMs: number) => void,
): void {
  useEffect(() => {
    if (status !== 'running') return;
    const remaining = GENERIC_START_WINDOW_MS - (Date.now() - startedAtMs);
    if (remaining <= 0) return;
    const timer = setTimeout(() => setNowMs(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [startedAtMs, status, setNowMs]);
}

function useHeldRunningSummary(
  turnId: string,
  isRunningPhase: boolean,
  bypassHold: boolean,
  rawSummary: string,
): string {
  const [committed, setCommitted] = useState(rawSummary);
  const committedRef = useRef(rawSummary);
  const turnIdRef = useRef(turnId);

  useEffect(() => {
    const commit = () => {
      committedRef.current = rawSummary;
      setCommitted(rawSummary);
    };
    const turnChanged = turnIdRef.current !== turnId;
    turnIdRef.current = turnId;
    if (turnChanged || !isRunningPhase || bypassHold) {
      commit();
      return;
    }
    if (rawSummary === committedRef.current) return;
    const timer = setTimeout(commit, LABEL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [turnId, rawSummary, isRunningPhase, bypassHold]);

  return isRunningPhase && !bypassHold ? committed : rawSummary;
}

function RunStatusIcon({
  status,
  spinnerless,
}: {
  status: AgentActivityState['status'];
  spinnerless: boolean;
}) {
  if (status === 'running') {
    // An AGI Work run reports progress with the live counter beside this slot;
    // both leaders show no spinner glyph there.
    if (spinnerless) return null;
    return (
      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    );
  }
  if (status === 'paused') return <PauseCircle className="h-4 w-4" aria-hidden="true" />;
  if (status === 'failed' || status === 'cancelled') {
    return <AlertCircle className="h-4 w-4 text-danger" aria-hidden="true" />;
  }
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
  }
  return <BrainCircuit className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

export function AgentActivityTimeline({
  activity,
  workMode,
  className,
  defaultExpanded = false,
  onApprove,
  onReject,
  onCancel,
  onResend,
  isApprovalExpired,
  onRetryTurn,
}: AgentActivityTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [userForcedClosed, setUserForcedClosed] = useState(false);
  const [entryVisibility, setEntryVisibility] = useState(() => ({
    turnId: activity.turnId,
    count: ACTIVITY_PAGE_SIZE,
  }));

  const isAgiWork = workMode === AGI_WORK_MODE;
  const isActive = activity.status === 'running' || activity.status === 'awaiting-approval';
  const isLocalStartingActivity =
    activity.lastSequence === -1 &&
    activity.entries.length === 1 &&
    activity.entries[0]?.kind === 'progress' &&
    activity.entries[0].progressId === 'local-starting';
  const hasConnectRequest = useMemo(
    () => activity.entries.some((e) => e.kind === 'tool' && connectRequestFor(e) !== null),
    [activity.entries],
  );
  const isOpen = userForcedClosed
    ? false
    : (isActive && !isLocalStartingActivity) || hasConnectRequest || expanded;

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
      if (isActive) setUserForcedClosed(true);
      else setExpanded(false);
    } else {
      setUserForcedClosed(false);
      setExpanded(true);
    }
  };

  const isReasoning = activity.entries.some(
    (entry) =>
      isGenerationProgressEntry(entry) &&
      entry.status === 'running' &&
      entry.summary === REASONING_PROGRESS_SUMMARY,
  );
  // The AGI Work counter has to advance every second on its own; a run that
  // emits no events for a minute would otherwise freeze at the last render.
  const ticksLive = isReasoning || (isAgiWork && activity.status === 'running');
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!ticksLive) return;
    const id = setInterval(() => setNowMs(Date.now()), RUN_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [ticksLive]);
  useGenericStartWindowExpiry(activity.startedAtMs, activity.status, setNowMs);

  const rawSummary = useMemo(
    () => buildAgentActivitySummary(activity, nowMs, workMode),
    [activity, nowMs, workMode],
  );
  const summary = useHeldRunningSummary(
    activity.turnId,
    activity.status === 'running',
    ticksLive,
    rawSummary,
  );
  const planSentence = useMemo(
    () => (isAgiWork ? agiWorkPlanSentence(activity.entries) : undefined),
    [isAgiWork, activity.entries],
  );
  const announcement = buildAgentActivityAnnouncement(activity, summary);
  // The first plan step renders as the plan line above the rows, so the row it
  // would otherwise occupy is dropped rather than printed twice. The goal
  // entry's summary is the run's own restatement of the user's prompt, shown
  // in the collapsed summary and the transcript above; a row here would only
  // echo it back.
  const planLineEntryIndex = planSentence ? activity.entries.findIndex(isAgiWorkPlanEntry) : -1;
  const rowEntries = activity.entries.filter(
    (entry, index) => index !== planLineEntryIndex && !isAgiWorkGoalEntry(entry),
  );
  const visibleEntryCount =
    entryVisibility.turnId === activity.turnId ? entryVisibility.count : ACTIVITY_PAGE_SIZE;
  const hiddenEntryCount = Math.max(0, rowEntries.length - visibleEntryCount);
  const visibleEntries = rowEntries.slice(hiddenEntryCount);

  if (activity.status === 'completed' && !hasReportableWork(activity.entries)) return null;

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
        <RunStatusIcon status={activity.status} spinnerless={isAgiWork} />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <ChevronRight
          className={cn(
            'h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none',
            isOpen && 'rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      {planSentence && (
        <p data-testid="agi-work-plan-sentence" className="mb-1 ml-2 text-sm text-foreground">
          {planSentence}
        </p>
      )}

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
              if (entry.unavailable) {
                return (
                  <div key={entry.id} className="relative py-1.5 pl-8">
                    <Info
                      className="absolute left-0 top-2 h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <p className="break-words text-sm text-muted-foreground">{entry.summary}</p>
                  </div>
                );
              }
              const connectRequest = connectRequestFor(entry);
              return (
                <div key={entry.id} className="relative py-1 pl-7">
                  <ToolCallCard
                    id={entry.toolCallId}
                    name={entry.summary}
                    status={toToolStatus(entry)}
                    requiresApproval={entry.status === 'awaiting-approval'}
                    args={asRecord(entry.input)}
                    result={connectRequest ? undefined : asResult(entry.output)}
                    errorDetail={connectRequest ? undefined : entry.error}
                    elapsedMs={entry.elapsedMs}
                    startedAt={entry.status === 'running' ? entry.startedAtMs : undefined}
                    kind={categoryToKind(entry.category)}
                    iconLetter={
                      entry.category === 'connector' || entry.category === 'mcp'
                        ? connectorInitial(entry)
                        : undefined
                    }
                    expired={isApprovalExpired?.(entry.toolCallId) ?? false}
                    onApprove={onApprove}
                    onReject={onReject}
                    onCancel={onCancel}
                    onResend={onResend}
                    footer={entry.sources ? <SourceLinks entry={entry} /> : undefined}
                  />
                  {connectRequest ? (
                    <div className="mt-1.5">
                      <ConnectorConnectCard
                        request={connectRequest}
                        {...(onRetryTurn ? { onRetryTurn } : {})}
                      />
                    </div>
                  ) : null}
                </div>
              );
            }
            return <StaticRow key={entry.id} entry={entry} />;
          })}
          {activity.status === 'completed' && (
            <div className="relative pl-8 py-1.5 text-sm text-muted-foreground">
              <CheckCircle2
                className="absolute left-0 top-2 h-4 w-4 text-muted-foreground"
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
