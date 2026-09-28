import { Alert, View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { hostnameOf, isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import type { ToolSearchResult } from '@/types/chat';

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

function publishedLabel(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.length > 32 ? null : value;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function WebSearchResultCard({ result }: { result: ToolSearchResult }) {
  const colors = useThemeColors();
  const hostname = hostnameOf(result.url);
  const published = publishedLabel(result.publishedDate);

  const handlePress = async () => {
    if (isValidExternalHttpUrl(result.url)) {
      const opened = await openUntrustedUrlInAppBrowser(result.url);
      if (!opened) {
        Alert.alert('Could not open source', 'Check your connection and try again.');
      }
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={[result.title, hostname, published].filter(Boolean).join(', ')}
    >
      {({ pressed }) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
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
            <Text style={{ color: colors.accentText, fontSize: 10, fontWeight: '700' }}>
              {hostname.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontSize: 12.5, color: colors.textPrimary, fontWeight: '500' }}
            >
              {result.title}
            </Text>
            {result.snippet ? (
              <Text numberOfLines={2} style={{ fontSize: 11, color: colors.textSecondary }}>
                {result.snippet}
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>
              {hostname}
            </Text>
            {published ? (
              <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted }}>
                {published}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}
