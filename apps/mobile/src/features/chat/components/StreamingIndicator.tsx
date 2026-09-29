import { View } from 'react-native';
import { AgiMark } from '@/components/ui/AgiMark';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function StreamingIndicator({ label }: { label?: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        marginLeft: 2,
        minHeight: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
      accessible={true}
      accessibilityLabel={label ?? 'Generating response'}
      accessibilityRole="progressbar"
    >
      <AgiMark size={16} spinning={true} />
      {label ? (
        <Text style={{ fontSize: typeScale.footnote, color: colors.textMuted }}>{label}</Text>
      ) : null}
    </View>
  );
}
