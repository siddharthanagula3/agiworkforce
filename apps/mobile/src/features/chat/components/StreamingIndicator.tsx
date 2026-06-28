import { View } from 'react-native';
import { AgiMark } from '@/components/ui/AgiMark';

/**
 * Brand-distinctive AGI Workforce loading indicator: spinning AgiMark logo,
 * shown inside the assistant bubble while a reply is generating.
 *
 * MUST be a <View>, not a <Text>: AgiMark renders an `Animated.View` wrapping an
 * `<Svg>`, and nesting a view/SVG inside a React Native <Text> does not render on
 * iOS — the spinner silently collapses to nothing (which is exactly why the
 * in-flight indicator was invisible during streaming). The sibling
 * `TypingIndicator` correctly uses a <View> for the same mark, with the
 * `progressbar` accessibility role (the correct semantics for a loading spinner;
 * the old `text` role only existed because the wrapper used to be a <Text>).
 */
export function StreamingIndicator() {
  return (
    <View
      style={{
        marginLeft: 2,
        width: 20,
        height: 20,
      }}
      accessible={true}
      accessibilityLabel="Generating response"
      accessibilityRole="progressbar"
    >
      <AgiMark size={16} spinning={true} />
    </View>
  );
}
