import { Pressable, View } from 'react-native';
import { ShieldAlert } from 'lucide-react-native';
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
import type { RiskLevel } from '@/types/chat';
import { translatePlural } from '@/src/i18n/plural';

export type CloudToolApprovalDecision = 'approved' | 'rejected';

export type ResolveCloudToolApproval = (
  toolCallId: string,
  decision: CloudToolApprovalDecision,
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
  onResolve?: ResolveCloudToolApproval;
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
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: colors.textSecondary }}>
          {diff.filePath ?? 'Proposed change'}
        </Text>
        <Text style={{ fontSize: 11, color: colors.agentSuccess }}>+{diff.additions}</Text>
        <Text style={{ fontSize: 11, color: colors.agentError }}>-{diff.deletions}</Text>
      </View>
      {visible.map((line, index) => (
        <Text
          key={index}
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
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
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
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
  onResolve,
}: CloudToolApprovalControlsProps) {
  const colors = useThemeColors();
  const disabled = !onResolve;
  const preview = cloudToolApprovalPreview(toolName, args);
  const resolve = (next: CloudToolApprovalDecision) => onResolve?.(toolCallId, next);

  return (
    <View style={{ gap: 7 }}>
      {riskLevel === 'high' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ShieldAlert size={14} color={colors.agentError} />
          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '600', color: colors.agentError }}>
            {TOOL_APPROVAL_HIGH_RISK_NOTICE}
          </Text>
        </View>
      ) : null}

      {preview.stakes.length > 0 ? (
        <View style={{ gap: 2 }}>
          {preview.stakes.map((stake) => (
            <Text
              key={`${stake.kind}:${stake.label}`}
              style={{ fontSize: 12.5, color: colors.textPrimary }}
            >
              <Text style={{ color: colors.textSecondary }}>{`${stake.label}: `}</Text>
              <Text style={{ fontWeight: '600' }}>{stake.value}</Text>
            </Text>
          ))}
        </View>
      ) : null}

      {preview.diff ? <DiffPreview diff={preview.diff} /> : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
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
            <Text style={{ color: colors.accentText, fontSize: 12, fontWeight: '600' }}>
              {decision === 'approved'
                ? TOOL_APPROVAL_ACTION_LABELS.allowed
                : TOOL_APPROVAL_ACTION_LABELS.allow}
            </Text>
          </View>
        </Pressable>
        <Pressable
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
            <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
              {decision === 'rejected'
                ? TOOL_APPROVAL_ACTION_LABELS.denied
                : TOOL_APPROVAL_ACTION_LABELS.deny}
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
