import { View } from 'react-native';
import { AgiMark } from '@/components/ui/AgiMark';

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
