import { useState } from 'react';
import { ScrollView, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import type { CarouselSpec } from '@agiworkforce/unified-chat/assistant-fence';
import { MarkdownImage } from './MarkdownImage';

const WIDE_LAYOUT_MIN_WIDTH = 600;
const CAROUSEL_PEEK = 48;

export function GallerySurface({
  items,
  colors,
}: {
  items: readonly { caption: string; src: string; color: string }[];
  colors: ColorScheme;
}) {
  const { width } = useWindowDimensions();
  const columns = width >= WIDE_LAYOUT_MIN_WIDTH ? 2 : 1;
  return (
    <View
      testID="answer-surface-gallery"
      accessibilityLabel="Gallery"
      style={{
        marginVertical: spacing.md,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.xl,
      }}
    >
      {items.map((item, index) => (
        <View
          key={`${index}-${item.src || item.color}`}
          style={{ width: columns === 2 ? '47%' : '100%', gap: spacing.sm }}
        >
          {item.color ? (
            <View
              accessibilityRole="image"
              accessibilityLabel={`${item.caption}, ${item.color}`}
              style={{
                aspectRatio: 1,
                borderRadius: radii.md,
                borderWidth: 1,
                borderColor: colors.borderLight,
                backgroundColor: item.color,
              }}
            />
          ) : item.src ? (
            <MarkdownImage src={item.src} alt={item.caption} colors={colors} />
          ) : null}
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
            {item.caption}
          </Text>
          {item.color ? (
            <Text selectable style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
              {item.color}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function CarouselSurface({ spec, colors }: { spec: CarouselSpec; colors: ColorScheme }) {
  const [frameWidth, setFrameWidth] = useState(0);
  const [current, setCurrent] = useState(0);
  const slideWidth = Math.max(0, frameWidth - CAROUSEL_PEEK);
  const interval = slideWidth + spacing.md;
  return (
    <View
      testID="answer-surface-carousel"
      accessibilityLabel={spec.title || 'Carousel'}
      onLayout={(event: LayoutChangeEvent) => setFrameWidth(event.nativeEvent.layout.width)}
      style={{ marginVertical: spacing.md, gap: spacing.md }}
    >
      {spec.title ? (
        <Text
          accessibilityRole="header"
          style={{ color: colors.textPrimary, fontSize: typeScale.headline, fontWeight: '600' }}
        >
          {spec.title}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={interval > 0 ? interval : undefined}
        decelerationRate="fast"
        onMomentumScrollEnd={(event) => {
          if (interval <= 0) return;
          setCurrent(Math.round(event.nativeEvent.contentOffset.x / interval));
        }}
        contentContainerStyle={{ gap: spacing.md }}
      >
        {spec.items.map((item, index) => (
          <View
            key={`${index}-${item.title}`}
            accessibilityLabel={`${index + 1} of ${spec.items.length}: ${item.title}`}
            style={{
              width: slideWidth,
              gap: spacing.sm,
              padding: spacing.lg,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: radii.lg,
              backgroundColor: colors.background,
            }}
          >
            {item.src ? <MarkdownImage src={item.src} alt={item.title} colors={colors} /> : null}
            <Text
              style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '600' }}
            >
              {item.title}
            </Text>
            {item.text ? (
              <Text style={{ color: colors.textSecondary, fontSize: typeScale.body }}>
                {item.text}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
      {spec.items.length > 1 ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}
        >
          {`${Math.min(current, spec.items.length - 1) + 1} of ${spec.items.length}`}
        </Text>
      ) : null}
    </View>
  );
}
