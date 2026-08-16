import { View } from 'react-native';
import { AgiMark } from '@/components/ui/AgiMark';

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
