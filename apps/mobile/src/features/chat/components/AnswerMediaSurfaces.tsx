import { useCallback, useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent, type ScrollView } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Link } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import { isInAppBrowsableUrl, openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import type { CarouselSpec } from '@agiworkforce/unified-chat/assistant-fence';
import { MarkdownImage } from './MarkdownImage';
import { SideScroller } from './SideScroller';

const WIDE_LAYOUT_MIN_WIDTH = 600;
const CAROUSEL_PEEK = 48;
const COPIED_FEEDBACK_MS = 2000;

function IconControl({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <PressableBox
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: FULL_SCREEN_TOUCH_TARGET,
        height: FULL_SCREEN_TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </PressableBox>
  );
}

function ImageLinkActions({
  src,
  name,
  colors,
}: {
  src: string;
  name: string;
  colors: ColorScheme;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(src);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, [src]);

  if (!isInAppBrowsableUrl(src)) return null;
  return (
    <View style={{ flexDirection: 'row', marginLeft: -spacing.md }}>
      <IconControl
        label={`Open image: ${name}`}
        onPress={() => void openUntrustedUrlInAppBrowser(src)}
      >
        <ArrowUpRight size={18} color={colors.textSecondary} />
      </IconControl>
      <IconControl
        label={copied ? `Copied image URL: ${name}` : `Copy image URL: ${name}`}
        onPress={() => void copy()}
      >
        {copied ? (
          <Check size={18} color={colors.textSecondary} />
        ) : (
          <Link size={18} color={colors.textSecondary} />
        )}
      </IconControl>
    </View>
  );
}

export function GallerySurface({
  items,
  colors,
}: {
  items: readonly { caption: string; src: string; color: string; detail?: string }[];
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
          {item.detail ? (
            <Text selectable style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
              {item.detail}
            </Text>
          ) : null}
          {item.color ? (
            <Text selectable style={{ color: colors.textSecondary, fontSize: typeScale.footnote }}>
              {item.color}
            </Text>
          ) : item.src ? (
            <ImageLinkActions src={item.src} name={item.caption} colors={colors} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function CarouselSurface({ spec, colors }: { spec: CarouselSpec; colors: ColorScheme }) {
  const [frameWidth, setFrameWidth] = useState(0);
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const slideWidth = Math.max(0, frameWidth - CAROUSEL_PEEK);
  const interval = slideWidth + spacing.md;
  const last = spec.items.length - 1;
  const position = Math.min(current, last);

  const goTo = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(next, last));
      setCurrent(target);
      scrollRef.current?.scrollTo({ x: target * interval, animated: true });
    },
    [interval, last],
  );

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
      <SideScroller
        ref={scrollRef}
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
            {item.src ? (
              <ImageLinkActions src={item.src} name={item.title} colors={colors} />
            ) : null}
          </View>
        ))}
      </SideScroller>
      {spec.items.length > 1 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            accessibilityLiveRegion="polite"
            style={{ flex: 1, color: colors.textSecondary, fontSize: typeScale.footnote }}
          >
            {`${position + 1} of ${spec.items.length}`}
          </Text>
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Previous"
            accessibilityState={{ disabled: position === 0 }}
            disabled={position === 0}
            onPress={() => goTo(position - 1)}
            style={{
              width: FULL_SCREEN_TOUCH_TARGET,
              height: FULL_SCREEN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft
              size={20}
              color={position === 0 ? colors.textMuted : colors.textSecondary}
            />
          </PressableBox>
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Next"
            accessibilityState={{ disabled: position === last }}
            disabled={position === last}
            onPress={() => goTo(position + 1)}
            style={{
              width: FULL_SCREEN_TOUCH_TARGET,
              height: FULL_SCREEN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronRight
              size={20}
              color={position === last ? colors.textMuted : colors.textSecondary}
            />
          </PressableBox>
        </View>
      ) : null}
    </View>
  );
}
