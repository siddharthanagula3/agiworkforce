import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { Cloud, Cpu, Lock } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { AppMode } from './ModeSwitchModal';

export interface ModeToggleProps {
  mode?: AppMode;
  cloudJoined?: boolean;
  cloudUnlocked?: boolean;
  waitlistRank?: number | undefined;
  onChange?: (mode: AppMode) => void;
  onTapCloud?: () => void;
}

export function ModeToggle({
  mode = 'local',
  cloudJoined = false,
  cloudUnlocked = false,
  waitlistRank,
  onTapCloud,
}: ModeToggleProps): ReactElement {
  const colors = useThemeColors();
  const cloudLabel = cloudUnlocked
    ? 'Cloud'
    : cloudJoined
      ? waitlistRank
        ? `Waitlist #${waitlistRank}`
        : 'Waitlisted'
      : 'Waitlist';
  const cloudActive = mode === 'cloud';
  const cloudAccessible = cloudUnlocked || cloudJoined;
  const cloudAccessibilityLabel = cloudUnlocked ? 'AGI Cloud' : `AGI Cloud ${cloudLabel}`;

  return (
    <View
      testID="chat.mode-toggle"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
        maxWidth: 190,
      }}
      accessibilityRole="tablist"
      accessibilityLabel="Chat execution mode"
    >
      <View
        testID="chat.mode-toggle.local"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          height: 28,
          borderRadius: 999,
          backgroundColor: mode === 'local' ? colors.accentSurface : colors.transparent,
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: mode === 'local' }}
        accessibilityLabel="Local Mode"
      >
        <Cpu size={13} color={mode === 'local' ? colors.teal : colors.textMuted} />
        <Text
          numberOfLines={1}
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: mode === 'local' ? colors.teal : colors.textMuted,
          }}
        >
          Local Mode
        </Text>
      </View>

      <Pressable
        testID="chat.mode-toggle.cloud"
        onPress={onTapCloud}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 9,
          height: 28,
          borderRadius: 999,
          backgroundColor: cloudActive ? colors.accentSurface : colors.transparent,
          opacity: pressed ? 0.75 : 1,
        })}
        accessibilityRole="button"
        accessibilityLabel={cloudAccessibilityLabel}
        accessibilityHint="Opens AGI Cloud access"
      >
        {cloudAccessible ? (
          <Cloud size={13} color={cloudActive ? colors.teal : colors.textSecondary} />
        ) : (
          <Lock size={12} color={colors.textMuted} />
        )}
        {cloudAccessible ? (
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              fontWeight: cloudActive ? '600' : '500',
              color: cloudActive ? colors.teal : colors.textSecondary,
              maxWidth: 70,
            }}
          >
            {cloudLabel}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

export default ModeToggle;
