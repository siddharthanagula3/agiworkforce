import type { Ref } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, TextInput, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const BOTTOM_SEARCH_BAR_HEIGHT = 44;

export const BOTTOM_SEARCH_BAR_MARGIN = 10;

export function useBottomSearchBarSpace(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + BOTTOM_SEARCH_BAR_MARGIN + BOTTOM_SEARCH_BAR_HEIGHT;
}

/**
 * The Android window is edge to edge and never resizes for the keyboard, so the
 * bar lifts itself there too. Android reports the keyboard height above the
 * navigation bar, while iOS measures it from the bottom of the screen.
 */
export function useKeyboardOverlap(): number {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardHeight === 0 || Platform.OS === 'ios') return keyboardHeight;
  return keyboardHeight + insets.bottom;
}

export function BottomSearchBar({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel = 'Clear search',
  inputRef,
  autoFocus = false,
  onSubmitEditing,
  testID,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  clearAccessibilityLabel?: string;
  inputRef?: Ref<TextInput>;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
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
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={{
          flex: 1,
          color: colors.textPrimary,
          fontSize: typeScale.subhead,
          paddingVertical: 0,
        }}
      />
      {hasQuery ? (
        <PressableBox
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          hitSlop={8}
        >
          <X size={17} color={colors.textMuted} />
        </PressableBox>
      ) : null}
    </View>
  );
}

export default BottomSearchBar;
