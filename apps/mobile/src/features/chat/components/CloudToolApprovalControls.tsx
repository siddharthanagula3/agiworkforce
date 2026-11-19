import { useRef } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { useRecyclingState } from '@shopify/flash-list';
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react-native';
import {
  TOOL_APPROVAL_DESTRUCTIVE_NOTICE,
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
  TOOL_APPROVAL_NO_PARAMETERS,
  TOOL_APPROVAL_RISK_LABELS,
  TOOL_APPROVAL_SCOPES,
  TOOL_APPROVAL_SCOPE_DECISIONS,
  TOOL_APPROVAL_SCOPE_LABELS,
  TOOL_APPROVAL_SESSION_SCOPE_NOTE,
  effectiveToolApprovalReview,
  toolApprovalParameterRows,
  toolApprovalRawParameters,
  toolApprovalScopeConfirmation,
  type ToolApprovalDecisionValue,
  type ToolApprovalReview,
  type ToolApprovalScope,
} from '@agiworkforce/cloud-contracts';
import {
  TOOL_APPROVAL_ACTION_LABELS,
  TOOL_APPROVAL_HIGH_RISK_NOTICE,
  detectFileDiff,
  toolApprovalStakes,
  type FileDiff,
  type ToolApprovalStake,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { RiskLevel } from '@/types/chat';
import { TOOL_MONOSPACE, ToolFileDiffBlock } from './ToolFileDiffBlock';
import { useRevealFocusedField } from './cards/ChatScrollIntoView';
import { parseToolArguments } from '@/src/features/chat/utils/executedToolCode';
import {
  clearToolApprovalGuidanceDraft,
  setToolApprovalGuidanceDraft,
  toolApprovalGuidanceDraft,
} from '@/src/features/chat/utils/toolApprovalGuidanceDrafts';

export type CloudToolApprovalDecision = 'approved' | 'rejected';

export type ResolveCloudToolApproval = (
  toolCallId: string,
  decision: ToolApprovalDecisionValue,
  guidance?: string,
) => void;

function decidedToolApprovalScope(
  decision: CloudToolApprovalDecision | undefined,
  approvalScope: ToolApprovalDecisionValue | undefined,
): ToolApprovalScope | undefined {
  if (decision !== 'approved') return undefined;
  return (
    TOOL_APPROVAL_SCOPES.find((scope) => TOOL_APPROVAL_SCOPE_DECISIONS[scope] === approvalScope) ??
    'once'
  );
}

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

export type AlwaysAllowCloudTool = AllowCloudToolForChat;

interface CloudToolApprovalControlsProps {
  toolCallId: string;
  toolName: string;
  summary: string;
  args?: Record<string, unknown>;
  riskLevel?: RiskLevel;
  review?: ToolApprovalReview;
  decision?: CloudToolApprovalDecision;
  approvalScope?: ToolApprovalDecisionValue;
  guidance?: string;
  onResolve?: ResolveCloudToolApproval;
  onAllowForChat?: AllowCloudToolForChat;
  onAlwaysAllow?: AlwaysAllowCloudTool;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

function riskTone(
  tier: ToolApprovalReview['riskTier'],
  colors: ReturnType<typeof useThemeColors>,
): string {
  if (tier === 'low') return colors.textSecondary;
  if (tier === 'medium') return colors.agentWarning;
  return colors.agentError;
}

export function CloudToolApprovalControls({
  toolCallId,
  toolName,
  summary,
  args,
  riskLevel,
  review,
  decision,
  approvalScope,
  guidance: savedGuidance,
  onResolve,
  onAllowForChat,
  onAlwaysAllow,
}: CloudToolApprovalControlsProps) {
  const colors = useThemeColors();
  const decided = decision !== undefined;
  const disabled = !onResolve || decided;
  const effective = effectiveToolApprovalReview(review);
  const preview = cloudToolApprovalPreview(toolName, args);
  const parameterRows = toolApprovalParameterRows(args);
  const rawParameters = toolApprovalRawParameters(args);
  const [rawOpen, setRawOpen] = useRecyclingState(false, [toolCallId]);
  const unsentGuidance = decided ? undefined : toolApprovalGuidanceDraft(toolCallId);
  const initialGuidance = unsentGuidance ?? savedGuidance ?? '';
  const [guidance, setGuidance] = useRecyclingState(initialGuidance, [toolCallId]);
  const [guidanceOpen, setGuidanceOpen] = useRecyclingState(Boolean(initialGuidance), [toolCallId]);
  const guidanceArea = useRef<View>(null);
  const guidanceFocus = useRevealFocusedField(guidanceArea);
  const editGuidance = (text: string) => {
    setToolApprovalGuidanceDraft(toolCallId, text);
    setGuidance(text);
  };
  const trimmedGuidance = () => {
    clearToolApprovalGuidanceDraft(toolCallId);
    return guidance.trim() || undefined;
  };
  const resolve = (next: ToolApprovalDecisionValue) =>
    onResolve?.(toolCallId, next, trimmedGuidance());
  const decidedScope = decidedToolApprovalScope(decision, approvalScope);

  const scopeHandler = (scope: ToolApprovalScope): (() => void) | undefined => {
    if (scope === 'once') return () => resolve(TOOL_APPROVAL_SCOPE_DECISIONS.once);
    const grant = scope === 'session' ? onAllowForChat : onAlwaysAllow;
    if (!grant) return undefined;
    const run = () => grant(toolCallId, toolName, trimmedGuidance());
    if (!effective.destructive) return run;
    return () => {
      const confirmation = toolApprovalScopeConfirmation(scope, summary);
      Alert.alert(confirmation.title, confirmation.message, [
        { text: 'Cancel', style: 'cancel' },
        { text: confirmation.confirmLabel, style: 'destructive', onPress: run },
      ]);
    };
  };
  const scopeButtons = TOOL_APPROVAL_SCOPES.flatMap((scope) => {
    const onPress = effective.scopes.includes(scope) ? scopeHandler(scope) : undefined;
    return onPress || scope === decidedScope ? [{ scope, onPress }] : [];
  });
  const offersSession = scopeButtons.some((button) => button.scope === 'session');

  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text
          testID="tool-approval.risk"
          style={{
            fontSize: typeScale.caption,
            fontWeight: '600',
            color: riskTone(effective.riskTier, colors),
          }}
        >
          {TOOL_APPROVAL_RISK_LABELS[effective.riskTier]}
        </Text>
      </View>
      {effective.destructive ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
          {TOOL_APPROVAL_DESTRUCTIVE_NOTICE}
        </Text>
      ) : null}

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

      {preview.diff ? <ToolFileDiffBlock diff={preview.diff} /> : null}

      {parameterRows.length > 0 ? (
        <View testID="tool-approval.parameters" style={{ gap: 3 }}>
          {parameterRows.map((row) => (
            <View key={row.key} style={{ flexDirection: 'row', gap: 10 }}>
              <Text
                numberOfLines={1}
                style={{
                  maxWidth: '40%',
                  fontFamily: TOOL_MONOSPACE,
                  fontSize: typeScale.caption,
                  color: colors.textMuted,
                }}
              >
                {row.key}
              </Text>
              <Text
                selectable
                style={{
                  flex: 1,
                  fontFamily: TOOL_MONOSPACE,
                  fontSize: typeScale.caption,
                  color: colors.textPrimary,
                }}
              >
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {TOOL_APPROVAL_NO_PARAMETERS}
        </Text>
      )}

      {rawParameters ? (
        <View style={{ gap: 4 }}>
          <PressableBox
            onPress={() => setRawOpen((open) => !open)}
            accessibilityRole="button"
            accessibilityLabel="Raw JSON"
            accessibilityState={{ expanded: rawOpen }}
            hitSlop={HIT_SLOP}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {rawOpen ? (
                <ChevronDown size={13} color={colors.textMuted} />
              ) : (
                <ChevronRight size={13} color={colors.textMuted} />
              )}
              <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>Raw JSON</Text>
            </View>
          </PressableBox>
          {rawOpen ? (
            <Text
              testID="tool-approval.raw-json"
              selectable
              style={{
                fontFamily: TOOL_MONOSPACE,
                fontSize: typeScale.caption,
                color: colors.textPrimary,
                backgroundColor: colors.surfaceOverlay,
                borderRadius: 6,
                padding: 8,
              }}
            >
              {rawParameters}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View ref={guidanceArea} collapsable={false} style={{ gap: 7 }}>
        {guidanceOpen ? (
          <TextInput
            value={guidance}
            onChangeText={editGuidance}
            onFocus={guidanceFocus.onFocus}
            onBlur={guidanceFocus.onBlur}
            onContentSizeChange={guidanceFocus.onContentSizeChange}
            editable={!disabled}
            multiline
            autoFocus={!initialGuidance}
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

        <View
          accessibilityLabel={`Decision for ${summary}`}
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}
        >
          {scopeButtons.map(({ scope, onPress }) => {
            const chosen = scope === decidedScope;
            const primary = decided ? chosen : scope === 'once';
            const label =
              chosen && scope === 'once'
                ? TOOL_APPROVAL_ACTION_LABELS.allowed
                : TOOL_APPROVAL_SCOPE_LABELS[scope];
            return (
              <PressableBox
                key={scope}
                onPress={onPress}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${summary}`}
                accessibilityState={{ disabled, selected: chosen }}
                hitSlop={HIT_SLOP}
              >
                <View
                  style={{
                    paddingHorizontal: 13,
                    paddingVertical: 7,
                    borderRadius: 8,
                    backgroundColor: primary ? colors.agentSuccess : undefined,
                    borderWidth: primary ? 0 : 1,
                    borderColor: colors.border,
                    opacity: disabled && !chosen ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: primary ? colors.accentText : colors.textPrimary,
                      fontSize: typeScale.caption,
                      fontWeight: '600',
                    }}
                  >
                    {label}
                  </Text>
                </View>
              </PressableBox>
            );
          })}
          <PressableBox
            onPress={() => resolve('rejected')}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${
              decision === 'rejected'
                ? TOOL_APPROVAL_ACTION_LABELS.denied
                : TOOL_APPROVAL_ACTION_LABELS.deny
            }: ${summary}`}
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
                opacity: disabled && decision !== 'rejected' ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.caption,
                  fontWeight: '600',
                }}
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
      {offersSession && !decided ? (
        <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
          {TOOL_APPROVAL_SESSION_SCOPE_NOTE}
        </Text>
      ) : null}
    </View>
  );
}
