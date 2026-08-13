import { useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useRecyclingState } from '@shopify/flash-list';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FileText,
  Globe,
  Loader2,
  PauseCircle,
  ShieldAlert,
} from 'lucide-react-native';
import type {
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { WebSearchResultCard } from './WebSearchResultCard';
import { lucideRNToolIcon } from './toolIconRN';

const ACTIVITY_PAGE_SIZE = 20;

export interface AgentActivityTimelineProps {
  messageId: string;
  activity: AgentActivityState;
  defaultExpanded?: boolean;
  /** Deterministic clock injection for tests and static previews. */
  nowMs?: number;
  onResolveApproval?: (toolCallId: string, decision: 'approved' | 'rejected') => void;
  approvalExpired?: boolean;
  onResendApproval?: () => void;
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

function latestActiveSummary(activity: AgentActivityState): string | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (
      entry &&
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
  const files = activity.entries.filter((entry) => entry.kind === 'artifact').length;
  const parts: string[] = [];
  if (tools > 0) parts.push(`${tools} tool${tools === 1 ? '' : 's'}`);
  if (files > 0) parts.push(`${files} file${files === 1 ? '' : 's'} created`);
  if (parts.length === 0 && activity.entries.length > 0) {
    parts.push(`${activity.entries.length} step${activity.entries.length === 1 ? '' : 's'}`);
  }
  return parts.join(' · ');
}

export function buildAgentActivitySummary(activity: AgentActivityState, nowMs: number): string {
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Needs approval · ${active}` : 'Needs approval';
  }
  // Active work stays semantic and stable (no one-second render timer). Once a
  // run settles, however, elapsed time is fixed useful output — the latest
  // mobile reference presents it as “Worked for 5m 24s”. Prefer the canonical
  // terminal timestamp, then the last event time, and only use the injected
  // clock for a malformed legacy state with neither.
  const elapsed = formatDuration(
    Math.max(0, (activity.completedAtMs ?? activity.updatedAtMs ?? nowMs) - activity.startedAtMs),
  );
  if (activity.status === 'paused') return `Paused after ${elapsed}`;
  if (activity.status === 'failed') return `Failed after ${elapsed}`;
  if (activity.status === 'cancelled') return `Cancelled after ${elapsed}`;
  if (activity.status === 'completed') {
    const completed = completedSummary(activity);
    return `Worked for ${elapsed}${completed ? ` · ${completed}` : ''}`;
  }
  return active ?? 'Working…';
}

function asDisplayText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ToolRow({
  entry,
  expanded,
  onToggle,
  onResolveApproval,
  approvalExpired,
  onResendApproval,
}: {
  entry: AgentActivityToolEntry;
  expanded: boolean;
  onToggle: () => void;
  onResolveApproval?: AgentActivityTimelineProps['onResolveApproval'];
  approvalExpired: boolean;
  onResendApproval?: () => void;
}) {
  const colors = useThemeColors();
  const ToolIcon = lucideRNToolIcon(entry.name);
  const input = asDisplayText(entry.input);
  const output = asDisplayText(entry.output);
  const hasDetails = Boolean(input || output || entry.error || entry.sources?.length);
  const statusColor =
    entry.status === 'failed' || entry.status === 'cancelled'
      ? colors.agentError
      : entry.status === 'completed'
        ? colors.agentSuccess
        : entry.status === 'awaiting-approval'
          ? colors.agentWarning
          : colors.agentActive;

  return (
    <View style={{ paddingVertical: 6 }}>
      <Pressable
        onPress={hasDetails ? onToggle : undefined}
        disabled={!hasDetails}
        accessibilityRole={hasDetails ? 'button' : undefined}
        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} details for ${entry.summary}`}
        accessibilityState={hasDetails ? { expanded } : undefined}
      >
        {({ pressed }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              paddingVertical: 3,
              paddingHorizontal: 2,
              borderRadius: 7,
              backgroundColor: pressed ? colors.surfaceHover : 'transparent',
            }}
          >
            <ToolIcon size={16} color={statusColor} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 13 }} numberOfLines={2}>
                {entry.summary}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>
                {entry.status === 'awaiting-approval'
                  ? 'Approval required'
                  : entry.status === 'running'
                    ? 'Running'
                    : entry.status}
                {entry.elapsedMs !== undefined ? ` · ${formatDuration(entry.elapsedMs)}` : ''}
              </Text>
            </View>
            {hasDetails ? (
              expanded ? (
                <ChevronDown size={14} color={colors.textMuted} />
              ) : (
                <ChevronRight size={14} color={colors.textMuted} />
              )
            ) : null}
          </View>
        )}
      </Pressable>

      {entry.status === 'awaiting-approval' ? (
        <View style={{ marginLeft: 25, marginTop: 7, gap: 7 }}>
          {approvalExpired ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.agentWarning, fontSize: 12 }}>Approval expired</Text>
              {onResendApproval ? (
                <Pressable
                  onPress={onResendApproval}
                  accessibilityRole="button"
                  accessibilityLabel={`Resend ${entry.summary}`}
                >
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.warningBorder,
                    }}
                  >
                    <Text style={{ color: colors.agentWarning, fontSize: 12, fontWeight: '600' }}>
                      Resend
                    </Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => onResolveApproval?.(entry.toolCallId, 'approved')}
                disabled={!onResolveApproval}
                accessibilityRole="button"
                accessibilityLabel={`Allow ${entry.summary}`}
              >
                <View
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: colors.agentSuccess,
                    opacity: onResolveApproval ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: colors.white, fontSize: 12, fontWeight: '600' }}>
                    Allow
                  </Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => onResolveApproval?.(entry.toolCallId, 'rejected')}
                disabled={!onResolveApproval}
                accessibilityRole="button"
                accessibilityLabel={`Deny ${entry.summary}`}
              >
                <View
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: onResolveApproval ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
                    Deny
                  </Text>
                </View>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {expanded ? (
        <View style={{ marginLeft: 25, marginTop: 6, gap: 8 }}>
          {entry.query ? (
            <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{entry.query}</Text>
          ) : null}
          {input ? (
            <View style={{ backgroundColor: colors.surfaceBase, borderRadius: 8, padding: 9 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 4 }}>
                Request
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{input}</Text>
            </View>
          ) : null}
          {output ? (
            <View style={{ backgroundColor: colors.surfaceBase, borderRadius: 8, padding: 9 }}>
              <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 4 }}>Result</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{output}</Text>
            </View>
          ) : null}
          {entry.error ? (
            <Text style={{ color: colors.agentError, fontSize: 11 }}>{entry.error}</Text>
          ) : null}
          {entry.sources?.slice(0, 5).map((source, index) => (
            <WebSearchResultCard key={`${source.url}:${index}`} result={source} />
          ))}
          {(entry.sources?.length ?? 0) > 5 ? (
            <Text selectable style={{ color: colors.textMuted, fontSize: 11 }}>
              +{entry.sources!.length - 5} more sources
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ProgressRow({ entry }: { entry: Extract<AgentActivityEntry, { kind: 'progress' }> }) {
  const colors = useThemeColors();
  const statusColor =
    entry.status === 'failed' || entry.status === 'cancelled'
      ? colors.agentError
      : entry.status === 'completed'
        ? colors.textMuted
        : colors.agentActive;
  const Icon =
    entry.status === 'running' ? Loader2 : entry.status === 'completed' ? Clock : AlertCircle;

  return (
    <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}>
      <Icon size={16} color={statusColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{entry.summary}</Text>
        {entry.detail ? (
          <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2 }}>
            {entry.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function StaticRow({
  entry,
}: {
  entry: Exclude<AgentActivityEntry, { kind: 'tool' | 'progress' }>;
}) {
  const colors = useThemeColors();
  if (entry.kind === 'sources') {
    return (
      <View style={{ paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <Globe size={16} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, fontSize: 13 }}>
            Found {entry.sources.length} source{entry.sources.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={{ marginLeft: 25 }}>
          {entry.query ? (
            <Text style={{ color: colors.textSecondary, fontSize: 11, marginBottom: 4 }}>
              {entry.query}
            </Text>
          ) : null}
          {entry.sources.slice(0, 5).map((source, index) => (
            <WebSearchResultCard key={`${source.url}:${index}`} result={source} />
          ))}
          {entry.sources.length > 5 ? (
            <Text selectable style={{ color: colors.textMuted, fontSize: 11, paddingTop: 4 }}>
              +{entry.sources.length - 5} more sources
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  if (entry.kind === 'artifact') {
    return (
      <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}>
        <FileText size={16} color={colors.agentSuccess} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 13 }}>Created a file</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 11 }}>{entry.name}</Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'context') {
    return (
      <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}>
        <Database size={16} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{entry.summary}</Text>
          {entry.beforeTokens !== undefined && entry.afterTokens !== undefined ? (
            <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>
              {entry.beforeTokens.toLocaleString()} → {entry.afterTokens.toLocaleString()} tokens
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}>
      <AlertCircle size={16} color={colors.agentError} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.agentError, fontSize: 13 }}>{entry.message}</Text>
        {entry.retryable ? (
          <Text style={{ color: colors.textMuted, fontSize: 10.5 }}>Retry available</Text>
        ) : null}
      </View>
    </View>
  );
}

function RunStatusIcon({ status }: { status: AgentActivityState['status'] }) {
  const colors = useThemeColors();
  if (status === 'running') return <Loader2 size={16} color={colors.agentActive} />;
  if (status === 'paused') return <PauseCircle size={16} color={colors.textMuted} />;
  if (status === 'completed') return <CheckCircle2 size={16} color={colors.agentSuccess} />;
  if (status === 'awaiting-approval') return <ShieldAlert size={16} color={colors.agentWarning} />;
  return <AlertCircle size={16} color={colors.agentError} />;
}

export function AgentActivityTimeline({
  messageId,
  activity,
  defaultExpanded = false,
  nowMs,
  onResolveApproval,
  approvalExpired = false,
  onResendApproval,
}: AgentActivityTimelineProps) {
  const colors = useThemeColors();
  const isActive = activity.status === 'running' || activity.status === 'awaiting-approval';
  const [expanded, setExpanded] = useRecyclingState(defaultExpanded || isActive, [
    messageId,
    activity.turnId,
  ]);
  const [visibleCount, setVisibleCount] = useRecyclingState(ACTIVITY_PAGE_SIZE, [
    messageId,
    activity.turnId,
  ]);
  const [expandedToolId, setExpandedToolId] = useRecyclingState<string | null>(null, [
    messageId,
    activity.turnId,
  ]);
  const userExpansionRef = useRef<'expanded' | 'collapsed' | null>(null);

  useEffect(() => {
    userExpansionRef.current = null;
    setExpanded(defaultExpanded || isActive);
  }, [activity.turnId, defaultExpanded, isActive, messageId, setExpanded]);

  useEffect(() => {
    if (userExpansionRef.current !== null) return;
    setExpanded(defaultExpanded || isActive);
  }, [activity.status, defaultExpanded, isActive, setExpanded]);

  const summary = useMemo(
    () => buildAgentActivitySummary(activity, nowMs ?? activity.updatedAtMs),
    [activity, nowMs],
  );
  const hiddenCount = Math.max(0, activity.entries.length - visibleCount);
  const visibleEntries = activity.entries.slice(hiddenCount);

  if (activity.entries.length === 0 && activity.status === 'completed') return null;

  return (
    <View accessibilityLabel="Agent activity" style={{ width: '100%', marginBottom: 7 }}>
      <Pressable
        onPress={() =>
          setExpanded((value) => {
            userExpansionRef.current = value ? 'collapsed' : 'expanded';
            return !value;
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Hide' : 'Show'} agent activity: ${summary}`}
        accessibilityState={{ expanded }}
      >
        {({ pressed }) => (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              minHeight: 34,
              paddingVertical: 7,
              paddingHorizontal: 2,
              borderRadius: 8,
              backgroundColor: pressed ? colors.surfaceHover : 'transparent',
            }}
          >
            <RunStatusIcon status={activity.status} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, minWidth: 0, color: colors.textSecondary, fontSize: 13 }}
            >
              {summary}
            </Text>
            {expanded ? (
              <ChevronDown size={15} color={colors.textMuted} />
            ) : (
              <ChevronRight size={15} color={colors.textMuted} />
            )}
          </View>
        )}
      </Pressable>

      {expanded ? (
        <View
          style={{
            marginLeft: 8,
            paddingLeft: 14,
            borderLeftWidth: 1,
            borderLeftColor: colors.border,
          }}
        >
          {hiddenCount > 0 ? (
            <Pressable
              onPress={() => setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${Math.min(ACTIVITY_PAGE_SIZE, hiddenCount)} earlier steps`}
            >
              <View style={{ paddingVertical: 7, paddingLeft: 25 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>
                  Show {Math.min(ACTIVITY_PAGE_SIZE, hiddenCount)} earlier steps
                </Text>
              </View>
            </Pressable>
          ) : null}

          {visibleEntries.map((entry) => {
            if (entry.kind === 'progress') return <ProgressRow key={entry.id} entry={entry} />;
            if (entry.kind === 'tool') {
              return (
                <ToolRow
                  key={entry.id}
                  entry={entry}
                  expanded={expandedToolId === entry.id}
                  onToggle={() =>
                    setExpandedToolId((current) => (current === entry.id ? null : entry.id))
                  }
                  onResolveApproval={onResolveApproval}
                  approvalExpired={approvalExpired}
                  onResendApproval={onResendApproval}
                />
              );
            }
            return <StaticRow key={entry.id} entry={entry} />;
          })}

          {activity.status === 'completed' ? (
            <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 7 }}>
              <CheckCircle2 size={16} color={colors.agentSuccess} />
              <Text style={{ color: colors.textPrimary, fontSize: 13 }}>Done</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
