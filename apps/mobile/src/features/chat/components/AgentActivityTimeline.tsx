import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { useRecyclingState } from '@shopify/flash-list';
import {
  AlertCircle,
  Ban,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock,
  Database,
  ExternalLink,
  FilePen,
  FilePlus2,
  FileText,
  Folder,
  Globe,
  Image as ImageIcon,
  Info,
  Monitor,
  MousePointerClick,
  PauseCircle,
  Plug,
  Search,
  ShieldAlert,
  Square,
  Terminal,
} from 'lucide-react-native';
import type {
  AgentActivityArtifactEntry,
  AgentActivityEntry,
  AgentActivityState,
  AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import {
  TOOL_STATUS_PRESENTATION,
  detectFileDiff,
  detectResultDiff,
  normalizeToolStatus,
} from '@agiworkforce/types';
import {
  TOOL_APPROVAL_SCOPE_DECISIONS,
  type ToolApprovalDecisionValue,
} from '@agiworkforce/cloud-contracts';
import {
  connectRequestFor,
  connectorFailureReason,
  connectorSentence,
  settledActivityStatus,
} from '@agiworkforce/unified-chat/activity-status';
import { humanizeToolErrorText } from '@agiworkforce/unified-chat/tool-failure';
import {
  SCREEN_STEP_ACTIONS,
  categoryToKind,
  type InlineToolKind,
} from '@agiworkforce/unified-chat/activity-kinds';
import { Text } from '@/components/ui/Text';
import { AgiMark } from '@/components/ui/AgiMark';
import { ShimmerText } from '@/components/ui/ShimmerText';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { toolStatusColor } from '@/src/features/chat/utils/toolStatusTone';
import { WebSearchResultCard } from './WebSearchResultCard';
import { ToolDetailActions } from './ToolDetailActions';
import { lucideRNToolIcon } from './toolIconRN';
import {
  CloudToolApprovalControls,
  type AllowCloudToolForChat,
  type AlwaysAllowCloudTool,
  type CloudToolApprovalDecision,
  type ResolveCloudToolApproval,
} from './CloudToolApprovalControls';
import { ToolCodeCard } from './ToolCodeCard';
import { TOOL_MONOSPACE, ToolFileDiffBlock } from './ToolFileDiffBlock';
import {
  canRunCodeAgain,
  executedToolCode,
  parseToolArguments,
} from '@/src/features/chat/utils/executedToolCode';
import { toolCallApprovalReview } from '@/src/features/chat/utils/toolApprovalReview';
import { connectorStepFailureSentence } from '@/src/features/chat/utils/connectorConnectSentences';
import { formatToolDetailText } from '@/src/features/chat/utils/toolDetailText';
import {
  createdFileArtifact,
  createdFileDownloadUrl,
  downloadAndShareCreatedFile,
} from '@/src/features/chat/utils/createdFileLink';
import type { Artifact, ToolCall } from '@/types/chat';
import { RunSteerInput } from './RunSteerInput';
import { CodeRunAgain } from './CodeRunAgain';
import {
  CodeExecutionPlotImage,
  finishedCodeStepId,
  type CodeExecutionPlotFile,
} from './CodeExecutionPlots';
import { ChatToolGrantControl } from './ChatToolGrantControl';
import { isChatGrantableTool } from '../services/chatToolGrants';
import { translatePlural } from '@/src/i18n/plural';
import { isInAppBrowsableUrl, openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import {
  DECLINED_STEP_LABEL,
  activityEndedByDecline,
  declinedActivitySummary,
  declinedToolLabel,
  isDeclinedToolStep,
  withoutDeclineCausedErrors,
} from '@/src/features/chat/utils/declinedToolSteps';

const ACTIVITY_PAGE_SIZE = 20;

export interface AgentActivityTimelineProps {
  messageId: string;
  activity: AgentActivityState;
  defaultExpanded?: boolean;
  nowMs?: number;
  onResolveApproval?: ResolveCloudToolApproval;
  onAllowApprovalForChat?: AllowCloudToolForChat;
  onAlwaysAllowApproval?: AlwaysAllowCloudTool;
  approvalToolCalls?: readonly ToolCall[];
  approvalExpired?: boolean;
  onResendApproval?: () => void;
  onRetry?: () => void;
  statusLabel?: string;
  statusUnavailable?: boolean;
  steerRunId?: string;
  codeRunConversationId?: string;
  reasoning?: ReactNode;
  artifacts?: readonly Artifact[];
  onOpenArtifact?: (artifact: Artifact) => void;
  codePlots?: readonly CodeExecutionPlotFile[];
}

function canonicalApprovalDecision(
  decision: NonNullable<AgentActivityToolEntry['approval']>['decision'],
): CloudToolApprovalDecision | undefined {
  if (decision === 'approved' || decision === 'approved-for-session') return 'approved';
  if (decision === 'denied') return 'rejected';
  return undefined;
}

function canonicalApprovalScope(
  decision: NonNullable<AgentActivityToolEntry['approval']>['decision'],
): ToolApprovalDecisionValue | undefined {
  return decision === 'approved-for-session' ? decision : undefined;
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

function askedToolName(
  entry: AgentActivityToolEntry,
  approvalTool: ToolCall | undefined,
): string | undefined {
  if (entry.status !== 'awaiting-approval') return undefined;
  const name = approvalTool?.name;
  return name && name !== entry.name ? name : undefined;
}

function latestActiveSummary(
  activity: AgentActivityState,
  approvalToolCalls?: readonly ToolCall[],
): string | undefined {
  for (let index = activity.entries.length - 1; index >= 0; index -= 1) {
    const entry = activity.entries[index];
    if (
      entry &&
      (entry.kind === 'tool' || entry.kind === 'progress') &&
      (entry.status === 'running' || entry.status === 'awaiting-approval')
    ) {
      const asked =
        entry.kind === 'tool'
          ? askedToolName(
              entry,
              approvalToolCalls?.find((tool) => tool.toolCallId === entry.toolCallId),
            )
          : undefined;
      if (asked) return declinedToolLabel(asked);
      return connectorSentence(entry) ?? entry.summary;
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

export function buildAgentActivitySummary(
  activity: AgentActivityState,
  nowMs: number,
  approvalToolCalls?: readonly ToolCall[],
): string {
  const active = latestActiveSummary(activity, approvalToolCalls);
  const status = settledActivityStatus(activity);
  if (status === 'awaiting-approval') {
    return active ? `Needs approval · ${active}` : 'Needs approval';
  }
  if (status === 'awaiting-device') {
    const entry = awaitingDeviceEntry(activity);
    const device = entry?.deviceStep?.deviceName ?? 'your device';
    return entry?.summary ? `Waiting for ${device} · ${entry.summary}` : `Waiting for ${device}`;
  }
  const elapsed = formatDuration(
    Math.max(0, (activity.completedAtMs ?? activity.updatedAtMs ?? nowMs) - activity.startedAtMs),
  );
  if (status === 'paused') return `Paused after ${elapsed}`;
  if (status === 'failed') return `Failed after ${elapsed}`;
  if (status === 'partial') return `Finished with errors after ${elapsed}`;
  if (status === 'cancelled') return `Stopped after ${elapsed}`;
  if (status === 'completed') {
    const completed = completedSummary(activity);
    return `Worked for ${elapsed}${completed ? ` · ${completed}` : ''}`;
  }
  const label = active ?? 'Working…';
  if (status !== 'running') return label;
  const liveSeconds = Math.max(0, Math.round((nowMs - activity.startedAtMs) / 1000));
  return liveSeconds > 0 ? `${label} · ${liveSeconds}s` : label;
}

const ICON_BY_KIND: Partial<Record<InlineToolKind, typeof Terminal>> = {
  bash: Terminal,
  read: FileText,
  write: FilePlus2,
  edit: FilePen,
  'web-search': Search,
  'web-fetch': Globe,
  'fs-list': Folder,
  'image-gen': ImageIcon,
  browser: MousePointerClick,
  'mcp-custom': Plug,
  skill: BookOpen,
  thinking: Brain,
  done: CircleCheck,
};

export function activityToolIcon(entry: Pick<AgentActivityToolEntry, 'name' | 'category'>) {
  const kind = entry.category ? categoryToKind(entry.category) : undefined;
  return (kind && ICON_BY_KIND[kind]) || lucideRNToolIcon(entry.name);
}

export function screenStepAction(entry: AgentActivityToolEntry): string | null {
  if (entry.category !== 'computer-use') return null;
  const describe = SCREEN_STEP_ACTIONS[entry.name];
  if (!describe) return null;
  const input =
    entry.input && typeof entry.input === 'object' && !Array.isArray(entry.input)
      ? (entry.input as Record<string, unknown>)
      : {};
  return describe(input);
}

const TOOL_DETAIL_HEADING_ROW = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 4,
} as const;

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
  onAlwaysAllowApproval,
  approvalTool,
  approvalExpired,
  onResendApproval,
  codeRunConversationId,
  plots = [],
}: {
  entry: AgentActivityToolEntry;
  expanded: boolean;
  onToggle: () => void;
  onResolveApproval?: AgentActivityTimelineProps['onResolveApproval'];
  onAllowApprovalForChat?: AgentActivityTimelineProps['onAllowApprovalForChat'];
  onAlwaysAllowApproval?: AgentActivityTimelineProps['onAlwaysAllowApproval'];
  approvalTool?: ToolCall;
  approvalExpired: boolean;
  codeRunConversationId?: string;
  onResendApproval?: () => void;
  plots?: readonly CodeExecutionPlotFile[];
}) {
  const colors = useThemeColors();
  const ToolIcon = activityToolIcon(entry);
  const screenAction = screenStepAction(entry);
  const declined = isDeclinedToolStep(entry, approvalTool ? [approvalTool] : undefined);
  const awaitingDecision = entry.status === 'awaiting-approval';
  const requestedTool = awaitingDecision ? approvalTool : undefined;
  const requestName = askedToolName(entry, approvalTool) ?? entry.name;
  const requestInput = parseToolArguments(requestedTool?.input) ?? entry.input;
  const rawInput = asDisplayText(requestInput);
  const input = rawInput === undefined ? undefined : formatToolDetailText(rawInput);
  const rawOutput = declined || awaitingDecision ? undefined : asDisplayText(entry.output);
  const connectorFailure = declined
    ? null
    : connectorStepFailureSentence({
        toolName: entry.name,
        failed: entry.status === 'failed',
        texts: [rawOutput, entry.error],
      });
  const output =
    connectorFailure || rawOutput === undefined ? undefined : formatToolDetailText(rawOutput);
  const code = executedToolCode(requestName, requestInput);
  const shownError = code || !entry.error ? entry.error : humanizeToolErrorText(entry.error);
  const error = declined || awaitingDecision ? undefined : (connectorFailure ?? shownError);
  const failureReason =
    declined || connectorFailure
      ? undefined
      : connectorFailureReason(entry, connectRequestFor(entry));
  const hasDetails = Boolean(input || output || error || entry.sources?.length || plots.length > 0);
  const awaitingDevice = entry.status === 'awaiting-device';
  const toolStatus = normalizeToolStatus(entry.status);
  const statusColor = declined
    ? colors.textMuted
    : awaitingDevice
      ? colors.agentWarning
      : toolStatusColor(toolStatus, colors);
  const title =
    declined || requestName !== entry.name
      ? declinedToolLabel(requestName)
      : (connectorSentence(entry) ?? entry.summary);
  const toolArgs = parseToolArguments(requestInput);
  const requestDiff = code ? null : detectFileDiff(toolArgs);
  const resultDiff = detectResultDiff(output, toolArgs);
  const canRunAgain =
    codeRunConversationId !== undefined &&
    code !== undefined &&
    canRunCodeAgain(entry.name) &&
    TOOL_STATUS_PRESENTATION[toolStatus].terminal &&
    !declined;
  const approvalDecision =
    approvalTool?.approvalDecision ?? canonicalApprovalDecision(entry.approval?.decision);
  const approvalScope = approvalTool?.approvalDecision
    ? approvalTool.approvalScope
    : canonicalApprovalScope(entry.approval?.decision);
  const allowedForChat =
    codeRunConversationId !== undefined &&
    entry.status !== 'awaiting-approval' &&
    approvalDecision === 'approved' &&
    approvalScope === TOOL_APPROVAL_SCOPE_DECISIONS.session &&
    isChatGrantableTool(entry.name);
  const statusLabel = declined
    ? DECLINED_STEP_LABEL
    : awaitingDevice
      ? `Waiting for ${entry.deviceStep?.deviceName ?? 'your device'}`
      : TOOL_STATUS_PRESENTATION[toolStatus].label;

  return (
    <View style={{ paddingVertical: 6 }}>
      <PressableBox
        onPress={hasDetails ? onToggle : undefined}
        disabled={!hasDetails}
        accessibilityRole={hasDetails ? 'button' : undefined}
        accessibilityLabel={`${title}, ${statusLabel}`}
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
                {title}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                {statusLabel}
                {entry.elapsedMs !== undefined && !declined
                  ? ` · ${formatDuration(entry.elapsedMs)}`
                  : ''}
              </Text>
              {screenAction ? (
                <View
                  testID="agent-activity.screen-step"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
                >
                  <MousePointerClick size={12} color={colors.textSecondary} />
                  <Text
                    style={{
                      flexShrink: 1,
                      color: colors.textSecondary,
                      fontSize: typeScale.caption,
                    }}
                  >
                    {entry.deviceStep?.deviceName
                      ? `${screenAction} on ${entry.deviceStep.deviceName}`
                      : screenAction}
                  </Text>
                </View>
              ) : null}
              {failureReason ? (
                <Text
                  testID="agent-activity.failure-reason"
                  style={{ color: colors.agentError, fontSize: typeScale.caption }}
                >
                  {failureReason}
                </Text>
              ) : null}
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
              toolName={requestName}
              summary={requestName === entry.name ? entry.summary : title}
              args={toolArgs}
              riskLevel={entry.approval?.riskLevel ?? approvalTool?.approvalRiskLevel}
              review={approvalTool ? toolCallApprovalReview(approvalTool) : undefined}
              decision={approvalDecision}
              approvalScope={approvalScope}
              guidance={approvalTool?.approvalGuidance}
              onResolve={onResolveApproval}
              onAllowForChat={onAllowApprovalForChat}
              onAlwaysAllow={onAlwaysAllowApproval}
            />
          )}
        </View>
      ) : null}

      {allowedForChat && codeRunConversationId ? (
        <View style={{ marginLeft: 25 }}>
          <ChatToolGrantControl
            key={entry.toolCallId}
            conversationId={codeRunConversationId}
            toolName={entry.name}
          />
        </View>
      ) : null}

      {canRunAgain && code ? (
        <View style={{ marginLeft: 25 }}>
          <CodeRunAgain
            conversationId={codeRunConversationId}
            language={code.language}
            code={code.code}
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
              <View style={TOOL_DETAIL_HEADING_ROW}>
                <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                  {code ? 'Code' : 'Request'}
                </Text>
                {code ? null : (
                  <ToolDetailActions text={input} part="request" testID="tool-request-actions" />
                )}
              </View>
              {code ? (
                <ToolCodeCard language={code.language} code={code.code} />
              ) : requestDiff ? (
                <ToolFileDiffBlock diff={requestDiff} />
              ) : (
                <Text
                  style={{
                    color: colors.textSecondary,
                    fontFamily: TOOL_MONOSPACE,
                    fontSize: typeScale.caption,
                  }}
                >
                  {input}
                </Text>
              )}
            </View>
          ) : null}
          {output ? (
            <View style={{ backgroundColor: colors.surfaceBase, borderRadius: 8, padding: 9 }}>
              <View style={TOOL_DETAIL_HEADING_ROW}>
                <Text style={{ color: colors.textMuted, fontSize: typeScale.caption }}>
                  {code ? 'Output' : 'Result'}
                </Text>
                <ToolDetailActions
                  text={output}
                  part={code ? 'output' : 'result'}
                  testID="tool-result-actions"
                />
              </View>
              {resultDiff ? (
                <ToolFileDiffBlock diff={resultDiff} testID="tool-result-diff" />
              ) : (
                <Text
                  selectable
                  style={{
                    color: colors.textSecondary,
                    fontFamily: TOOL_MONOSPACE,
                    fontSize: typeScale.caption,
                  }}
                >
                  {output}
                </Text>
              )}
            </View>
          ) : null}
          {plots.map((plot, index) => (
            <CodeExecutionPlotImage key={plot.artifactId} plot={plot} index={index} />
          ))}
          {error && code ? (
            <View
              testID="tool-code-error"
              style={{ backgroundColor: colors.surfaceBase, borderRadius: 8, padding: 9 }}
            >
              <Text
                accessibilityRole="header"
                style={{ color: colors.textMuted, fontSize: typeScale.caption, marginBottom: 4 }}
              >
                Error
              </Text>
              <Text
                selectable
                style={{
                  color: colors.agentError,
                  fontFamily: TOOL_MONOSPACE,
                  fontSize: typeScale.caption,
                }}
              >
                {error}
              </Text>
            </View>
          ) : error ? (
            <Text style={{ color: colors.agentError, fontSize: typeScale.caption }}>{error}</Text>
          ) : null}
          {entry.sources?.length ? (
            <ActivitySourceList listKey={entry.id} sources={entry.sources} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const COLLAPSED_SOURCE_COUNT = 5;

function ActivitySourceList({
  listKey,
  sources,
}: {
  listKey: string;
  sources: NonNullable<AgentActivityToolEntry['sources']>;
}) {
  const colors = useThemeColors();
  const [showAll, setShowAll] = useRecyclingState(false, [listKey]);
  const hidden = sources.length - COLLAPSED_SOURCE_COUNT;
  const visible = showAll ? sources : sources.slice(0, COLLAPSED_SOURCE_COUNT);
  const moreLabel = translatePlural('chat', 'counts.moreSources', hidden, {
    one: '+{{count}} more source',
    other: '+{{count}} more sources',
  });
  const showMoreLabel = translatePlural('chat', 'counts.showMoreSources', hidden, {
    one: 'Show {{count}} more source',
    other: 'Show {{count}} more sources',
  });
  return (
    <>
      {visible.map((source, index) => (
        <WebSearchResultCard key={`${source.url}:${index}`} result={source} />
      ))}
      {hidden > 0 ? (
        <PressableBox
          testID="agent-activity.more-sources"
          onPress={() => setShowAll((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={showAll ? 'Show fewer sources' : showMoreLabel}
          accessibilityState={{ expanded: showAll }}
          style={{
            alignSelf: 'flex-start',
            minHeight: 44,
            minWidth: 44,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.textSecondary, fontSize: typeScale.caption }}>
            {showAll ? 'Show fewer' : moreLabel}
          </Text>
        </PressableBox>
      ) : null}
    </>
  );
}

function ProgressRow({
  entry,
  statusUnavailable,
}: {
  entry: Extract<AgentActivityEntry, { kind: 'progress' }>;
  statusUnavailable: boolean;
}) {
  const colors = useThemeColors();
  const progressStatus = normalizeToolStatus(entry.status);
  const statusColor =
    progressStatus === 'succeeded' ? colors.textMuted : toolStatusColor(progressStatus, colors);
  const terminal = TOOL_STATUS_PRESENTATION[progressStatus].terminal;
  const Icon = progressStatus === 'succeeded' ? Clock : AlertCircle;

  return (
    <View
      style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}
      accessible
      accessibilityLabel={`${entry.summary}, ${TOOL_STATUS_PRESENTATION[progressStatus].label}${
        entry.detail ? `, ${entry.detail}` : ''
      }`}
    >
      {terminal ? (
        <Icon size={16} color={statusColor} />
      ) : statusUnavailable ? (
        <CircleHelp size={16} color={colors.textMuted} />
      ) : (
        <AgiMark size={16} spinning />
      )}
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

function withoutRepeatedUnavailableNotices(
  entries: readonly AgentActivityEntry[],
): AgentActivityEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (entry.kind !== 'tool' || !entry.unavailable) return true;
    if (seen.has(entry.summary)) return false;
    seen.add(entry.summary);
    return true;
  });
}

function UnavailableToolRow({ entry }: { entry: AgentActivityToolEntry }) {
  const colors = useThemeColors();
  return (
    <View
      testID="agent-activity.unavailable"
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 6 }}
    >
      <Info size={16} color={colors.textMuted} />
      <Text style={{ flex: 1, color: colors.textMuted, fontSize: typeScale.footnote }}>
        {entry.summary}
      </Text>
    </View>
  );
}

function CreatedFileRow({
  entry,
  artifacts,
  onOpenArtifact,
}: {
  entry: AgentActivityArtifactEntry;
  artifacts: readonly Artifact[];
  onOpenArtifact?: (artifact: Artifact) => void;
}) {
  const colors = useThemeColors();
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);
  const artifact = onOpenArtifact ? createdFileArtifact(entry, artifacts) : undefined;
  const downloadUrl = artifact ? null : createdFileDownloadUrl(entry.uri);
  const browsable = !artifact && !downloadUrl && isInAppBrowsableUrl(entry.uri);
  const openable = Boolean(artifact || downloadUrl || browsable);

  const open = () => {
    if (artifact) {
      onOpenArtifact?.(artifact);
    } else if (downloadUrl) {
      if (downloadingRef.current) return;
      downloadingRef.current = true;
      setDownloading(true);
      void downloadAndShareCreatedFile(downloadUrl, entry.name).finally(() => {
        downloadingRef.current = false;
        setDownloading(false);
      });
    } else {
      void openUntrustedUrlInAppBrowser(entry.uri);
    }
  };

  const body = (
    <View style={{ flexDirection: 'row', gap: 9, paddingVertical: 6 }}>
      <FileText size={16} color={colors.agentSuccess} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: typeScale.footnote }}>
          Created a file
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, color: colors.textSecondary, fontSize: typeScale.caption }}
          >
            {entry.name}
          </Text>
          {browsable ? <ExternalLink size={12} color={colors.textSecondary} /> : null}
          {artifact || downloadUrl ? <ChevronRight size={12} color={colors.textSecondary} /> : null}
        </View>
      </View>
    </View>
  );
  if (!openable) return body;
  return (
    <PressableBox
      testID="agent-activity.artifact-link"
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel={`Open ${entry.name}`}
      accessibilityState={{ busy: downloading }}
      style={{ minHeight: 44, justifyContent: 'center', opacity: downloading ? 0.6 : 1 }}
    >
      {body}
    </PressableBox>
  );
}

