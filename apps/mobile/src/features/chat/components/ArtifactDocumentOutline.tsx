import { View } from 'react-native';
import { ChevronDown, ChevronRight, List } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { spacing, typeScale } from '@/src/ui/theme/tokens';
import { FULL_SCREEN_TOUCH_TARGET } from '@/src/features/chat/chrome/fullScreenChrome';
import type { ReportSection } from '@/src/features/research/reportSections';

export const OUTLINE_MIN_HEADINGS = 3;

interface ArtifactDocumentOutlineProps {
  sections: readonly ReportSection[];
  open: boolean;
  onToggle: () => void;
  onSelect: (sectionId: string) => void;
}

export function ArtifactDocumentOutline({
  sections,
  open,
  onToggle,
  onSelect,
}: ArtifactDocumentOutlineProps) {
  const colors = useThemeColors();
  if (sections.length < OUTLINE_MIN_HEADINGS) return null;
  const topLevel = sections[0]?.level ?? 1;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <View style={{ marginBottom: spacing.md }} testID="artifact-document-outline">
      <PressableBox
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Outline, ${sections.length} sections`}
        accessibilityState={{ expanded: open }}
        style={{
          minHeight: FULL_SCREEN_TOUCH_TARGET,
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.xs,
          alignSelf: 'flex-start',
        }}
      >
        <List size={14} color={colors.textMuted} />
        <Text
          style={{ fontSize: typeScale.footnote, fontWeight: '500', color: colors.textSecondary }}
        >
          {`Outline · ${sections.length}`}
        </Text>
        <Chevron size={14} color={colors.textMuted} />
      </PressableBox>
      {open ? (
        <View testID="artifact-document-outline-list">
          {sections.map((section) => (
            <PressableBox
              key={section.id}
              onPress={() => onSelect(section.id)}
              accessibilityRole="button"
              accessibilityLabel={`Go to ${section.text}`}
              style={{
                minHeight: FULL_SCREEN_TOUCH_TARGET,
                justifyContent: 'center',
                paddingLeft: Math.max(0, section.level - topLevel) * spacing.md,
              }}
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}
              >
                {section.text}
              </Text>
            </PressableBox>
          ))}
        </View>
      ) : null}
    </View>
  );
}
