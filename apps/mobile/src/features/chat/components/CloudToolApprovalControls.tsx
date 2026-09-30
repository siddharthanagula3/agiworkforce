import { TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { useRecyclingState } from '@shopify/flash-list';
import { ShieldAlert } from 'lucide-react-native';
import { TOOL_APPROVAL_GUIDANCE_MAX_LENGTH } from '@agiworkforce/cloud-contracts';
import {
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_APPROVAL_HIGH_RISK_NOTICE,
  detectFileDiff,
  toolApprovalStakes,
  type FileDiff,
  type ToolApprovalStake,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { RiskLevel } from '@/types/chat';
import { translatePlural } from '@/src/i18n/plural';

export type CloudToolApprovalDecision = 'approved' | 'rejected';

export type ResolveCloudToolApproval = (
  toolCallId: string,
  decision: CloudToolApprovalDecision,
  guidance?: string,
) => void;

export type AllowCloudToolForChat = (
  toolCallId: string,
  toolName: string,
  guidance?: string,
) => void;

export interface CloudToolApprovalPreview {
  stakes: ToolApprovalStake[];
  diff: FileDiff | null;
}

export function cloudToolApprovalPreview(
  toolName: string,
  args: Record<string, unknown> | undefined,
): CloudToolApprovalPreview {
  return { stakes: toolApprovalStakes(toolName, args), diff: detectFileDiff(args) };
}

export function parseToolArguments(input: unknown): Record<string, unknown> | undefined {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input !== 'string' || input.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(input);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

interface CloudToolApprovalControlsProps {
  toolCallId: string;
  toolName: string;
  summary: string;
  args?: Record<string, unknown>;
  riskLevel?: RiskLevel;
  decision?: CloudToolApprovalDecision;
  guidance?: string;
  onResolve?: ResolveCloudToolApproval;
  onAllowForChat?: AllowCloudToolForChat;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
const MAX_PREVIEW_DIFF_LINES = 40;

function DiffPreview({ diff }: { diff: FileDiff }) {
  const colors = useThemeColors();
  const visible = diff.lines
    .filter((line) => line.type !== 'meta')
    .slice(0, MAX_PREVIEW_DIFF_LINES);
  const hidden = diff.lines.filter((line) => line.type !== 'meta').length - visible.length;
  return (
    <View
      accessibilityLabel={`Proposed change${diff.filePath ? ` to ${diff.filePath}` : ''}: ${diff.additions} added, ${diff.deletions} removed`}
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.borderLight,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: 8,
        paddingVertical: 6,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: typeScale.caption, color: colors.textSecondary }}
        >
          {diff.filePath ?? 'Proposed change'}
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.agentSuccess }}>
          +{diff.additions}
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: colors.agentError }}>
          -{diff.deletions}
        </Text>
      </View>
      {visible.map((line, index) => (
        <Text
          key={index}
          style={{
            fontFamily: 'monospace',
            fontSize: typeScale.caption,
            color:
              line.type === 'add'
                ? colors.agentSuccess
                : line.type === 'remove'
                  ? colors.agentError
                  : colors.textSecondary,
          }}
        >
          {`${line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '} ${line.content}`}
        </Text>
      ))}
      {hidden > 0 ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
          {translatePlural(
            'chat',
            'counts.hiddenLines',
            hidden,
            { one: '{{lines}} more line not shown', other: '{{lines}} more lines not shown' },
            { lines: hidden },
          )}
        </Text>
      ) : null}
    </View>
  );
}

