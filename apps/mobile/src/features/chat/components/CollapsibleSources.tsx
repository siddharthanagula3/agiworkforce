import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Paperclip, Globe, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react-native';
import type { AgentEventSource } from '@agiworkforce/types';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/src/ui/theme';
import { motion, typeScale } from '@/src/ui/theme/tokens';
import { isValidExternalHttpUrl } from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';
import { translatePlural } from '@/src/i18n/plural';

interface CollapsibleSourcesProps {
  sources: AgentEventSource[];
}

const SOURCE_ROW_HEIGHT = 64;
const SOURCE_ROW_WITH_SNIPPET_HEIGHT = 104;

function getDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function CollapsibleSources({ sources }: CollapsibleSourcesProps) {
  const { colors: themeColors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const animatedHeight = useSharedValue(0);

  const cardBg = themeColors.inputSurface;
  const hoverBg = themeColors.surfaceHover;

  const toggleExpanded = useCallback(() => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    animatedHeight.value = withTiming(nextExpanded ? 1 : 0, {
      duration: motion.moved,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
    });
  }, [expanded, animatedHeight]);

  const listHeight = sources.reduce(
    (height, source) =>
      height + (source.snippet ? SOURCE_ROW_WITH_SNIPPET_HEIGHT : SOURCE_ROW_HEIGHT),
    8,
  );
  const listStyle = useAnimatedStyle(() => ({
    opacity: animatedHeight.value,
    maxHeight: animatedHeight.value * listHeight,
    overflow: 'hidden' as const,
  }));

  const handleSourcePress = useCallback((url: string) => {
    if (isValidExternalHttpUrl(url)) {
      void openUntrustedUrlInAppBrowser(url);
    }
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
      <PressableBox
        onPress={toggleExpanded}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 12,
        }}
        accessibilityLabel={
          expanded
            ? `Hide ${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`
            : `View ${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`
        }
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Paperclip size={14} color={themeColors.textMuted} />
          <Text
            style={{
              fontSize: typeScale.footnote,
              fontWeight: '500',
              color: themeColors.textSecondary,
            }}
          >
            {expanded
              ? 'Sources'
              : translatePlural('chat', 'counts.viewSources', sources.length, {
                  one: 'View {{count}} source',
                  other: 'View {{count}} sources',
                })}
          </Text>
        </View>
        {expanded ? (
          <ChevronDown size={16} color={themeColors.textMuted} />
        ) : (
          <ChevronRight size={16} color={themeColors.textMuted} />
        )}
      </PressableBox>

      {/* Expandable source list */}
      <Animated.View style={listStyle}>
        <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 2 }}>
          {sources.map((source, index) => (
            <PressableBox
              key={`source-${index}`}
              onPress={() => handleSourcePress(source.url)}
              accessibilityLabel={`Source ${index + 1}: ${source.title || getDomain(source.url)}`}
              accessibilityRole="link"
              accessibilityHint="Opens in the in-app browser"
            >
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    backgroundColor: pressed ? hoverBg : themeColors.transparent,
                  }}
                >
                  {/* Number badge */}
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      backgroundColor: themeColors.accentSurface,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 1,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: typeScale.caption,
                        fontWeight: '700',
                        color: themeColors.teal,
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
                          fontSize: typeScale.caption,
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
                          fontSize: typeScale.footnote,
                          color: themeColors.textSecondary,
                        }}
                        numberOfLines={2}
                      >
                        {source.title}
                      </Text>
                    )}
                    {source.snippet ? (
                      <Text
                        style={{
                          fontSize: typeScale.caption,
                          lineHeight: 17,
                          color: themeColors.textMuted,
                        }}
                        numberOfLines={2}
                      >
                        {source.snippet}
                      </Text>
                    ) : null}
                  </View>

                  {/* External link indicator */}
                  <ExternalLink size={12} color={themeColors.textMuted} style={{ marginTop: 3 }} />
                </View>
              )}
            </PressableBox>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}
