import { useCallback, useState } from 'react';
import { View, Pressable, Linking } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Paperclip, Globe, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/useTheme';
import { colors } from '@/lib/theme';

interface Source {
  url: string;
  title?: string;
  snippet?: string;
}

interface CollapsibleSourcesProps {
  sources: Source[];
}

function getDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Collapsible sources/citations block.
 *
 * Collapsed: shows "View N sources" with a chevron.
 * Expanded: shows numbered list of sources with domain, title, and tap-to-open.
 *
 * Rendered at the end of an AI message when `message.citations` exists.
 */
export function CollapsibleSources({ sources }: CollapsibleSourcesProps) {
  const { colors: themeColors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const animatedHeight = useSharedValue(0);

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';

  const toggleExpanded = useCallback(() => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    animatedHeight.value = withTiming(nextExpanded ? 1 : 0, {
      duration: 250,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [expanded, animatedHeight]);

  const listStyle = useAnimatedStyle(() => ({
    opacity: animatedHeight.value,
    maxHeight: animatedHeight.value * (sources.length * 64 + 8),
    overflow: 'hidden' as const,
  }));

  const handleSourcePress = useCallback((url: string) => {
    Linking.openURL(url);
  }, []);

  if (sources.length === 0) return null;

  return (
    <View
      style={{
        marginTop: 8,
        borderRadius: 10,
        backgroundColor: cardBg,
        overflow: 'hidden',
      }}
    >
      {/* Toggle header */}
      <Pressable
        onPress={toggleExpanded}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 12,
        }}
        accessibilityLabel={
          expanded ? `Hide ${sources.length} sources` : `View ${sources.length} sources`
        }
        accessibilityRole="button"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Paperclip size={14} color={themeColors.textMuted} />
          <Text
            style={{
              fontSize: 13,
              fontWeight: '500',
              color: themeColors.textSecondary,
            }}
          >
            {expanded
              ? 'Sources'
              : `View ${sources.length} source${sources.length === 1 ? '' : 's'}`}
          </Text>
        </View>
        {expanded ? (
          <ChevronDown size={16} color={themeColors.textMuted} />
        ) : (
          <ChevronRight size={16} color={themeColors.textMuted} />
        )}
      </Pressable>

      {/* Expandable source list */}
      <Animated.View style={listStyle}>
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 2 }}>
          {sources.map((source, index) => (
            <Pressable
              key={`source-${index}`}
              onPress={() => handleSourcePress(source.url)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                paddingVertical: 8,
                paddingHorizontal: 8,
                borderRadius: 8,
                backgroundColor: pressed ? hoverBg : 'transparent',
              })}
              accessibilityLabel={`Source ${index + 1}: ${source.title ?? getDomain(source.url)}`}
              accessibilityRole="link"
              accessibilityHint="Opens in browser"
            >
              {/* Number badge */}
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  backgroundColor: 'rgba(33, 128, 141, 0.15)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.teal,
                  }}
                >
                  {index + 1}
                </Text>
              </View>

              {/* Source info */}
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Globe size={12} color={themeColors.textMuted} />
                  <Text
                    style={{
                      fontSize: 11,
                      color: themeColors.textMuted,
                    }}
                    numberOfLines={1}
                  >
                    {getDomain(source.url)}
                  </Text>
                </View>
                {source.title && (
                  <Text
                    style={{
                      fontSize: 13,
                      color: themeColors.textSecondary,
                    }}
                    numberOfLines={2}
                  >
                    {source.title}
                  </Text>
                )}
              </View>

              {/* External link indicator */}
              <ExternalLink size={12} color={themeColors.textMuted} style={{ marginTop: 3 }} />
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
