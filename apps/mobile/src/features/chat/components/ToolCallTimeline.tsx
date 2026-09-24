import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import { View, Pressable, Modal, ScrollView } from 'react-native';
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
import { lucideRNToolIcon, lucideRNIconByName } from './toolIconRN';
import { WebSearchResultCard } from './WebSearchResultCard';
import { WebSearchToolCard, isWebSearchTool } from './WebSearchToolCard';
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
        <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary }}>
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
    return `${tool.searchResults.length} result${tool.searchResults.length === 1 ? '' : 's'}`;
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
  approvalExpired,
  onResendApproval,
}: {
  tool: ToolCall;
  isFirst: boolean;
  isLast: boolean;
  onOpenFullScreen: (tool: ToolCall) => void;
  onResolveApproval?: (toolCallId: string, decision: 'approved' | 'rejected') => void;
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
  const hasBody = Boolean(tool.searchResults?.length || tool.input || tool.output || tool.command);
  const isSearch = isWebSearchTool(tool.name);
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
      <Pressable
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
              fontSize: 13,
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
                style={{ fontSize: 10.5, color: colors.textMuted, maxWidth: 160 }}
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
      </Pressable>

      {isSearch ? <WebSearchToolCard tool={tool} showSources={!expanded} /> : null}

      {tool.requiresApproval && tool.toolCallId ? (
        <View style={{ paddingLeft: 20, paddingBottom: 10 }}>
          <View
            style={{
              backgroundColor: approvalExpired ? colors.surfaceOverlay : colors.warningSurface,
              borderRadius: 8,
              padding: 10,
              gap: 8,
            }}
          >
            {approvalExpired ? (
              <>
                <Text style={{ fontSize: 12.5, color: colors.textSecondary }}>
                  This approval request expired or is no longer active.{' '}
                  {onResendApproval
                    ? 'Send a new message to try again.'
                    : 'Send a new message to continue.'}
                </Text>
                {onResendApproval ? (
                  <Pressable
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
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
                      Resend
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <>
                <Text style={{ fontSize: 12.5, color: colors.textPrimary }}>
                  {tool.approvalDecision
                    ? `Decision saved: ${
                        tool.approvalDecision === 'approved'
                          ? TOOL_APPROVAL_ACTION_LABELS.allowed
                          : TOOL_APPROVAL_ACTION_LABELS.denied
                      }`
                    : `${nameText} wants to run. Review the request before allowing it to proceed.`}
                </Text>
                {tool.input ? (
                  <Text
                    numberOfLines={4}
                    style={{ fontFamily: 'monospace', fontSize: 11, color: colors.textSecondary }}
                  >
                    {tool.input}
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => onResolveApproval?.(tool.toolCallId!, 'rejected')}
                    accessibilityRole="button"
                    accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.deny} ${nameText}`}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      alignItems: 'center',
                      backgroundColor: colors.surfaceOverlay,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>
                      {tool.approvalDecision === 'rejected'
                        ? TOOL_APPROVAL_ACTION_LABELS.denied
                        : TOOL_APPROVAL_ACTION_LABELS.deny}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onResolveApproval?.(tool.toolCallId!, 'approved')}
                    accessibilityRole="button"
                    accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.allow} ${nameText}`}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      alignItems: 'center',
                      backgroundColor: colors.agentWarning,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.surfaceBase }}>
                      {tool.approvalDecision === 'approved'
                        ? TOOL_APPROVAL_ACTION_LABELS.allowed
                        : TOOL_APPROVAL_ACTION_LABELS.allow}
                    </Text>
                  </Pressable>
                </View>
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
                      fontSize: 10,
                      fontWeight: '600',
                      color: colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    Request
                  </Text>
                  <Text
                    style={{ fontFamily: 'monospace', fontSize: 11.5, color: colors.textPrimary }}
                  >
                    {tool.command ?? tool.input}
                  </Text>
                </View>
              ) : null}
              {tool.output ? (
                <View>
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '600',
                      color: colors.textMuted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 4,
                    }}
                  >
                    Response
                  </Text>
                  <Text
                    numberOfLines={12}
                    style={{ fontFamily: 'monospace', fontSize: 11.5, color: colors.textPrimary }}
                  >
                    {tool.output}
                  </Text>
                </View>
              ) : null}
              {needsFullScreen(tool) ? (
                <Pressable
                  onPress={() => onOpenFullScreen(tool)}
                  accessibilityRole="button"
                  accessibilityLabel={`View full output for ${nameText}`}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 }}
                >
                  <Maximize2 size={11} color={colors.textMuted} />
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: colors.textSecondary }}>
                    View full output
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

const FULLSCREEN_OUTPUT_THRESHOLD = 600;

function needsFullScreen(tool: ToolCall): boolean {
  const size = (tool.output?.length ?? 0) + (tool.command?.length ?? tool.input?.length ?? 0);
  return size > FULLSCREEN_OUTPUT_THRESHOLD || (tool.output?.split('\n').length ?? 0) > 12;
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
            style={{ flex: 1, fontSize: 16, fontWeight: '600', color: colors.textPrimary }}
          >
            {label.displayName}
          </Text>
          <Pressable
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
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {tool.searchResults?.length ? (
            <View style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 11,
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
                  fontSize: 11,
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
                style={{ fontFamily: 'monospace', fontSize: 12.5, color: colors.textPrimary }}
              >
                {tool.command ?? tool.input}
              </Text>
            </View>
          ) : null}
          {tool.output && !tool.searchResults?.length ? (
            <View>
              <Text
                style={{
                  fontSize: 11,
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
                style={{ fontFamily: 'monospace', fontSize: 12.5, color: colors.textPrimary }}
              >
                {tool.output}
              </Text>
            </View>
          ) : null}
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
  approvalExpired,
  onResendApproval,
}: {
  messageId: string;
  toolCalls: ToolCall[];
  summary: string;
  onResolveApproval?: (toolCallId: string, decision: 'approved' | 'rejected') => void;
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
      <Pressable
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`${summary}${collapsed ? ', collapsed' : ', expanded'}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 12.5, color: colors.textMuted }}>{summary}</Text>
        {collapsed ? (
          <ChevronRight size={12} color={colors.textMuted} />
        ) : (
          <ChevronDown size={12} color={colors.textMuted} />
        )}
      </Pressable>

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
                <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '600' }}>
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
