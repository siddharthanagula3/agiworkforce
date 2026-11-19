import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Globe } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  canOpenSource,
  openSource,
  sourcePublisher,
} from '@/src/features/chat/utils/sourceDisplay';
import type { ToolSearchResult } from '@/types/chat';
import { formatSourcePublishedDate } from '@/src/features/chat/utils/sourcePublishedDate';

function badgePalette(colors: ColorScheme): readonly string[] {
  return [
    colors.agentActive,
    colors.agentError,
    colors.agentSuccess,
    colors.agentWarning,
    colors.agentThinking,
  ];
}

function badgeColorFor(hostname: string, colors: ColorScheme): string {
  const palette = badgePalette(colors);
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) hash = (hash * 31 + hostname.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
}

export function WebSearchResultCard({ result }: { result: ToolSearchResult }) {
  const colors = useThemeColors();
  const hostname = sourcePublisher(result);
  const published = formatSourcePublishedDate(result.publishedDate);
  const canOpen = canOpenSource(result.url);

  return (
    <PressableBox
      onPress={canOpen ? () => void openSource(result.url) : undefined}
      disabled={!canOpen}
      accessibilityRole={canOpen ? 'link' : 'text'}
      accessibilityLabel={[result.title, `web page on ${hostname}`, published]
        .filter(Boolean)
        .join(', ')}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 44,
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 8,
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: badgeColorFor(hostname, colors),
            }}
          >
            <Text
              style={{ color: colors.accentText, fontSize: typeScale.caption, fontWeight: '700' }}
            >
              {hostname.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: typeScale.caption, color: colors.textPrimary, fontWeight: '500' }}
            >
              {result.title}
            </Text>
            {result.snippet ? (
              <Text
                numberOfLines={2}
                style={{ fontSize: typeScale.caption, color: colors.textSecondary }}
              >
                {result.snippet}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Globe size={11} color={colors.textMuted} />
              <Text
                numberOfLines={1}
                style={{ fontSize: typeScale.caption, color: colors.textMuted }}
              >
                {hostname}
              </Text>
            </View>
            {published ? (
              <Text
                numberOfLines={1}
                style={{ fontSize: typeScale.caption, color: colors.textMuted }}
              >
                {published}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </PressableBox>
  );
}
