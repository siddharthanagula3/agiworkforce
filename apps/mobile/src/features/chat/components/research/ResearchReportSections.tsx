import { useMemo } from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { ChevronDown, ChevronRight, List } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { extractReportSections } from '@/src/features/research/reportSections';

const MIN_SECTIONS = 3;

interface ResearchReportSectionsProps {
  content: string;
  messageId?: string;
  defaultExpanded?: boolean;
  onSelectSection?: (sectionId: string) => void;
}

export function ResearchReportSections({
  content,
  messageId,
  defaultExpanded = false,
  onSelectSection,
}: ResearchReportSectionsProps) {
  const sections = useMemo(() => extractReportSections(content), [content]);
  const [expanded, setExpanded] = useRecyclingState(defaultExpanded, [messageId ?? content]);
  const colors = useThemeColors();

  if (sections.length < MIN_SECTIONS) return null;
  const baseLevel = sections[0]?.level ?? 1;

  return (
    <View
      testID="research-report-sections"
      style={{
        marginTop: 6,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radii.md,
        backgroundColor: colors.surfaceBase,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <PressableBox
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? 'Hide report sections' : `Show ${sections.length} report sections`
        }
        accessibilityState={{ expanded }}
        testID="research-report-sections-toggle"
        hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}
      >
        <List size={13} color={colors.textMuted} />
        <Text
          style={{
            flex: 1,
            fontSize: typeScale.caption,
            fontWeight: '600',
            color: colors.textSecondary,
          }}
        >
          {`Sections · ${sections.length}`}
        </Text>
        {expanded ? (
          <ChevronDown size={14} color={colors.textMuted} />
        ) : (
          <ChevronRight size={14} color={colors.textMuted} />
        )}
      </PressableBox>

      {expanded ? (
        <View style={{ paddingBottom: 4 }}>
          {sections.map((section) => {
            const indent = Math.max(0, section.level - baseLevel) * 12;
            const label = (
              <Text
                style={{
                  fontSize: typeScale.caption,
                  lineHeight: 19,
                  color: onSelectSection ? colors.textPrimary : colors.textSecondary,
                }}
              >
                {section.text}
              </Text>
            );
            return onSelectSection ? (
              <PressableBox
                key={section.id}
                onPress={() => onSelectSection(section.id)}
                accessibilityRole="button"
                accessibilityLabel={`Go to ${section.text}`}
                hitSlop={6}
                style={{ minHeight: 32, justifyContent: 'center', paddingLeft: indent }}
              >
                {label}
              </PressableBox>
            ) : (
              <View key={section.id} style={{ paddingLeft: indent }}>
                {label}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