function StaticRow({
  entry,
  onRetry,
}: {
  entry: Exclude<AgentActivityEntry, { kind: 'tool' | 'progress' | 'artifact' }>;
  onRetry?: () => void;
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
          <ActivitySourceList listKey={entry.id} sources={entry.sources} />
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
        {entry.retryable && onRetry ? (
          <PressableBox
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            testID="agent-activity.retry"
            style={{
              alignSelf: 'flex-start',
              minHeight: 44,
              minWidth: 44,
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.caption, fontWeight: '600' }}
            >
              Retry
            </Text>
          </PressableBox>
        ) : null}
      </View>
    </View>
  );
}

function RunStatusIcon({
  status,
  declined,
}: {
  status: AgentActivityState['status'];
  declined: boolean;
}) {
  const colors = useThemeColors();
  if (declined) return <Ban size={16} color={colors.textMuted} />;
  if (status === 'running') return <AgiMark size={16} spinning />;
  if (status === 'paused') return <PauseCircle size={16} color={colors.textMuted} />;
  if (status === 'completed') return <CheckCircle2 size={16} color={colors.agentSuccess} />;
  if (status === 'awaiting-approval') return <ShieldAlert size={16} color={colors.agentWarning} />;
  if (status === 'awaiting-device') return <Monitor size={16} color={colors.agentWarning} />;
  if (status === 'partial') return <AlertCircle size={16} color={colors.agentWarning} />;
  if (status === 'cancelled') return <Square size={16} color={colors.textMuted} />;
  return <AlertCircle size={16} color={colors.agentError} />;
}

