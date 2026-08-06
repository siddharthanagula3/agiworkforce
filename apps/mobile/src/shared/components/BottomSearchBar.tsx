import type { Ref } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { useThemeColors } from '@/src/ui/theme';

/**
 * Pill height. Fixed rather than intrinsic so the controls that stack above it
 * (`FloatingPrimaryAction`) and the list paddings that clear it can be derived
 * from one number instead of being re-guessed per screen. `minHeight`, not
 * `height`, so the pill still grows at accessibility text sizes.
 */
export const BOTTOM_SEARCH_BAR_HEIGHT = 44;

/** Gap between the pill and the bottom safe-area edge. */
export const BOTTOM_SEARCH_BAR_MARGIN = 10;

/**
 * Vertical space the bar occupies measured from the bottom of the screen,
 * including the home indicator. Screens that overlay the bar on a scroll view
 * they do not own (Connectors renders inside `SettingsScreenShell`) use this
 * for a trailing spacer so the last row is not hidden underneath it.
 */
export function useBottomSearchBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BOTTOM_SEARCH_BAR_MARGIN + BOTTOM_SEARCH_BAR_HEIGHT;
}

/**
 * Height the software keyboard currently covers, or 0 when it is closed.
 *
 * iOS ONLY, deliberately. React Native does not resize the root window for the
 * iOS keyboard, so a bottom-anchored view stays where it is and the keyboard
 * opens straight over it — which is exactly what happened to this search pill on
 * Chats, Library, Projects and Connectors: focusing the field (the drawer's
 * search glyph even auto-focuses it) put the caret under the keyboard and the
 * user typed blind. Android's default `adjustResize` already shrinks the window,
 * so applying an offset there would double-count and leave a gap.
 *
 * `keyboardWillShow` rather than `keyboardDidShow` so the pill travels with the
 * keyboard animation instead of snapping after it.
 */
export function useKeyboardOverlap(): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const show = Keyboard.addListener('keyboardWillShow', (event) => {
      setOverlap(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return overlap;
}

/**
 * The bottom-anchored search pill shared by every list screen.
 *
 * Both references (Claude's chats list, ChatGPT's Projects/Library) keep search
 * within thumb reach at the bottom of the list rather than at the top, where it
 * costs a screenful of results and drifts out of reach on a long list. Chats
 * shipped that treatment first; Library, Projects and the connectors directory
 * each hand-rolled a top-anchored field instead, so sibling list screens
 * contradicted each other. This is the single implementation.
 *
 * Screens with a list in normal flow render it as the last child of their
 * column (the list shrinks to fit). Screens whose scroll view is owned by a
 * shell render it inside an absolutely-positioned wrapper plus a spacer sized
 * with `useBottomSearchBarSpace()`.
 */
export function BottomSearchBar({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel = 'Clear search',
  inputRef,
  autoFocus = false,
  testID,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  /** Spoken name for the field. Say what is being searched, not just "Search". */
  accessibilityLabel: string;
  clearAccessibilityLabel?: string;
  inputRef?: Ref<TextInput>;
  autoFocus?: boolean;
  testID?: string;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const hasQuery = value.trim().length > 0;

  return (
    <View
      testID={testID}
      style={{
        minHeight: BOTTOM_SEARCH_BAR_HEIGHT,
        marginHorizontal: 16,
        // Clear the home indicator, or the keyboard when it is open. Host
        // screens claim only the top safe-area edge (their lists scroll under
        // the bottom one), so without this the pill sits flush against the
        // screen edge. When the iOS keyboard is up it already covers the home
        // indicator, so its height REPLACES the inset rather than adding to it.
        marginBottom:
          (keyboardOverlap > 0 ? keyboardOverlap : insets.bottom) + BOTTOM_SEARCH_BAR_MARGIN,
        borderRadius: BOTTOM_SEARCH_BAR_HEIGHT / 2,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Search size={17} color={colors.textMuted} />
      <TextInput
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{ flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 0 }}
      />
      {hasQuery ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          hitSlop={8}
        >
          <X size={17} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default BottomSearchBar;
