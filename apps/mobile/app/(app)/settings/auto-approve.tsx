import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Shield, ShieldCheck, SlidersHorizontal, type LucideIcon } from 'lucide-react-native';
import {
  TOOL_APPROVAL_POLICY_OPTIONS,
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
} from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useToolApprovalPolicySync } from '@/src/features/settings/tool-approvals/useToolApprovalPolicySync';
import { useThemeColors } from '@/src/ui/theme';

const POLICY_ICONS: Record<ToolApprovalPolicy, LucideIcon> = {
  ask_every_time: Shield,
  auto_approve_read_only: ShieldCheck,
};

const RECOMMENDED_POLICY: ToolApprovalPolicy = 'ask_every_time';

function trimSentence(value: string): string {
  return value.replace(/[.。]+$/, '');
}

export default function AutoApproveScreen() {
  const colors = useThemeColors();
  const { policy, status, error, select } = useToolApprovalPolicySync();
  const selectedLabel = toolApprovalPolicyOption(policy).label;

  return (
    <SettingsScreenShell title="Action approvals">
      <SettingsInfo
        title="Review before AGI acts"
        body="Local chat stays private. Approvals only apply when a workflow can use tools, files, connected services, or paired desktop sessions."
        icon={SlidersHorizontal}
      />

      <SettingsGroup>
        {TOOL_APPROVAL_POLICY_OPTIONS.map((option, index) => (
          <ApprovalChoiceRow
            key={option.policy}
            icon={POLICY_ICONS[option.policy]}
            label={option.label}
            description={option.description}
            tag={option.policy === RECOMMENDED_POLICY ? 'Recommended' : undefined}
            selected={policy === option.policy}
            disabled={status === 'loading' || status === 'saving'}
            onPress={() => select(option.policy)}
            isLast={index === TOOL_APPROVAL_POLICY_OPTIONS.length - 1}
          />
        ))}
      </SettingsGroup>

      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: error ? colors.dangerBorder : colors.warningBorder,
          backgroundColor: error ? colors.dangerSurface : colors.warningSurface,
          padding: 14,
          marginBottom: 18,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
          {error ? 'Approval default not in sync' : 'Safety default'}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
          {error
            ? error
            : `Current setting: ${selectedLabel}. AGI should never perform destructive, external, or expensive actions without a clear review step.`}
        </Text>
      </View>
    </SettingsScreenShell>
  );
}

function ApprovalChoiceRow({
  icon: Icon,
  label,
  description,
  tag,
  selected,
  disabled,
  onPress,
  isLast,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  tag?: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${trimSentence(description)}`}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        minHeight: 82,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        opacity: disabled ? 0.6 : 1,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
        backgroundColor: selected
          ? colors.accentSurface
          : pressed
            ? colors.surfaceHover
            : colors.transparent,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? colors.accentSurface : colors.neutralSurface,
          borderWidth: 1,
          borderColor: selected ? colors.accentBorder : colors.neutralBorder,
        }}
      >
        <Icon size={18} color={selected ? colors.textPrimary : colors.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600', flexShrink: 1 }}
          >
            {label}
          </Text>
          {tag ? (
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.successBorder,
                backgroundColor: colors.successSurface,
                paddingHorizontal: 7,
                paddingVertical: 2,
                flexShrink: 0,
              }}
            >
              <Text style={{ color: colors.agentSuccess, fontSize: 10, fontWeight: '700' }}>
                {tag}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={3}
          style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }}
        >
          {description}
        </Text>
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: selected ? colors.textPrimary : colors.border,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {selected ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: colors.textPrimary,
            }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
