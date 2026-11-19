import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import type { ColorScheme } from '@/src/ui/theme';
import { chatTypography, spacing } from '@/src/ui/theme/tokens';

const DISCLOSURE_ICON_SIZE = 16;
const DISCLOSURE_MIN_HEIGHT = 44;

export function MarkdownDetails({
  summary,
  summaryText,
  initiallyOpen,
  colors,
  children,
}: {
  summary: ReactNode;
  summaryText: string;
  initiallyOpen: boolean;
  colors: ColorScheme;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View testID="markdown-details" style={{ marginVertical: spacing.xs }}>
      <Pressable
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={summaryText}
        accessibilityState={{ expanded: open }}
        style={{
          minHeight: DISCLOSURE_MIN_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
        }}
      >
        <Chevron size={DISCLOSURE_ICON_SIZE} color={colors.textSecondary} />
        <Text style={{ ...chatTypography.body, color: colors.textPrimary, flex: 1 }}>
          {summary}
        </Text>
      </Pressable>
      {open ? (
        <View testID="markdown-details-body" style={{ paddingLeft: spacing.xl }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}
