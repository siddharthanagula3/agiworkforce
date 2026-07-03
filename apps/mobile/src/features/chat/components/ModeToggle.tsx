import type { ReactElement } from 'react';
import { Pressable, View } from 'react-native';
import { Cloud, Cpu } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { AppMode } from './ModeSwitchModal';

export interface ModeToggleProps {
  mode?: AppMode;
  cloudJoined?: boolean;
  cloudUnlocked?: boolean;
  waitlistRank?: number | undefined;
  compact?: boolean;
  onChange?: (mode: AppMode) => void;
  onTapLocal?: () => void;
  onTapCloud?: () => void;
}

export function ModeToggle({
  mode = 'local',
  cloudJoined = false,
  cloudUnlocked = false,
  waitlistRank,
  compact = false,
  onTapLocal,
  onTapCloud,
}: ModeToggleProps): ReactElement {
  const colors = useThemeColors();
  const cloudLabel = 'Cloud';
  const cloudActive = mode === 'cloud';
  // Public alpha: cloud access is the signed-in entitlement (cloudUnlocked). The
  // cloudJoined / waitlistRank props are retained for call-site compatibility but no
  // longer frame access — a signed-out user is prompted to sign in, not to join a list.
  void cloudJoined;
  void waitlistRank;
  const cloudAccessibilityLabel = cloudUnlocked ? 'AGI Cloud' : 'AGI Cloud, sign in required';
  const toggleWidth = compact ? 172 : 216;
  const selectedBackground = colors.charcoal700;
  const selectedBorderColor = colors.borderLight;
  const selectedTextColor = colors.textPrimary;
  const inactiveTextColor = colors.textMuted;
  const selectedSegmentStyle = {
    borderColor: selectedBorderColor,
    backgroundColor: selectedBackground,
  };
  const inactiveSegmentStyle = {
    borderColor: colors.transparent,
    backgroundColor: colors.transparent,
  };
  const segmentStyle = (selected: boolean) => ({
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 8,
    height: 28,
    flex: 1,
    minWidth: 80,
    flexShrink: 0,
    borderRadius: 999,
    borderWidth: 1,
    ...(selected ? selectedSegmentStyle : inactiveSegmentStyle),
  });

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
        height: 36,
        width: toggleWidth,
        flexWrap: 'nowrap',
        overflow: 'hidden',
      }}
      accessibilityRole="tablist"
      accessibilityLabel="Chat execution mode"
    >
      <Pressable
        testID="chat.mode-toggle.local"
        onPress={onTapLocal}
        disabled={!onTapLocal}
        style={segmentStyle(mode === 'local')}
        accessibilityRole={onTapLocal ? 'button' : 'tab'}
        accessibilityState={{ selected: mode === 'local' }}
        accessibilityLabel="Local Mode"
        accessibilityHint={onTapLocal ? 'Switches to Local Mode without Cloud context' : undefined}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            minWidth: 58,
          }}
        >
          <Cpu size={13} color={mode === 'local' ? selectedTextColor : inactiveTextColor} />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{
              fontSize: 12,
              lineHeight: 14,
              fontWeight: '600',
              color: mode === 'local' ? selectedTextColor : inactiveTextColor,
              flexShrink: 0,
              includeFontPadding: false,
            }}
          >
            Local
          </Text>
        </View>
      </Pressable>

      <Pressable
        testID="chat.mode-toggle.cloud"
        onPress={onTapCloud}
        hitSlop={8}
        style={segmentStyle(cloudActive)}
        accessibilityRole="button"
        accessibilityLabel={cloudAccessibilityLabel}
        accessibilityHint="Opens AGI Cloud access"
        accessibilityState={{ selected: cloudActive }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            minWidth: 62,
          }}
        >
          <Cloud size={13} color={cloudActive ? selectedTextColor : inactiveTextColor} />
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{
              fontSize: 12,
              lineHeight: 14,
              fontWeight: cloudActive ? '600' : '500',
              color: cloudActive ? selectedTextColor : inactiveTextColor,
              flexShrink: 0,
              includeFontPadding: false,
            }}
          >
            {cloudLabel}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export default ModeToggle;
