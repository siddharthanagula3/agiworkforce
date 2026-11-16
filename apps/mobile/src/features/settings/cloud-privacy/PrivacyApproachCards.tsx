import type { LucideIcon } from 'lucide-react-native';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { radii, typeScale } from '@/src/ui/theme/tokens';
import { CAROUSEL_GAP, CAROUSEL_GUTTER, PrivacyCenterSection } from './PrivacyCenterSection';

export interface PrivacyApproachItem {
  key: string;
  label: string;
  body: string;
  icon: LucideIcon;
}

const CARD_WIDTH_SHARE = 0.8;

export function PrivacyApproachCards({ items }: { items: readonly PrivacyApproachItem[] }) {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(width * CARD_WIDTH_SHARE);

  return (
    <PrivacyCenterSection title="Our approach to privacy">
      <ScrollView
        testID="privacy-approach-cards"
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + CAROUSEL_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        style={{ marginHorizontal: -CAROUSEL_GUTTER }}
        contentContainerStyle={{ paddingHorizontal: CAROUSEL_GUTTER, gap: CAROUSEL_GAP }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <View
              key={item.key}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${item.label}. ${item.body}`}
              style={{
                width: cardWidth,
                borderRadius: radii.md,
                backgroundColor: colors.surfaceElevated,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 14,
                gap: 10,
              }}
            >
              <Icon size={20} color={colors.textSecondary} />
              <Text
                style={{
                  color: colors.textPrimary,
                  fontSize: typeScale.subhead,
                  fontWeight: '600',
                }}
              >
                {item.label}
              </Text>
              <Text
                style={{
                  color: colors.textSecondary,
                  fontSize: typeScale.footnote,
                  lineHeight: 18,
                }}
              >
                {item.body}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </PrivacyCenterSection>
  );
}