export function AgentActivityTimeline({
  messageId,
  activity,
  defaultExpanded = false,
  nowMs,
  onResolveApproval,
  onAllowApprovalForChat,
  onAlwaysAllowApproval,
  approvalToolCalls,
  approvalExpired = false,
  onResendApproval,
  onRetry,
  statusLabel,
  statusUnavailable = false,
  steerRunId,
  codeRunConversationId,
  reasoning,
  artifacts = [],
  onOpenArtifact,
  codePlots = [],
}: AgentActivityTimelineProps) {
  const colors = useThemeColors();
  // A running turn rests as one line, as it does in ChatGPT and Claude
  // (founder, 2026-11-14). Only a step that waits on the person opens by
  // itself, because the control they must answer is inside.
  const settledStatus = settledActivityStatus(activity);
  const needsAnswer = settledStatus === 'awaiting-approval' || settledStatus === 'awaiting-device';
  const [expanded, setExpanded] = useRecyclingState(defaultExpanded || needsAnswer, [
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
    setExpanded(defaultExpanded || needsAnswer);
  }, [activity.turnId, defaultExpanded, needsAnswer, messageId, setExpanded]);

  useEffect(() => {
    if (userExpansionRef.current !== null) return;
    setExpanded(defaultExpanded || needsAnswer);
  }, [settledStatus, defaultExpanded, needsAnswer, setExpanded]);

  const builtSummary = useMemo(
    () => buildAgentActivitySummary(activity, nowMs ?? activity.updatedAtMs, approvalToolCalls),
    [activity, nowMs, approvalToolCalls],
  );
  const endedByDecline = useMemo(
    () => activityEndedByDecline(activity, approvalToolCalls),
    [activity, approvalToolCalls],
  );
  const summary =
    settledStatus === 'running' && statusLabel
      ? statusLabel
      : endedByDecline
        ? declinedActivitySummary(activity, approvalToolCalls)
        : builtSummary;
  const entries = useMemo(
    () =>
      withoutRepeatedUnavailableNotices(withoutDeclineCausedErrors(activity, approvalToolCalls)),
    [activity, approvalToolCalls],
  );
  const plotStepId = useMemo(
    () => (codePlots.length > 0 ? finishedCodeStepId(activity) : undefined),
    [activity, codePlots.length],
  );
  const runningWithoutStatus = settledStatus === 'running' && statusUnavailable;
  const hiddenCount = Math.max(0, entries.length - visibleCount);
  const visibleEntries = entries.slice(hiddenCount);

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
            {runningWithoutStatus ? (
              <CircleHelp size={16} color={colors.textMuted} />
            ) : (
              <RunStatusIcon status={settledStatus} declined={endedByDecline} />
            )}
            {runningWithoutStatus ? (
              <Text
                testID="agent-activity.status-unavailable"
                numberOfLines={1}
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: colors.textMuted,
                  fontSize: typeScale.footnote,
                }}
              >
                {summary}
              </Text>
            ) : settledStatus === 'running' ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <ShimmerText
                  testID="agent-activity.running-label"
                  text={summary}
                  baseColor={colors.textMuted}
                  shineColor={colors.textPrimary}
                  style={{ fontSize: typeScale.footnote }}
                />
              </View>
            ) : (
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
            )}
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
          {reasoning}

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
            if (entry.kind === 'progress') {
              return (
                <ProgressRow key={entry.id} entry={entry} statusUnavailable={statusUnavailable} />
              );
            }
            if (entry.kind === 'tool') {
              if (entry.unavailable) return <UnavailableToolRow key={entry.id} entry={entry} />;
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
                  onAlwaysAllowApproval={onAlwaysAllowApproval}
                  approvalTool={approvalToolCalls?.find(
                    (tool) => tool.toolCallId === entry.toolCallId,
                  )}
                  approvalExpired={approvalExpired}
                  onResendApproval={onResendApproval}
                  codeRunConversationId={codeRunConversationId}
                  {...(entry.id === plotStepId ? { plots: codePlots } : {})}
                />
              );
            }
            if (entry.kind === 'artifact') {
              return (
                <CreatedFileRow
                  key={entry.id}
                  entry={entry}
                  artifacts={artifacts}
                  {...(onOpenArtifact ? { onOpenArtifact } : {})}
                />
              );
            }
            return <StaticRow key={entry.id} entry={entry} onRetry={onRetry} />;
          })}

          {steerRunId && settledStatus === 'running' ? <RunSteerInput runId={steerRunId} /> : null}

          {settledStatus === 'completed' ? (
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
