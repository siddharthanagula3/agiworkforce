import { Text } from 'react-native';
import { AgiMark } from '@/components/ui/AgiMark';

/**
 * Brand-distinctive AGI Workforce loading indicator: spinning AgiMark logo.
 * Replaced the sparkles/spark emoji to render only the spinning AGI mark inside the bubble.
 * Uses <Text> to maintain the standard "text" accessibility role in testing.
 */
export function StreamingIndicator() {
  return (
    <Text
      style={{
        marginLeft: 2,
        width: 20,
        height: 20,
      }}
      accessibilityLabel="Generating response"
      accessibilityRole="text"
    >
      <AgiMark size={16} spinning={true} />
    </Text>
  );
}
