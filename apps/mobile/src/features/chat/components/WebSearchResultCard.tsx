import { View, Pressable, Linking } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import type { ToolSearchResult } from '@/types/chat';

const BADGE_PALETTE = ['#5B8DEF', '#E4572E', '#17A398', '#A45EE5', '#F2A007', '#DA4167'];

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function badgeColorFor(hostname: string): string {
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) hash = (hash * 31 + hostname.charCodeAt(i)) >>> 0;
  return BADGE_PALETTE[hash % BADGE_PALETTE.length]!;
}

/**
 * Inline web-search result row (favicon-style initial badge + title + domain),
 * matching the reference Claude UI's search-result cards. Renders a colored
 * initial badge rather than fetching a real favicon — pulling per-domain
 * favicons from a third-party CDN would be a new, undocumented egress path
 * for a chat surface that's otherwise careful about what leaves the device.
 */
export function WebSearchResultCard({ result }: { result: ToolSearchResult }) {
  const colors = useThemeColors();
  const hostname = hostnameOf(result.url);

  const handlePress = () => {
    if (isValidExternalHttpUrl(result.url)) {
      Linking.openURL(result.url).catch(() => undefined);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`${result.title}, ${hostname}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: pressed ? colors.surfaceHover : 'transparent',
      })}
    >
      <View
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: badgeColorFor(hostname),
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '700' }}>
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
      <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted, flexShrink: 0 }}>
        {hostname}
      </Text>
    </Pressable>
  );
}
