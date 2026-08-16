import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { BOTTOM_SEARCH_BAR_HEIGHT, BOTTOM_SEARCH_BAR_MARGIN } from './BottomSearchBar';

export const FLOATING_PRIMARY_ACTION_HEIGHT = 48;

export const FLOATING_PRIMARY_ACTION_GAP = 12;

export const FLOATING_PRIMARY_ACTION_LIST_PADDING =
  BOTTOM_SEARCH_BAR_MARGIN +
  BOTTOM_SEARCH_BAR_HEIGHT +
  FLOATING_PRIMARY_ACTION_GAP +
  FLOATING_PRIMARY_ACTION_HEIGHT +
  12;

export function FloatingPrimaryAction({
  label,
  icon: Icon,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <PressableBox
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 18,
        bottom:
          insets.bottom +
          BOTTOM_SEARCH_BAR_MARGIN +
          BOTTOM_SEARCH_BAR_HEIGHT +
          FLOATING_PRIMARY_ACTION_GAP,
        minHeight: FLOATING_PRIMARY_ACTION_HEIGHT,
        borderRadius: FLOATING_PRIMARY_ACTION_HEIGHT / 2,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: colors.teal,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Icon size={18} color={colors.accentText} />
      <Text style={{ color: colors.accentText, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </PressableBox>
  );
}

export default FloatingPrimaryAction;
