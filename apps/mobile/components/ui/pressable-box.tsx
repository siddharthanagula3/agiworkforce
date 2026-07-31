import { useCallback, useState } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type StyleFn = (state: { pressed: boolean }) => StyleProp<ViewStyle>;

export interface PressableBoxProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle> | StyleFn;
}

/**
 * Drop-in `Pressable` that keeps function-form `style` working under NativeWind.
 *
 * `babel.config.js` sets `jsxImportSource: 'nativewind'`, so every element is
 * created through NativeWind's JSX runtime. Its cssInterop reads `style` as a
 * *value* — when the prop is React Native's `({ pressed }) => style` callback,
 * the callback is never invoked and the resolved styles are dropped entirely.
 * The element then renders with no styling at all: cards lose their background,
 * radius and margins; absolutely-positioned buttons collapse into flow layout.
 *
 * Plain-object `style` on `Pressable` is unaffected, which is why the breakage
 * looks arbitrary — two Pressables in the same file behave differently based
 * only on the form of the prop.
 *
 * This wrapper tracks `pressed` itself and hands React Native a plain style, so
 * NativeWind only ever sees a resolved value. Call sites keep the idiomatic
 * `style={({ pressed }) => ({ ... })}` signature.
 */
export function PressableBox({
  style,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: PressableBoxProps) {
  const [pressed, setPressed] = useState(false);

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(true);
      onPressIn?.(event);
    },
    [onPressIn],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      setPressed(false);
      onPressOut?.(event);
    },
    [onPressOut],
  );

  const resolvedStyle =
    typeof style === 'function' ? style({ pressed: pressed && !disabled }) : style;

  return (
    <Pressable
      {...rest}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={resolvedStyle}
    />
  );
}

export default PressableBox;
