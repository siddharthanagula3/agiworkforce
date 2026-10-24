import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, View } from 'react-native';
import { Check, ChevronDown, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import {
  TOOL_APPROVAL_POLICY_OPTIONS,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
} from '@agiworkforce/types';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useToolApprovalPolicySync } from '@/src/features/settings/tool-approvals/useToolApprovalPolicySync';
import { useThemeColors } from '@/src/ui/theme';
import { sheetRadius, typeScale } from '@/src/ui/theme/tokens';

const SHEET_TITLE = 'Tool approvals';
const SCOPE_NOTE = 'Applies to every chat and session on this account.';
const AUTONOMOUS: ToolApprovalPolicy = 'autonomous';

export function ComposerApprovalModeControl() {
  const colors = useThemeColors();
  const { policy, autonomyForbidden, status, error, select } = useToolApprovalPolicySync();
  const [open, setOpen] = useState(false);
  const hasSynced = useRef(false);
  if (status === 'synced') hasSynced.current = true;

  if (status === 'local' || (status === 'error' && !hasSynced.current)) return null;

  const busy = status === 'loading' || status === 'saving';
  const applied = toolApprovalPolicyOption(policy);
  const options = TOOL_APPROVAL_POLICY_OPTIONS.filter(
    (option) => option.policy !== AUTONOMOUS || !autonomyForbidden,
  );
  const Glyph = policy === AUTONOMOUS ? TriangleAlert : ShieldCheck;

  return (
    <>
      <PressableBox
        testID="chat.approval-mode"
        onPress={() => setOpen(true)}
        disabled={status === 'loading'}
        accessibilityRole="button"
        accessibilityLabel={`${SHEET_TITLE}: ${applied.label}`}
        accessibilityHint="Choose when AGI asks before it acts"
        accessibilityState={{ disabled: status === 'loading', busy }}
        style={{
          alignSelf: 'center',
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: colors.surfaceElevated,
          opacity: status === 'loading' ? 0.5 : 1,
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Glyph size={16} color={policy === AUTONOMOUS ? colors.agentError : colors.textMuted} />
        )}
        <Text
          style={{ color: colors.textSecondary, fontSize: typeScale.subhead, fontWeight: '600' }}
        >
          {applied.shortLabel}
        </Text>
        <ChevronDown size={16} color={colors.textMuted} />
      </PressableBox>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        accessibilityViewIsModal
      >
        <PressableBox
          testID="chat.approval-mode.backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => setOpen(false)}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        >
          <View
            style={{
              borderTopLeftRadius: sheetRadius,
              borderTopRightRadius: sheetRadius,
              backgroundColor: colors.surfaceBase,
              borderWidth: 1,
              borderColor: colors.border,
              paddingHorizontal: 16,
              paddingTop: 18,
              paddingBottom: 28,
              gap: 4,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{
                color: colors.textPrimary,
                fontSize: typeScale.headline,
                fontWeight: '700',
                marginBottom: 6,
              }}
            >
              {SHEET_TITLE}
            </Text>
            {options.map((option) => {
              const selected = option.policy === policy;
              return (
                <PressableBox
                  key={option.policy}
                  testID={`chat.approval-mode.${option.policy}`}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityHint={option.hint}
                  accessibilityState={{ selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    if (!selected) select(option.policy);
                    setOpen(false);
                  }}
                  style={{
                    minHeight: 56,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingVertical: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: typeScale.body,
                        fontWeight: '600',
                      }}
                    >
                      {option.label}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>
                      {option.hint}
                    </Text>
                  </View>
                  {selected ? <Check size={20} color={colors.textPrimary} /> : null}
                </PressableBox>
              );
            })}
            {error ? (
              <Text style={{ color: colors.agentError, fontSize: typeScale.subhead }}>{error}</Text>
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: typeScale.subhead, marginTop: 6 }}>
              {SCOPE_NOTE}
            </Text>
          </View>
        </PressableBox>
      </Modal>
    </>
  );
}
