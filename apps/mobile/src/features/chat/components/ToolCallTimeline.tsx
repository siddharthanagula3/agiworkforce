import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import { View, Modal, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  Clock,
  AlertCircle,
  Loader2,
  Maximize2,
  ShieldAlert,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { lucideRNToolIcon, lucideRNIconByName } from './toolIconRN';
import { WebSearchResultCard } from './WebSearchResultCard';
import { WebSearchToolCard, isWebSearchTool } from './WebSearchToolCard';
import {
  CloudToolApprovalControls,
  cloudToolApprovalPreview,
  parseToolArguments,
  type AllowCloudToolForChat,
  type ResolveCloudToolApproval,
} from './CloudToolApprovalControls';
import { toolStatusColor } from '@/src/features/chat/utils/toolStatusTone';
import {
  getToolDisplayLabel,
  getToolSourceBadge,
  getFileExtensionIconName,
  isTerminalToolStatus,
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_STATUS_PRESENTATION,
} from '@agiworkforce/types';
import type { ToolStatus } from '@agiworkforce/types';
import type { ToolCall } from '@/types/chat';
import { translatePlural } from '@/src/i18n/plural';

const STATUS_GLYPH: Record<Exclude<ToolStatus, 'succeeded'>, typeof CircleCheck> = {
  pending: Clock,
  'awaiting-approval': ShieldAlert,
  running: Loader2,
  partial: CircleDashed,
  canceled: CircleSlash,
  failed: AlertCircle,
};

function effectiveStatus(tool: ToolCall): ToolStatus {
  return tool.requiresApproval && !isTerminalToolStatus(tool.status)
    ? 'awaiting-approval'
    : tool.status;
}

const OUTCOME_PRECEDENCE: readonly ToolStatus[] = ['failed', 'partial', 'canceled', 'succeeded'];

function groupOutcome(toolCalls: ToolCall[]): ToolStatus {
  const statuses = new Set(toolCalls.map((t) => t.status));
  return OUTCOME_PRECEDENCE.find((s) => statuses.has(s)) ?? 'succeeded';
}

function TimelineConnector({
  tone,
  showTop,
  showBottom,
}: {
  tone: string;
  showTop: boolean;
  showBottom: boolean;
}) {
  return (
    <View style={{ width: 20, alignItems: 'center' }}>
      <View
        style={{ flex: 1, width: 1, backgroundColor: showTop ? tone : 'transparent', minHeight: 4 }}
      />
      <View
        style={{
          flex: 1,
          width: 1,
          backgroundColor: showBottom ? tone : 'transparent',
          minHeight: 4,
        }}
      />
    </View>
  );
}

function ToolRowIcon({ tool }: { tool: ToolCall }) {
  const colors = useThemeColors();
  const sourceBadge = getToolSourceBadge(tool.name);
  const status = effectiveStatus(tool);

  if (status !== 'succeeded') {
    const Glyph = STATUS_GLYPH[status];
    const tone = toolStatusColor(status, colors);
    return <Glyph size={15} strokeWidth={1.75} color={tone} />;
  }

  if (sourceBadge) {
    return (
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceOverlay,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text
          style={{ fontSize: typeScale.caption, fontWeight: '700', color: colors.textSecondary }}
        >
          {sourceBadge}
        </Text>
      </View>
    );
  }

  const Icon = tool.filePath
    ? lucideRNIconByName(getFileExtensionIconName(tool.filePath))
    : lucideRNToolIcon(tool.name);
  return <Icon size={15} strokeWidth={1.75} color={colors.textSecondary} />;
}

function trailingChipLabel(tool: ToolCall): string | null {
  const status = effectiveStatus(tool);
  const { label } = TOOL_STATUS_PRESENTATION[status];
  if (status === 'awaiting-approval' || status === 'pending') return label;
  if (status !== 'succeeded' && status !== 'running') {
    return tool.duration !== undefined ? `${label} · ${formatToolDuration(tool.duration)}` : label;
  }
  if (tool.duration !== undefined) return formatToolDuration(tool.duration);
  if (tool.searchResults?.length) {
    return translatePlural('common', 'counts.results', tool.searchResults.length, {
      one: '{{count}} result',
      other: '{{count}} results',
    });
  }
  if (tool.command) return 'Script';
  if (tool.filePath) {
    const base = tool.filePath.split('/').pop();
    return base ?? tool.filePath;
  }
  if (tool.output || tool.input) return 'Result';
  return null;
}

function formatToolDuration(durationMs: number): string {
  const safeMs = Math.max(0, durationMs);
  if (safeMs < 1_000) return `${Math.round(safeMs)}ms`;
  const seconds = safeMs / 1_000;
  return `${seconds.toFixed(seconds >= 10 || Number.isInteger(seconds) ? 0 : 1)}s`;
}

function ToolCallTimelineRow({
  tool,
  isFirst,
  isLast,
  onOpenFullScreen,
  onResolveApproval,
  onAllowApprovalForChat,
  approvalExpired,
  onResendApproval,
}: {
  tool: ToolCall;
  isFirst: boolean;
  isLast: boolean;
  onOpenFullScreen: (tool: ToolCall) => void;
  onResolveApproval?: ResolveCloudToolApproval;
  onAllowApprovalForChat?: AllowCloudToolForChat;
  approvalExpired?: boolean;
  onResendApproval?: () => void;
}) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const label = getToolDisplayLabel(tool.name);
  const status = effectiveStatus(tool);
  const nameText =
    status === 'running'
      ? label.activeForm
      : status === 'succeeded'
        ? label.completedForm
        : label.displayName;
  const chip = trailingChipLabel(tool);
  const hasBody = Boolean(
    tool.searchResults?.length ||
    tool.input ||
    tool.output ||
    tool.command ||
    tool.stderr ||
    tool.exitCode !== undefined,
  );
  const isSearch = isWebSearchTool(tool.name);
  const highRiskApproval =
    tool.approvalRiskLevel === 'high' && !approvalExpired && !tool.approvalDecision;
  const approvalArgs = tool.requiresApproval ? parseToolArguments(tool.input) : undefined;
  const approvalPreview = cloudToolApprovalPreview(tool.name, approvalArgs);
  const showRawApprovalInput =
    Boolean(tool.input) && approvalPreview.stakes.length === 0 && !approvalPreview.diff;
  const statusLabel = TOOL_STATUS_PRESENTATION[status].label;
  const statusTone = TOOL_STATUS_PRESENTATION[status].tone;
  const spokenStatus = chip?.startsWith(statusLabel)
    ? chip
    : `${statusLabel}${chip ? `, ${chip}` : ''}`;

  const toggle = useCallback(() => {
    if (hasBody) setExpanded((prev) => !prev);
  }, [hasBody]);

  return (
    <View>
      <PressableBox
        onPress={toggle}
        disabled={!hasBody}
        accessibilityRole={hasBody ? 'button' : 'text'}
        accessibilityLabel={`${nameText}, ${spokenStatus.toLowerCase()}`}
        accessibilityHint={hasBody ? 'Double tap to expand details' : undefined}
        style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: 30 }}
      >
        <TimelineConnector
          tone={colors.borderLight}
          showTop={!isFirst}
          showBottom={!isLast || expanded}
        />
        <View
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingVertical: 5,
          }}
        >
          <ToolRowIcon tool={tool} />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: typeScale.footnote,
              color: statusTone === 'error' ? colors.agentError : colors.textSecondary,
            }}
          >
            {nameText}
          </Text>
          {chip ? (
            <View
              style={{
                borderRadius: 6,
                backgroundColor: colors.surfaceOverlay,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: typeScale.caption, color: colors.textMuted, maxWidth: 160 }}
              >
                {chip}
              </Text>
            </View>
          ) : null}
          {hasBody ? (
            expanded ? (
              <ChevronDown size={13} color={colors.textMuted} />
            ) : (
              <ChevronRight size={13} color={colors.textMuted} />
            )
          ) : null}
        </View>
      </PressableBox>

      {isSearch ? <WebSearchToolCard tool={tool} showSources={!expanded} /> : null}

      {tool.requiresApproval && tool.toolCallId ? (
        <View style={{ paddingLeft: 20, paddingBottom: 10 }}>
          <View
            style={{
              backgroundColor: approvalExpired
                ? colors.surfaceOverlay
                : highRiskApproval
                  ? colors.dangerSurface
                  : colors.warningSurface,
              borderRadius: 8,
              borderWidth: highRiskApproval ? 1 : 0,
              borderColor: highRiskApproval ? colors.dangerBorder : 'transparent',
              padding: 10,
              gap: 8,
            }}
          >
            {approvalExpired ? (
              <>
                <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
                  This approval request expired or is no longer active.{' '}
                  {onResendApproval
                    ? 'Send a new message to try again.'
                    : 'Send a new message to continue.'}
                </Text>
                {onResendApproval ? (
                  <PressableBox
                    onPress={onResendApproval}
                    accessibilityRole="button"
                    accessibilityLabel="Resend"
                    style={{
                      alignSelf: 'flex-start',
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      backgroundColor: colors.surfaceOverlay,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typeScale.footnote,
                        fontWeight: '600',
                        color: colors.textSecondary,
                      }}
                    >
                      Resend
                    </Text>
                  </PressableBox>
                ) : null}
              </>
            ) : (
              <>
                <Text style={{ fontSize: typeScale.caption, color: colors.textPrimary }}>
                  {tool.approvalDecision
                    ? `Decision saved: ${
                        tool.approvalDecision === 'approved'
                          ? TOOL_APPROVAL_ACTION_LABELS.allowed
                          : TOOL_APPROVAL_ACTION_LABELS.denied
                      }`
                    : `${nameText} wants to run. Review the request before allowing it to proceed.`}
                </Text>
                {showRawApprovalInput ? (
                  <Text
                    numberOfLines={4}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: typeScale.caption,
                      color: colors.textSecondary,
                    }}
                  >
                    {tool.input}
                  </Text>
                ) : null}
                <CloudToolApprovalControls
                  toolCallId={tool.toolCallId}
                  toolName={tool.name}
                  summary={nameText}
                  args={approvalArgs}
                  riskLevel={tool.approvalRiskLevel}
                  decision={tool.approvalDecision}
                  guidance={tool.approvalGuidance}
                  onResolve={onResolveApproval}
                  onAllowForChat={onAllowApprovalForChat}
                />
              </>
            )}
          </View>
        </View>
      ) : null}

      {expanded ? (
        <View style={{ paddingLeft: 20, paddingBottom: 8 }}>
          {tool.searchResults?.length ? (
            <View style={{ gap: 2 }}>
              {tool.searchResults.map((r, i) => (
                <WebSearchResultCard key={`${tool.id}-r${i}`} result={r} />
              ))}
            </View>
          ) : (
            <View
              style={{
                backgroundColor: colors.surfaceOverlay,
                borderRadius: 8,
                padding: 10,
                gap: 8,
              }}
            >
              {tool.command || tool.input ? (
                <View>
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      fontWeight: '600',
                      color: colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    {executedCode(tool) === undefined ? 'Request' : 'Code'}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'monospace',
                      fontSize: typeScale.caption,
                      color: colors.textPrimary,
                    }}
                  >
                    {tool.command ?? executedCode(tool) ?? tool.input}
                  </Text>
                </View>
              ) : null}
              {tool.output ? (
                <View>
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      fontWeight: '600',
                      color: colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    {executedCode(tool) === undefined ? 'Response' : 'Output'}
                  </Text>
                  <Text
                    numberOfLines={12}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: typeScale.caption,
                      color: colors.textPrimary,
                    }}
                  >
                    {tool.output}
                  </Text>
                </View>
              ) : null}
              <ExecutionErrorOutput tool={tool} fontSize={11.5} numberOfLines={12} />
              {needsFullScreen(tool) ? (
                <PressableBox
                  onPress={() => onOpenFullScreen(tool)}
                  accessibilityRole="button"
                  accessibilityLabel={`View full output for ${nameText}`}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 }}
                >
                  <Maximize2 size={11} color={colors.textMuted} />
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      fontWeight: '600',
                      color: colors.textSecondary,
                    }}
                  >
                    View full output
                  </Text>
                </PressableBox>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const FULLSCREEN_OUTPUT_THRESHOLD = 600;

