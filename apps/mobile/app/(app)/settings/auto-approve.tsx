import { useMemo } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AutoApproveMode } from '@/types/chat';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';

interface ApprovalOption {
  mode: AutoApproveMode;
  icon: LucideIcon;
  label: string;
  description: string;
  tag?: string;
}

const OPTIONS: ApprovalOption[] = [
  {
    mode: 'ask',
    icon: Shield,
    label: 'Ask every time',
    description: 'AGI asks before running actions that can change files, send data, or use tools.',
    tag: 'Recommended',
  },
  {
    mode: 'smart',
    icon: ShieldCheck,
    label: 'Low-risk actions',
    description: 'AGI can continue routine read-only actions and still asks before sensitive work.',
  },
  {
    mode: 'full',
    icon: ShieldAlert,
    label: 'Approve all actions',
    description: 'AGI runs actions without stopping for review. Use only for trusted workflows.',
  },
];

function trimSentence(value: string): string {
  return value.replace(/[.。]+$/, '');
}

export default function AutoApproveScreen() {
  const colors = useThemeColors();
  const autoApproveMode = useSettingsStore((s) => s.autoApproveMode);
  const setAutoApproveMode = useSettingsStore((s) => s.setAutoApproveMode);
  const agentsEnabled = FEATURES.agents;
  const selectedLabel = useMemo(
    () => OPTIONS.find((option) => option.mode === autoApproveMode)?.label ?? 'Ask every time',
    [autoApproveMode],
  );

  return (
    <SettingsScreenShell title="Action approvals">
      <SettingsInfo
        title="Review before AGI acts"
        body="Local chat stays private. Approvals only apply when a workflow can use tools, files, connected services, or paired desktop sessions."
        icon={SlidersHorizontal}
      />

      {!agentsEnabled ? (
        <SettingsGroup>
          <StatusRow
            icon={Shield}
            label="Current behavior"
            description="AGI asks before tool actions. Advanced agent automation is not active on this device."
            value="Ask"
            isLast
          />
        </SettingsGroup>
      ) : (
        <SettingsGroup>
          {OPTIONS.map((option, index) => (
            <ApprovalChoiceRow
              key={option.mode}
              option={option}
              selected={autoApproveMode === option.mode}
              onPress={() => setAutoApproveMode(option.mode)}
              isLast={index === OPTIONS.length - 1}
            />
          ))}
        </SettingsGroup>
      )}

      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.warningBorder,
          backgroundColor: colors.warningSurface,
          padding: 14,
          marginBottom: 18,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
          Safety default
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
          Current setting: {selectedLabel}. AGI should never perform destructive, external, or
          expensive actions without a clear review step.
        </Text>
      </View>
    </SettingsScreenShell>
  );
}

function StatusRow({
  icon: Icon,
  label,
  description,
  value,
  isLast,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  value: string;
  isLast?: boolean;
}) {
  const colors = useThemeColors();

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${label}. ${trimSentence(description)}. ${value}`}
      style={{
        minHeight: 94,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: isLast ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.neutralSurface,
          borderWidth: 1,
          borderColor: colors.neutralBorder,
        }}
      >
        <Icon size={18} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '600' }}
        >
          {label}
        </Text>
        <Text
          numberOfLines={3}
          style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }}
        >
          {description}
        </Text>
      </View>
      <View
        style={{
          borderRadius: 999,
          borderWidth: 1,
          borderColor: colors.neutralBorder,
          backgroundColor: colors.neutralSurface,
          paddingHorizontal: 9,
          paddingVertical: 4,
        }}
      >
        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' }}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function ApprovalChoiceRow({
  option,
  selected,
  onPress,
  isLast,
}: {
  option: ApprovalOption;
  selected: boolean;
  onPress: () => void;
  isLast?: boolean;
}) {
  const colors = useThemeColors();
  const Icon = option.icon;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${option.label}. ${trimSentence(option.description)}`}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        minHeight: 82,
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
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
            {option.label}
          </Text>
          {option.tag ? (
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
                {option.tag}
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          numberOfLines={2}
          style={{ color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 }}
        >
          {option.description}
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
