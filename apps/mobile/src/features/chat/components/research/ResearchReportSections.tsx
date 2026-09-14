import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronRight, List } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { extractReportSections } from '@/src/features/research/reportSections';

const MIN_SECTIONS = 3;

interface ResearchReportSectionsProps {
  content: string;
  defaultExpanded?: boolean;
}

export function ResearchReportSections({
  content,
  defaultExpanded = false,
}: ResearchReportSectionsProps) {
  const sections = useMemo(() => extractReportSections(content), [content]);
  const [expanded, setExpanded] = useState(defaultExpanded);
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
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? 'Hide report sections' : `Show ${sections.length} report sections`
        }
        accessibilityState={{ expanded }}
        testID="research-report-sections-toggle"
        hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 }}
      >
        <List size={13} color={colors.textMuted} />
        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
          {`Sections · ${sections.length}`}
        </Text>
        {expanded ? (
          <ChevronDown size={14} color={colors.textMuted} />
        ) : (
          <ChevronRight size={14} color={colors.textMuted} />
        )}
      </Pressable>

      {expanded ? (
        <View style={{ paddingBottom: 4 }}>
          {sections.map((section) => (
            <Text
              key={section.id}
              style={{
                fontSize: 12,
                lineHeight: 19,
                color: colors.textSecondary,
                paddingLeft: Math.max(0, section.level - baseLevel) * 12,
              }}
            >
              {section.text}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