const CODE_EXECUTION_TOOLS: ReadonlySet<string> = new Set([
  'code_execution',
  'execute_code',
  'code_interpreter',
]);

function executedCode(tool: ToolCall): string | undefined {
  if (!CODE_EXECUTION_TOOLS.has(tool.name) || !tool.input) return undefined;
  try {
    const parsed = JSON.parse(tool.input) as { code?: unknown };
    return typeof parsed.code === 'string' && parsed.code.trim() !== '' ? parsed.code : undefined;
  } catch {
    return undefined;
  }
}

function needsFullScreen(tool: ToolCall): boolean {
  const size =
    (tool.output?.length ?? 0) +
    (tool.stderr?.length ?? 0) +
    (tool.command?.length ?? tool.input?.length ?? 0);
  return (
    size > FULLSCREEN_OUTPUT_THRESHOLD ||
    (tool.output?.split('\n').length ?? 0) > 12 ||
    (tool.stderr?.split('\n').length ?? 0) > 12
  );
}

function ExecutionErrorOutput({
  tool,
  fontSize,
  numberOfLines,
}: {
  tool: ToolCall;
  fontSize: number;
  numberOfLines?: number;
}) {
  const colors = useThemeColors();
  if (!tool.stderr && tool.exitCode === undefined) return null;
  return (
    <View style={{ gap: 6 }}>
      {tool.stderr ? (
        <View>
          <Text
            style={{
              fontSize: fontSize - 1.5,
              fontWeight: '600',
              color: colors.agentError,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            Stderr
          </Text>
          <Text
            selectable={numberOfLines === undefined}
            numberOfLines={numberOfLines}
            style={{ fontFamily: 'monospace', fontSize, color: colors.agentError }}
          >
            {tool.stderr}
          </Text>
        </View>
      ) : null}
      {tool.exitCode !== undefined ? (
        <Text
          style={{
            fontSize: fontSize - 0.5,
            fontWeight: '600',
            color: tool.exitCode === 0 ? colors.agentSuccess : colors.agentError,
          }}
        >
          Exit code {tool.exitCode}
        </Text>
      ) : null}
    </View>
  );
}

export function ToolCallDetailsSheet({
  tool,
  onClose,
}: {
  tool: ToolCall | null;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  if (!tool) return null;
  const label = getToolDisplayLabel(tool.name);
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, backgroundColor: colors.surfaceBase }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: typeScale.callout,
              fontWeight: '600',
              color: colors.textPrimary,
            }}
          >
            {label.displayName}
          </Text>
          <PressableBox
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close tool details"
            hitSlop={10}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceOverlay,
            }}
          >
            <X size={16} color={colors.textSecondary} />
          </PressableBox>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {tool.searchResults?.length ? (
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {tool.searchResults.length === 1
                  ? '1 source'
                  : `${tool.searchResults.length} sources`}
              </Text>
              <View style={{ gap: 4 }}>
                {tool.searchResults.map((result, index) => (
                  <WebSearchResultCard key={`${tool.id}-sheet-${index}`} result={result} />
                ))}
              </View>
            </View>
          ) : null}
          {tool.command || tool.input ? (
            <View>
              <Text
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Request
              </Text>
              <Text
                selectable
                style={{
                  fontFamily: 'monospace',
                  fontSize: typeScale.caption,
                  color: colors.textPrimary,
                }}
              >
                {tool.command ?? tool.input}
              </Text>
            </View>
          ) : null}
          {tool.output && !tool.searchResults?.length ? (
            <View>
              <Text
                style={{
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                  color: colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 6,
                }}
              >
                Response
              </Text>
              <Text
                selectable
                style={{
                  fontFamily: 'monospace',
                  fontSize: typeScale.caption,
                  color: colors.textPrimary,
                }}
              >
                {tool.output}
              </Text>
            </View>
          ) : null}
          <ExecutionErrorOutput tool={tool} fontSize={12.5} />
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ToolCallTimeline({
  messageId,
  toolCalls,
  summary,
  onResolveApproval,
  onAllowApprovalForChat,
  approvalExpired,
  onResendApproval,
}: {
  messageId: string;
  toolCalls: ToolCall[];
  summary: string;
  onResolveApproval?: ResolveCloudToolApproval;
  onAllowApprovalForChat?: AllowCloudToolForChat;
  approvalExpired?: boolean;
  onResendApproval?: () => void;
}) {
  const colors = useThemeColors();
  const [collapsed, setCollapsed] = useRecyclingState(false, [messageId]);
  const [fullScreenTool, setFullScreenTool] = useRecyclingState<ToolCall | null>(null, [messageId]);
  const closeFullScreen = useCallback(() => setFullScreenTool(null), [setFullScreenTool]);
  const allDone = useMemo(
    () => toolCalls.length > 0 && toolCalls.every((t) => isTerminalToolStatus(effectiveStatus(t))),
    [toolCalls],
  );
  const outcome = useMemo(() => groupOutcome(toolCalls), [toolCalls]);
  const OutcomeGlyph = outcome === 'succeeded' ? CircleCheck : STATUS_GLYPH[outcome];

  const userToggledRef = useRef(false);
  const autoCollapsedRef = useRef(false);
  useEffect(() => {
    userToggledRef.current = false;
    autoCollapsedRef.current = false;
  }, [messageId]);
  useEffect(() => {
    if (!allDone || userToggledRef.current || autoCollapsedRef.current) return;
    autoCollapsedRef.current = true;
    setCollapsed(true);
  }, [allDone, setCollapsed]);

  const handleToggle = useCallback(() => {
    userToggledRef.current = true;
    setCollapsed((prev) => !prev);
  }, [setCollapsed]);

  if (toolCalls.length === 0) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <PressableBox
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`${summary}${collapsed ? ', collapsed' : ', expanded'}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
      >
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{summary}</Text>
        {collapsed ? (
          <ChevronRight size={12} color={colors.textMuted} />
        ) : (
          <ChevronDown size={12} color={colors.textMuted} />
        )}
      </PressableBox>

      {!collapsed ? (
        <View>
          {toolCalls.map((tool, i) => (
            <ToolCallTimelineRow
              key={tool.id}
              tool={tool}
              isFirst={i === 0}
              isLast={i === toolCalls.length - 1 && !allDone}
              onOpenFullScreen={setFullScreenTool}
              onResolveApproval={onResolveApproval}
              onAllowApprovalForChat={onAllowApprovalForChat}
              approvalExpired={approvalExpired}
              onResendApproval={onResendApproval}
            />
          ))}
          {allDone ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 30 }}>
              <TimelineConnector tone={colors.borderLight} showTop showBottom={false} />
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 }}
              >
                <OutcomeGlyph size={15} strokeWidth={1.75} color={colors.textMuted} />
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    color: colors.textSecondary,
                    fontWeight: '600',
                  }}
                >
                  {TOOL_STATUS_PRESENTATION[outcome].label}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {fullScreenTool ? (
        <ToolCallDetailsSheet tool={fullScreenTool} onClose={closeFullScreen} />
      ) : null}
    </View>
  );
}