export function CloudToolApprovalControls({
  toolCallId,
  toolName,
  summary,
  args,
  riskLevel,
  decision,
  guidance: savedGuidance,
  onResolve,
  onAllowForChat,
}: CloudToolApprovalControlsProps) {
  const colors = useThemeColors();
  const disabled = !onResolve;
  const preview = cloudToolApprovalPreview(toolName, args);
  const [guidance, setGuidance] = useRecyclingState(savedGuidance ?? '', [toolCallId]);
  const [guidanceOpen, setGuidanceOpen] = useRecyclingState(Boolean(savedGuidance), [toolCallId]);
  const resolve = (next: CloudToolApprovalDecision) =>
    onResolve?.(toolCallId, next, guidance.trim() || undefined);
  const canAllowForChat = Boolean(onAllowForChat) && !disabled && riskLevel !== 'high';

  return (
    <View style={{ gap: 7 }}>
      {riskLevel === 'high' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={14} color={colors.agentError} />
          <Text
            style={{
              flex: 1,
              fontSize: typeScale.caption,
              fontWeight: '600',
              color: colors.agentError,
            }}
          >
            {TOOL_APPROVAL_HIGH_RISK_NOTICE}
          </Text>
        </View>
      ) : null}

      {preview.stakes.length > 0 ? (
        <View style={{ gap: 2 }}>
          {preview.stakes.map((stake) => (
            <Text
              key={`${stake.kind}:${stake.label}`}
              style={{ fontSize: typeScale.caption, color: colors.textPrimary }}
            >
              <Text style={{ color: colors.textSecondary }}>{`${stake.label}: `}</Text>
              <Text style={{ fontWeight: '600' }}>{stake.value}</Text>
            </Text>
          ))}
        </View>
      ) : null}

      {preview.diff ? <DiffPreview diff={preview.diff} /> : null}

      {guidanceOpen ? (
        <TextInput
          value={guidance}
          onChangeText={setGuidance}
          editable={!disabled}
          multiline
          autoFocus={!savedGuidance}
          maxLength={TOOL_APPROVAL_GUIDANCE_MAX_LENGTH}
          placeholder="Tell the agent what to do instead"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.teal}
          accessibilityLabel={`Guidance for ${summary}`}
          accessibilityHint="Sent to the agent with Allow or Deny"
          style={{
            minHeight: 64,
            maxHeight: 140,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.inputSurface,
            color: colors.textPrimary,
            fontSize: typeScale.footnote,
            paddingHorizontal: 10,
            paddingVertical: 8,
            textAlignVertical: 'top',
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <PressableBox
          onPress={() => resolve('approved')}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.allow} ${summary}`}
          accessibilityState={{ disabled, selected: decision === 'approved' }}
          hitSlop={HIT_SLOP}
        >
          <View
            style={{
              paddingHorizontal: 13,
              paddingVertical: 7,
              borderRadius: 8,
              backgroundColor: colors.agentSuccess,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{ color: colors.accentText, fontSize: typeScale.caption, fontWeight: '600' }}
            >
              {decision === 'approved'
                ? TOOL_APPROVAL_ACTION_LABELS.allowed
                : TOOL_APPROVAL_ACTION_LABELS.allow}
            </Text>
          </View>
        </PressableBox>
        {canAllowForChat ? (
          <PressableBox
            onPress={() => onAllowForChat?.(toolCallId, toolName, guidance.trim() || undefined)}
            accessibilityRole="button"
            accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.allowForChat}: ${summary}`}
            hitSlop={HIT_SLOP}
          >
            <View
              style={{
                paddingHorizontal: 13,
                paddingVertical: 7,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                }}
              >
                {TOOL_APPROVAL_ACTION_LABELS.allowForChat}
              </Text>
            </View>
          </PressableBox>
        ) : null}
        <PressableBox
          onPress={() => resolve('rejected')}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${TOOL_APPROVAL_ACTION_LABELS.deny} ${summary}`}
          accessibilityState={{ disabled, selected: decision === 'rejected' }}
          hitSlop={HIT_SLOP}
        >
          <View
            style={{
              paddingHorizontal: 13,
              paddingVertical: 7,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.caption, fontWeight: '600' }}
            >
              {decision === 'rejected'
                ? TOOL_APPROVAL_ACTION_LABELS.denied
                : TOOL_APPROVAL_ACTION_LABELS.deny}
            </Text>
          </View>
        </PressableBox>
        {guidanceOpen || disabled ? null : (
          <PressableBox
            onPress={() => setGuidanceOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Add guidance for ${summary}`}
            hitSlop={HIT_SLOP}
          >
            <View style={{ paddingHorizontal: 6, paddingVertical: 7 }}>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                }}
              >
                Add guidance
              </Text>
            </View>
          </PressableBox>
        )}
      </View>
    </View>
  );
}
