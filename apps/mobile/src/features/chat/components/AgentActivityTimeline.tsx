import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
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
  Monitor,
  PauseCircle,
  ShieldAlert,
} from 'lucide-react-native';
import type {
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { TOOL_STATUS_PRESENTATION, normalizeToolStatus } from '@agiworkforce/types';
import { CHAT_CODE_RUN_TOOL_NAME } from '@agiworkforce/cloud-contracts';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toolStatusColor } from '@/src/features/chat/utils/toolStatusTone';
import { WebSearchResultCard } from './WebSearchResultCard';
import { lucideRNToolIcon } from './toolIconRN';
import {
  CloudToolApprovalControls,
  parseToolArguments,
  type AllowCloudToolForChat,
  type ResolveCloudToolApproval,
} from './CloudToolApprovalControls';
import { RunSteerInput } from './RunSteerInput';
import { CodeRunAgain } from './CodeRunAgain';
import { translatePlural } from '@/src/i18n/plural';

const ACTIVITY_PAGE_SIZE = 20;

export interface AgentActivityTimelineProps {
  messageId: string;
  activity: AgentActivityState;
  defaultExpanded?: boolean;
  nowMs?: number;
  onResolveApproval?: ResolveCloudToolApproval;
  onAllowApprovalForChat?: AllowCloudToolForChat;
  approvalExpired?: boolean;
  onResendApproval?: () => void;
  steerRunId?: string;
  codeRunConversationId?: string;
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

function awaitingDeviceEntry(activity: AgentActivityState): AgentActivityToolEntry | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (entry?.kind === 'tool' && entry.status === 'awaiting-device') return entry;
  }
  return undefined;
}

function completedSummary(activity: AgentActivityState): string {
  const tools = activity.entries.filter((entry) => entry.kind === 'tool').length;
  const files = activity.entries.filter((entry) => entry.kind === 'artifact').length;
  const parts: string[] = [];
  if (tools > 0) {
    parts.push(
      translatePlural('chat', 'counts.tools', tools, {
        one: '{{count}} tool',
        other: '{{count}} tools',
      }),
    );
  }
  if (files > 0) {
    parts.push(
      translatePlural('chat', 'counts.filesCreated', files, {
        one: '{{count}} file created',
        other: '{{count}} files created',
      }),
    );
  }
  if (parts.length === 0 && activity.entries.length > 0) {
    parts.push(
      translatePlural('chat', 'counts.steps', activity.entries.length, {
        one: '{{count}} step',
        other: '{{count}} steps',
      }),
    );
  }
  return parts.join(' · ');
}

