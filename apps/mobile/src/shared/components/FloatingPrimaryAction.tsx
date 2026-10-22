import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { BOTTOM_SEARCH_BAR_HEIGHT, BOTTOM_SEARCH_BAR_MARGIN } from './BottomSearchBar';

export const FLOATING_PRIMARY_ACTION_HEIGHT = 48;

export const FLOATING_PRIMARY_ACTION_GAP = 12;

export const FLOATING_PRIMARY_ACTION_LIST_PADDING =
  BOTTOM_SEARCH_BAR_MARGIN +
  BOTTOM_SEARCH_BAR_HEIGHT +
  FLOATING_PRIMARY_ACTION_GAP +
  FLOATING_PRIMARY_ACTION_HEIGHT +
  12;

export const FLOATING_PRIMARY_ACTION_STANDALONE_LIST_PADDING =
  FLOATING_PRIMARY_ACTION_GAP + FLOATING_PRIMARY_ACTION_HEIGHT + 12;

export function FloatingPrimaryAction({
  label,
  icon: Icon,
  onPress,
  accessibilityLabel,
  testID,
  tone = 'accent',
  aboveSearchBar = true,
}: {
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
  tone?: 'accent' | 'ink';
  aboveSearchBar?: boolean;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const fill = tone === 'ink' ? colors.textPrimary : colors.teal;
  const searchBarOffset = aboveSearchBar ? BOTTOM_SEARCH_BAR_MARGIN + BOTTOM_SEARCH_BAR_HEIGHT : 0;

  return (
    <PressableBox
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        position: 'absolute',
        right: 18,
        bottom: insets.bottom + searchBarOffset + FLOATING_PRIMARY_ACTION_GAP,
        minHeight: FLOATING_PRIMARY_ACTION_HEIGHT,
        borderRadius: FLOATING_PRIMARY_ACTION_HEIGHT / 2,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: fill,
        opacity: pressed ? 0.82 : 1,
      })}
    >
      <Icon size={18} color={colors.accentText} />
      <Text style={{ color: colors.accentText, fontSize: typeScale.subhead, fontWeight: '700' }}>
        {label}
      </Text>
    </PressableBox>
  );
}

export default FloatingPrimaryAction;
