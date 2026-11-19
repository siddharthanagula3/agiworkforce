import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';

export function PrivacyCenterSection({ title, children }: { title: string; children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View style={{ marginBottom: 18 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          textTransform: 'uppercase',
          marginBottom: 8,
          paddingHorizontal: 2,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export const CAROUSEL_GUTTER = spacing.lg;
export const CAROUSEL_GAP = spacing.md;
