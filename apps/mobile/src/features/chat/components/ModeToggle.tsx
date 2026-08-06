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
    // Was minWidth 80 + flexShrink 0, which made the toggle incompressible and
    // pushed it over the neighbouring project chip on narrow iPhones.
    minWidth: 60,
    flexShrink: 1,
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
        /*
         * maxWidth, NOT width. A hard `width: 172` in a flex:1 slot overflows
         * rather than shrinking: on a 375pt iPhone the chat header leaves this
         * slot ~131pt, so the toggle spilled over the project chip to its left
         * and swallowed taps meant for it and for "New chat". Cap the width and
         * let it compress; the segments above shrink with it.
         */
        maxWidth: toggleWidth,
        minWidth: compact ? 132 : 160,
        flexShrink: 1,
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
              flexShrink: 1,
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
              flexShrink: 1,
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