export function buildAgentActivitySummary(activity: AgentActivityState, nowMs: number): string {
  const active = latestActiveSummary(activity);
  if (activity.status === 'awaiting-approval') {
    return active ? `Needs approval · ${active}` : 'Needs approval';
  }
  if (activity.status === 'awaiting-device') {
    const entry = awaitingDeviceEntry(activity);
    const device = entry?.deviceStep?.deviceName ?? 'your device';
    return entry?.summary ? `Waiting for ${device} · ${entry.summary}` : `Waiting for ${device}`;
  }
  const elapsed = formatDuration(
    Math.max(0, (activity.completedAtMs ?? activity.updatedAtMs ?? nowMs) - activity.startedAtMs),
  );
  if (activity.status === 'paused') return `Paused after ${elapsed}`;
  if (activity.status === 'failed') return `Failed after ${elapsed}`;
  if (activity.status === 'partial') return `Finished with errors after ${elapsed}`;
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
  onAllowApprovalForChat,
  approvalExpired,
  onResendApproval,
  codeRunConversationId,
}: {
  entry: AgentActivityToolEntry;
  expanded: boolean;
  onToggle: () => void;
  onResolveApproval?: AgentActivityTimelineProps['onResolveApproval'];
  onAllowApprovalForChat?: AgentActivityTimelineProps['onAllowApprovalForChat'];
  approvalExpired: boolean;
  codeRunConversationId?: string;
  onResendApproval?: () => void;
}) {
  const colors = useThemeColors();
  const ToolIcon = lucideRNToolIcon(entry.name);
  const input = asDisplayText(entry.input);
  const output = asDisplayText(entry.output);
  const hasDetails = Boolean(input || output || entry.error || entry.sources?.length);
  const awaitingDevice = entry.status === 'awaiting-device';
  const toolStatus = normalizeToolStatus(entry.status);
  const statusColor = awaitingDevice ? colors.agentWarning : toolStatusColor(toolStatus, colors);
  const rerunArgs =
    entry.name === CHAT_CODE_RUN_TOOL_NAME ? parseToolArguments(entry.input) : undefined;
  const rerunCode = typeof rerunArgs?.['code'] === 'string' ? rerunArgs['code'] : '';
  const rerunLanguage =
    typeof rerunArgs?.['language'] === 'string' ? rerunArgs['language'] : 'python';
  const canRunAgain =
    codeRunConversationId !== undefined &&
    rerunCode.trim() !== '' &&
    TOOL_STATUS_PRESENTATION[toolStatus].terminal;
  const statusLabel = awaitingDevice
    ? `Waiting for ${entry.deviceStep?.deviceName ?? 'your device'}`
    : TOOL_STATUS_PRESENTATION[toolStatus].label;

  return (
    <View style={{ paddingVertical: 6 }}>
      <PressableBox
        onPress={hasDetails ? onToggle : undefined}
        disabled={!hasDetails}
        accessibilityRole={hasDetails ? 'button' : undefined}
        accessibilityLabel={`${entry.summary}, ${statusLabel}`}
        accessibilityHint={
          hasDetails ? `${expanded ? 'Hides' : 'Shows'} the details of this step` : undefined
        }
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
              <Text
                style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}
                numberOfLines={2}
              >
                {entry.summary}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                {statusLabel}
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
      </PressableBox>

      {entry.status === 'awaiting-approval' ? (
        <View style={{ marginLeft: 25, marginTop: 7, gap: 7 }}>
          {approvalExpired ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.agentWarning, fontSize: typeScale.caption }}>
                Approval expired
              </Text>
              {onResendApproval ? (
                <PressableBox
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
                    <Text
                      style={{
                        color: colors.agentWarning,
                        fontSize: typeScale.caption,
                        fontWeight: '600',
                      }}
                    >
                      Resend
                    </Text>
                  </View>
                </PressableBox>
              ) : null}
            </View>
          ) : (
            <CloudToolApprovalControls
              toolCallId={entry.toolCallId}
              toolName={entry.name}
              summary={entry.summary}
              args={parseToolArguments(entry.input)}
              riskLevel={entry.approval?.riskLevel}
              onResolve={onResolveApproval}
              onAllowForChat={onAllowApprovalForChat}
            />
          )}
        </View>
      ) : null}

      {canRunAgain ? (
        <View style={{ marginLeft: 25 }}>
          <CodeRunAgain
            conversationId={codeRunConversationId}
            language={rerunLanguage}
            code={rerunCode}
          />
        </View>
      ) : null}

      {expanded ? (
        <View style={{ marginLeft: 25, marginTop: 6, gap: 8 }}>
          {entry.query ? (
            <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
              {entry.query}
            </Text>
          ) : null}
          {input ? (
            <View style={{ backgroundColor: colors.surfaceBase, borderRadius: 8, padding: 9 }}>
              <Text
                style={{ color: colors.textMuted, fontSize: typeScale.caption, marginBottom: 4 }}
              >
                Request
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
                {input}
              </Text>
            </View>
          ) : null}
          {output ? (
            <View style={{ backgroundColor: colors.surfaceBase, borderRadius: 8, padding: 9 }}>
              <Text
                style={{ color: colors.textMuted, fontSize: typeScale.caption, marginBottom: 4 }}
              >
                Result
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
                {output}
              </Text>
            </View>
          ) : null}
          {entry.error ? (
            <Text style={{ color: colors.agentError, fontSize: typeScale.caption }}>
              {entry.error}
            </Text>
          ) : null}
          {entry.sources?.slice(0, 5).map((source, index) => (
            <WebSearchResultCard key={`${source.url}:${index}`} result={source} />
          ))}
          {(entry.sources?.length ?? 0) > 5 ? (
            <Text selectable style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
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
  const progressStatus = normalizeToolStatus(entry.status);
  const statusColor =
    progressStatus === 'succeeded' ? colors.textMuted : toolStatusColor(progressStatus, colors);
  const Icon = TOOL_STATUS_PRESENTATION[progressStatus].terminal
    ? progressStatus === 'succeeded'
      ? Clock
      : AlertCircle
    : Loader2;

  return (
    <View
      style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}
      accessible
      accessibilityLabel={`${entry.summary}, ${TOOL_STATUS_PRESENTATION[progressStatus].label}${
        entry.detail ? `, ${entry.detail}` : ''
      }`}
    >
      <Icon size={16} color={statusColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
          {entry.summary}
        </Text>
        {entry.detail ? (
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption, marginTop: 2 }}>
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
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
            {translatePlural('chat', 'counts.foundSources', entry.sources.length, {
              one: 'Found {{count}} source',
              other: 'Found {{count}} sources',
            })}
          </Text>
        </View>
        <View style={{ marginLeft: 25 }}>
          {entry.query ? (
            <Text
              style={{ color: colors.textSecondary, fontSize: typeScale.caption, marginBottom: 4 }}
            >
              {entry.query}
            </Text>
          ) : null}
          {entry.sources.slice(0, 5).map((source, index) => (
            <WebSearchResultCard key={`${source.url}:${index}`} result={source} />
          ))}
          {entry.sources.length > 5 ? (
            <Text
              selectable
              style={{ color: colors.textMuted, fontSize: typeScale.caption, paddingTop: 4 }}
            >
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
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
            Created a file
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
            {entry.name}
          </Text>
        </View>
      </View>
    );
  }

  if (entry.kind === 'context') {
    return (
      <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}>
        <Database size={16} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
            {entry.summary}
          </Text>
          {entry.beforeTokens !== undefined && entry.afterTokens !== undefined ? (
            <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
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
        <Text style={{ color: colors.agentError, fontSize: typeScale.footnote }}>
          {entry.message}
        </Text>
        {entry.retryable ? (
          <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
            Retry available
          </Text>
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
  if (status === 'awaiting-device') return <Monitor size={16} color={colors.agentWarning} />;
  if (status === 'partial') return <AlertCircle size={16} color={colors.agentWarning} />;
  return <AlertCircle size={16} color={colors.agentError} />;
}

export function AgentActivityTimeline({
  messageId,
  activity,
  defaultExpanded = false,
  nowMs,
  onResolveApproval,
  onAllowApprovalForChat,
  approvalExpired = false,
  onResendApproval,
  steerRunId,
  codeRunConversationId,
}: AgentActivityTimelineProps) {
  const colors = useThemeColors();
  const isActive =
    activity.status === 'running' ||
    activity.status === 'awaiting-approval' ||
    activity.status === 'awaiting-device';
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
      <PressableBox
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
              style={{
                flex: 1,
                minWidth: 0,
                color: colors.textSecondary,
                fontSize: typeScale.footnote,
              }}
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
      </PressableBox>

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
            <PressableBox
              onPress={() => setVisibleCount((count) => count + ACTIVITY_PAGE_SIZE)}
              accessibilityRole="button"
              accessibilityLabel={`Show ${Math.min(ACTIVITY_PAGE_SIZE, hiddenCount)} earlier steps`}
            >
              <View style={{ paddingVertical: 7, paddingLeft: 25 }}>
                <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                  Show {Math.min(ACTIVITY_PAGE_SIZE, hiddenCount)} earlier steps
                </Text>
              </View>
            </PressableBox>
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
                  onAllowApprovalForChat={onAllowApprovalForChat}
                  approvalExpired={approvalExpired}
                  onResendApproval={onResendApproval}
                  codeRunConversationId={codeRunConversationId}
                />
              );
            }
            return <StaticRow key={entry.id} entry={entry} />;
          })}

          {steerRunId && activity.status === 'running' ? (
            <RunSteerInput runId={steerRunId} />
          ) : null}

          {activity.status === 'completed' ? (
            <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 7 }}>
              <CheckCircle2 size={16} color={colors.agentSuccess} />
              <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>Done</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
