import type { Ref } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { useThemeColors } from '@/src/ui/theme';

export const BOTTOM_SEARCH_BAR_HEIGHT = 44;

export const BOTTOM_SEARCH_BAR_MARGIN = 10;

export function useBottomSearchBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BOTTOM_SEARCH_BAR_MARGIN + BOTTOM_SEARCH_BAR_HEIGHT;
}

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
