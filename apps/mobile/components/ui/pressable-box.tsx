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
