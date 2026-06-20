import { View } from 'react-native';
import { AgiMark } from '@/components/ui/AgiMark';

/**
 * Animated typing indicator shown while the assistant is generating
 * a response but no tokens have arrived yet.
 * Renders the AGI brand mark logo spinning.
 */
export function TypingIndicator() {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
      accessibilityLabel="Assistant is typing"
      accessibilityRole="progressbar"
    >
      <AgiMark size={20} spinning={true} />
    </View>
  );
}
