import type { ReactElement } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Cloud, Cpu, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import type { AppMode } from './ModeSwitchModal';

export interface ModeToggleProps {
  mode?: AppMode;
  cloudUnlocked?: boolean;
  onTapLocal?: () => void;
  onTapCloud?: () => void;
}

const MINIMUM_TOUCH_TARGET = 44;
const TRACK_PADDING = 3;
const SEGMENT_HEIGHT = MINIMUM_TOUCH_TARGET - TRACK_PADDING * 2;
const SEGMENT_HIT_SLOP = { top: TRACK_PADDING, bottom: TRACK_PADDING };
const ICON_SIZE = 16;

function Segment({
  testID,
  label,
  icon: Icon,
  selected,
  onPress,
  disabled,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
}: {
  testID: string;
  label: string;
  icon: LucideIcon;
  selected: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityRole: 'button' | 'tab';
  accessibilityLabel: string;
  accessibilityHint?: string;
}) {
  const colors = useThemeColors();
  const color = selected ? colors.textPrimary : colors.textMuted;
  return (
    <PressableBox
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={SEGMENT_HIT_SLOP}
      style={{
        flex: 1,
        minWidth: MINIMUM_TOUCH_TARGET,
        height: SEGMENT_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? colors.borderLight : colors.transparent,
        backgroundColor: selected ? colors.charcoal700 : colors.transparent,
      }}
      accessibilityRole={accessibilityRole}
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      <Icon size={ICON_SIZE} color={color} />
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
        style={{
          fontSize: typeScale.body,
          fontWeight: selected ? '600' : '500',
          color,
          flexShrink: 1,
          includeFontPadding: false,
        }}
      >
        {label}
      </Text>
    </PressableBox>
  );
}

export function ModeToggle({
  mode = 'local',
  cloudUnlocked = false,
  onTapLocal,
  onTapCloud,
}: ModeToggleProps): ReactElement {
  const colors = useThemeColors();

  return (
    <View
      testID="chat.mode-toggle"
      style={{
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 999,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        padding: TRACK_PADDING,
      }}
      accessibilityRole="tablist"
      accessibilityLabel="Chat execution mode"
    >
      <Segment
        testID="chat.mode-toggle.local"
        label="Local"
        icon={Cpu}
        selected={mode === 'local'}
        onPress={onTapLocal}
        disabled={!onTapLocal}
        accessibilityRole={onTapLocal ? 'button' : 'tab'}
        accessibilityLabel="Local Mode"
        accessibilityHint={onTapLocal ? 'Switches to Local Mode without Cloud context' : undefined}
      />
      <Segment
        testID="chat.mode-toggle.cloud"
        label="Cloud"
        icon={Cloud}
        selected={mode === 'cloud'}
        onPress={onTapCloud}
        accessibilityRole="button"
        accessibilityLabel={cloudUnlocked ? 'AGI Cloud' : 'AGI Cloud, sign in required'}
        accessibilityHint="Opens AGI Cloud access"
      />
    </View>
  );
}

export default ModeToggle;
