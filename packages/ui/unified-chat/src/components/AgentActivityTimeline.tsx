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
import {
  readConnectorConnectRequest,
  type ConnectorConnectRequest,
} from '../lib/connector-connect-required';
import { ConnectorConnectCard } from './ConnectorConnectCard';

const ACTIVITY_PAGE_SIZE = 40;
const TOKEN_NUMBER_FORMAT = new Intl.NumberFormat('en-US');

export interface AgentActivityTimelineProps {
  activity: AgentActivityState;
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

function finalSummary(activity: AgentActivityState): string | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (entry && 'summary' in entry && entry.summary) return entry.summary;
  }
  return undefined;
}

function labelForActivity(activity: AgentActivityState): string | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (!entry) continue;
    if (
      (entry.kind === 'tool' || entry.kind === 'progress') &&
      (entry.status === 'running' || entry.status === 'awaiting-approval')
    ) {
      if (entry.kind === 'tool' && entry.category === 'web-search') {
        const sourceCount = entry.sources?.length ?? 0;
        if (sourceCount > 0) {
          return `Reading ${sourceCount} source${sourceCount === 1 ? '' : 's'}`;
        }
        return entry.summary || 'Searching the web';
      }
      return entry.summary;
    }
  }
  return undefined;
}

export function buildAgentActivitySummary(activity: AgentActivityState): string {
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Needs approval · ${active}` : 'Needs approval';
  }
  if (activity.status === 'paused') return active ?? 'Paused';
  if (activity.status === 'failed') return finalSummary(activity) ?? 'Failed';
  if (activity.status === 'partial') return finalSummary(activity) ?? 'Finished with errors';
  if (activity.status === 'cancelled') return finalSummary(activity) ?? 'Cancelled';
  if (activity.status === 'completed') return finalSummary(activity) ?? 'Done';
  return labelForActivity(activity) ?? 'Working…';
}

function buildAgentActivityAnnouncement(activity: AgentActivityState): string {
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Approval needed: ${active}` : 'Approval needed';
  }
  if (activity.status === 'paused') return 'Agent activity paused';
  if (activity.status === 'failed') return 'Agent activity failed';
  if (activity.status === 'partial') return 'Agent activity finished with errors';
  if (activity.status === 'cancelled') return 'Agent activity cancelled';
  if (activity.status === 'completed') return 'Agent activity completed';
  const running = labelForActivity(activity);
  return running ? `Agent working: ${running}` : 'Agent working';
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
          className="absolute left-0 top-2 h-4 w-4 text-muted-foreground"
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

function RunStatusIcon({ status }: { status: AgentActivityState['status'] }) {
  if (status === 'running') {
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

  const summary = useMemo(() => buildAgentActivitySummary(activity), [activity]);
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
                    error={
                      connectRequest || entry.error === entry.summary ? undefined : entry.error
                    }
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
