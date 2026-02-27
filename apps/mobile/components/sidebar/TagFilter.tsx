/**
 * Horizontal scrollable tag filter chips for the sidebar.
 * Shows "All" + one chip per tag from TAG_CATALOG.
 * Selected chip has filled background; unselected is transparent.
 */

import { useCallback } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settingsStore';
import { TAG_CATALOG, type ConversationTag } from '@/services/autotag';
import { formatTagCount } from '@/lib/tagUtils';

interface TagFilterProps {
  selectedTag: ConversationTag | null;
  onSelectTag: (tag: ConversationTag | null) => void;
  tagCounts?: Partial<Record<ConversationTag, number>>;
}

/** A single filter chip with bounce animation on tap. */
function FilterChip({
  label,
  dotColor,
  isSelected,
  count,
  onPress,
}: {
  label: string;
  dotColor: string | null;
  isSelected: boolean;
  count?: number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 400 }, () => {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    });
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  }, [scale, hapticsEnabled, onPress]);

  const countLabel = count !== undefined && count > 0 ? ` (${formatTagCount(count)})` : '';

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={handlePress}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            height: 36,
            paddingHorizontal: 12,
            borderRadius: 18,
            borderWidth: 1,
          },
          isSelected
            ? {
                backgroundColor: dotColor
                  ? `${dotColor}20`
                  : 'rgba(255, 255, 255, 0.12)',
                borderColor: dotColor ?? 'rgba(255, 255, 255, 0.3)',
              }
            : {
                backgroundColor: 'transparent',
                borderColor: 'rgba(255, 255, 255, 0.1)',
              },
        ]}
        accessibilityLabel={`Filter by ${label}`}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
      >
        {dotColor && (
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: dotColor,
            }}
          />
        )}
        <Text
          style={{
            fontSize: 12,
            fontWeight: isSelected ? '600' : '400',
            color: isSelected
              ? dotColor ?? colors.textPrimary
              : colors.textSecondary,
          }}
        >
          {label}{countLabel}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function TagFilter({ selectedTag, onSelectTag, tagCounts }: TagFilterProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: 16,
        gap: 8,
        flexDirection: 'row',
        alignItems: 'center',
      }}
      style={{ flexGrow: 0 }}
    >
      {/* "All" chip */}
      <FilterChip
        label="All"
        dotColor={null}
        isSelected={selectedTag === null}
        onPress={() => onSelectTag(null)}
      />

      {/* One chip per tag */}
      {TAG_CATALOG.map((tag) => (
        <FilterChip
          key={tag.id}
          label={tag.label}
          dotColor={tag.color}
          isSelected={selectedTag === tag.id}
          count={tagCounts?.[tag.id]}
          onPress={() => onSelectTag(tag.id)}
        />
      ))}
    </ScrollView>
  );
}
