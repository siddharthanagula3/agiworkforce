import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { ToolSearchResult } from '@/types/chat';
import { CitationChip } from '../CitationChip';
import { WebSearchResultCard } from '../WebSearchResultCard';

const CHIP_THRESHOLD = 3;
const COLLAPSED_COUNT = 5;

interface ResearchSourcesAppendixProps {
  sources: ToolSearchResult[];
}

export function ResearchSourcesAppendix({ sources }: ResearchSourcesAppendixProps) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  if (sources.length === 0) return null;

  const heading = `Sources · ${sources.length}`;

  if (sources.length <= CHIP_THRESHOLD) {
    return (
      <View testID="research-sources-appendix" style={{ gap: 6, marginTop: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted }}>{heading}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {sources.map((source, index) => (
            <CitationChip
              key={`${source.url}-${index}`}
              index={index + 1}
              title={source.title}
              url={source.url}
            />
          ))}
        </View>
      </View>
    );
  }

  const visible = expanded ? sources : sources.slice(0, COLLAPSED_COUNT);
  const hidden = sources.length - visible.length;

  return (
    <View
      testID="research-sources-appendix"
      style={{
        gap: 4,
        marginTop: 6,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        paddingTop: 8,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted }}>{heading}</Text>
      {visible.map((source, index) => (
        <WebSearchResultCard key={`${source.url}-${index}`} result={source} />
      ))}
      {hidden > 0 || expanded ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={
            expanded ? 'Show fewer sources' : `Show all ${sources.length} sources`
          }
          testID="research-sources-toggle"
          hitSlop={6}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
            {expanded ? 'Show fewer' : `Show all ${sources.length}`}
          </Text>
          {expanded ? (
            <ChevronUp size={13} color={colors.textSecondary} />
          ) : (
            <ChevronDown size={13} color={colors.textSecondary} />
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
