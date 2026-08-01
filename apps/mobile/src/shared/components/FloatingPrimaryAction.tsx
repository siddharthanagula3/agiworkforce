import type { LucideIcon } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableBox } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { BOTTOM_SEARCH_BAR_HEIGHT, BOTTOM_SEARCH_BAR_MARGIN } from './BottomSearchBar';

/** Pill height. Comfortably above the 44pt iOS minimum touch target. */
export const FLOATING_PRIMARY_ACTION_HEIGHT = 48;

/** Gap between the pill and the search bar it stacks on top of. */
export const FLOATING_PRIMARY_ACTION_GAP = 12;

/**
 * `contentContainerStyle.paddingBottom` for a list that sits underneath both a
 * `FloatingPrimaryAction` and a `BottomSearchBar`, so the last row can always
 * be scrolled clear of the pill overlaying it. The safe-area inset is NOT part
 * of this figure: the search bar below is in normal flow and already absorbs
 * it, and adding it twice leaves a visible dead band.
 */
export const FLOATING_PRIMARY_ACTION_LIST_PADDING =
  BOTTOM_SEARCH_BAR_MARGIN +
  BOTTOM_SEARCH_BAR_HEIGHT +
  FLOATING_PRIMARY_ACTION_GAP +
  FLOATING_PRIMARY_ACTION_HEIGHT +
  12;

/**
 * The floating labelled create pill shared by every list screen.
 *
 * Both references give a list its primary create action as a labelled pill
 * floating above the content — never a small unlabelled square in the header
 * (Projects shipped a 32×32 `[+]`, under the 44pt iOS minimum). It is pinned
 * above the `BottomSearchBar` rather than over it: the two controls share the
 * bottom-right corner, and the pill renders clipped behind the field without
 * the offset below.
 */
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
  /** Defaults to `label`; pass one only when the spoken name should differ. */
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
