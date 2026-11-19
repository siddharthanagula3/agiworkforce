import { View } from 'react-native';
import { Check } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { SettingsGroup } from '@/src/features/settings/Common';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { TOOL_ACCESS_OPTIONS, type ToolAccessMode } from './toolAccessPreferenceService';
import type { ToolAccessConnectors, ToolAccessStatus } from './useToolAccessPreference';

export const TOOL_ACCESS_TITLE = 'Tool access';
export const TOOL_ACCESS_CONNECT_HINT = 'Applies when you connect apps.';

export type ToolAccessView = 'hidden' | 'choices' | 'connect-hint';

export function toolAccessView(input: {
  available: boolean;
  status: ToolAccessStatus;
  connectors: ToolAccessConnectors;
}): ToolAccessView {
  if (!input.available || input.status === 'loading') return 'hidden';
  if (input.status === 'unavailable') return 'choices';
  if (input.connectors === 'loading') return 'hidden';
  return input.connectors === 'none' ? 'connect-hint' : 'choices';
}

export function ToolAccessOptions({
  view,
  mode,
  lockedNote,
  onSelect,
}: {
  view: Exclude<ToolAccessView, 'hidden'>;
  mode: ToolAccessMode;
  lockedNote?: string;
  onSelect: (mode: ToolAccessMode) => void;
}) {
  const colors = useThemeColors();

  if (view === 'connect-hint') {
    return (
      <SettingsGroup>
        <View style={{ paddingHorizontal: 14, paddingVertical: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: typeScale.footnote, lineHeight: 18 }}>
            {TOOL_ACCESS_CONNECT_HINT}
          </Text>
        </View>
      </SettingsGroup>
    );
  }

  const locked = lockedNote !== undefined;
  return (
    <SettingsGroup footnote={lockedNote}>
      <View accessibilityRole="radiogroup" accessibilityLabel={TOOL_ACCESS_TITLE}>
        {TOOL_ACCESS_OPTIONS.map((option, index) => {
          const selected = !locked && option.mode === mode;
          return (
            <Pressable
              key={option.mode}
              testID={`capabilities.tool-access.${option.mode}`}
              onPress={() => onSelect(option.mode)}
              disabled={locked}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: locked }}
              accessibilityLabel={`${option.label}. ${option.description}`}
              accessibilityHint={lockedNote}
              style={{
                minHeight: 52,
                paddingHorizontal: 14,
                paddingVertical: spacing.sm,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                borderBottomWidth: index === TOOL_ACCESS_OPTIONS.length - 1 ? 0 : 1,
                borderBottomColor: colors.border,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: locked ? colors.textMuted : colors.textPrimary,
                    fontSize: typeScale.body,
                    fontWeight: '600',
                  }}
                >
                  {option.label}
                </Text>
                <Text
                  style={{
                    color: colors.textMuted,
                    fontSize: typeScale.footnote,
                    lineHeight: 18,
                    marginTop: 3,
                  }}
                >
                  {option.description}
                </Text>
              </View>
              {selected ? <Check size={18} color={colors.teal} /> : null}
            </Pressable>
          );
        })}
      </View>
    </SettingsGroup>
  );
}
