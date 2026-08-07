/**
 * Tool access — how eagerly AGI loads tool definitions for a Cloud turn.
 *
 * `chatViewStore.toolAccess` has existed with a setter, persistence, and a
 * `tool_access` field in the GDPR/DPDP data export since the store was written,
 * but `setToolAccess` had ZERO call sites — the value could only ever be its
 * default, and the export reported a preference the user was never able to set.
 * This screen is that missing control.
 *
 * The three-option-card shape mirrors Settings › Action approvals, which is the
 * established mobile pattern for a mutually exclusive choice.
 */

import { useMemo } from 'react';
import { View } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Layers, Sparkles, Timer, Wrench, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import type { ToolAccess } from '@/stores/chat/chatViewStore';
import { SettingsGroup, SettingsInfo, SettingsScreenShell } from '@/src/features/settings/common';
import { useThemeColors } from '@/src/ui/theme';

interface ToolAccessOption {
  mode: ToolAccess;
  icon: LucideIcon;
  label: string;
  description: string;
  tag?: string;
}

const OPTIONS: ToolAccessOption[] = [
  {
    mode: 'auto',
    icon: Sparkles,
    label: 'Auto',
    description: 'AGI decides which tools to load for each message.',
    tag: 'Recommended',
  },
  {
    mode: 'on-demand',
    icon: Timer,
    label: 'On demand',
    description:
      'Load tools only when a message needs them. More messages per session, slightly lower accuracy.',
  },
  {
    mode: 'always',
    icon: Layers,
    label: 'Always available',
    description:
      'Keep every tool loaded from the start. Fewer messages per session, better accuracy.',
  },
];

function trimSentence(value: string): string {
  return value.replace(/[.。]+$/, '');
}

export default function ToolAccessScreen() {
  const colors = useThemeColors();
  const toolAccess = useChatStore((s) => s.toolAccess);
  const setToolAccess = useChatStore((s) => s.setToolAccess);
  const selectedLabel = useMemo(
    () => OPTIONS.find((option) => option.mode === toolAccess)?.label ?? 'Auto',
    [toolAccess],
  );

  return (
    <SettingsScreenShell title="Tool access">
      <SettingsInfo
        title="How tools get loaded"
        body="This is a Cloud-chat preference. Local Mode runs entirely on your device and does not load server tools at all, so this setting has no effect there."
        icon={Wrench}
      />

      <SettingsGroup>
        {OPTIONS.map((option, index) => (
          <ToolAccessChoiceRow
            key={option.mode}
            option={option}
            selected={toolAccess === option.mode}
            onPress={() => setToolAccess(option.mode)}
            isLast={index === OPTIONS.length - 1}
          />
        ))}
      </SettingsGroup>

      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.neutralBorder,
          backgroundColor: colors.neutralSurface,
          padding: 14,
          marginBottom: 18,
        }}
      >
        <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: '700' }}>
          Current setting: {selectedLabel}
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
          Loading more tools uses more of each message&apos;s context budget, which is why the
          trade-off is messages-per-session against accuracy.
        </Text>
      </View>
    </SettingsScreenShell>
  );
}

function ToolAccessChoiceRow({
  option,
  selected,
  onPress,
  isLast,
}: {
  option: ToolAccessOption;
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
          numberOfLines={3}
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
            style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.textPrimary }}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
