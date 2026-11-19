import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { chatTypography, radii, typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';

export function PendingSendBubble({ text }: { text: string }) {
  const colors = useThemeColors();
  return (
    <View
      testID="chat.pending-send"
      accessibilityLabel={`Your message: ${text}. Sending`}
      style={[
        contentColumn('reading'),
        { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 6 },
      ]}
    >
      <View
        style={{
          alignSelf: 'flex-end',
          maxWidth: '85%',
          backgroundColor: colors.surfaceHover,
          borderRadius: radii['2xl'],
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        <Text selectable style={{ ...chatTypography.body, color: colors.textPrimary }}>
          {text}
        </Text>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={{ alignSelf: 'flex-end', fontSize: typeScale.caption, color: colors.textMuted }}
      >
        Sending
      </Text>
    </View>
  );
}
