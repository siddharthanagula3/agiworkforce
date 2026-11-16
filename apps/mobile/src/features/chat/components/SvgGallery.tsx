import { useState } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { radii, spacing, typeScale } from '@/src/ui/theme/tokens';
import { SafeArtifactPreview } from './SafeArtifactPreview';

const PICTURE_HEIGHT = 256;

interface SvgGalleryProps {
  slides: readonly string[];
}

/** SVG pictures from a reply, drawn script-free and offline in the static preview sandbox. */
export function SvgGallery({ slides }: SvgGalleryProps) {
  const colors = useThemeColors();
  const [index, setIndex] = useState(0);
  if (slides.length === 0) return null;
  const current = Math.min(index, slides.length - 1);
  const several = slides.length > 1;

  const step = (label: string, spoken: string, disabled: boolean, onPress: () => void) => (
    <PressableBox
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled }}
      style={{
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: spacing.md,
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textSecondary }}
      >
        {label}
      </Text>
    </PressableBox>
  );

  return (
    <View
      testID="svg-gallery"
      accessibilityLabel={several ? `Picture ${current + 1} of ${slides.length}` : 'Picture'}
      style={{ marginVertical: spacing.sm }}
    >
      <View
        style={{
          height: PICTURE_HEIGHT,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <SafeArtifactPreview
          key={current}
          content={slides[current]!}
          kind="svg"
          style={{ flex: 1 }}
          scrollEnabled={false}
        />
      </View>
      {several ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: spacing.xs,
          }}
        >
          {step('Prev', 'Previous picture', current === 0, () =>
            setIndex(Math.max(0, current - 1)),
          )}
          <Text
            testID="svg-gallery-counter"
            style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}
          >
            {`${current + 1} / ${slides.length}`}
          </Text>
          {step('Next', 'Next picture', current === slides.length - 1, () =>
            setIndex(Math.min(slides.length - 1, current + 1)),
          )}
        </View>
      ) : null}
    </View>
  );
}
