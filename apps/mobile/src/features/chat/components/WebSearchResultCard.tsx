import { View, Pressable, Linking } from 'react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors, type ColorScheme } from '@/src/ui/theme';
import { isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import type { ToolSearchResult } from '@/types/chat';

/**
 * Five accent tokens, so a domain keeps a stable badge colour that still tracks
 * the active theme — the previous fixed hex palette read as a foreign,
 * over-saturated set of hues against the dark surfaces.
 *
 * Five, not six: the palette must stay distinct in BOTH themes, and the theme
 * has only five separated hues. `purple` is deliberately excluded — it is
 * '#a78bfa' in the dark palette, byte-identical to `agentThinking`, so
 * including it would collapse two badge slots onto one colour in dark mode.
 * Anything added here must differ from every other entry in both palettes.
 */
function badgePalette(colors: ColorScheme): readonly string[] {
  return [
    colors.agentActive,
    colors.agentError,
    colors.agentSuccess,
    colors.agentWarning,
    colors.agentThinking,
  ];
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function badgeColorFor(hostname: string, colors: ColorScheme): string {
  const palette = badgePalette(colors);
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) hash = (hash * 31 + hostname.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
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
    // No `style` prop on Pressable — see MOBILE-PRESSABLE-CSSINTEROP-FLEXDIR-01
    // (docs/agent-context/known-flaws.md): a function-style `style` prop
    // silently drops flexDirection/alignItems/padding in this stack, which
    // would stack the badge above the title instead of beside it.
    // `children`-as-function keeps pressed state while every real style
    // lives on a plain View.
    <Pressable
      onPress={handlePress}
      accessibilityRole="link"
      accessibilityLabel={`${result.title}, ${hostname}`}
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
          <Text numberOfLines={1} style={{ fontSize: 11, color: colors.textMuted, flexShrink: 0 }}>
            {hostname}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
