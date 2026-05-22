/**
 * Small tag badge shown on ConversationItem.
 * 'sm' = colored dot only (compact list views).
 * 'md' = colored dot + label text.
 * Renders nothing for 'general' tag (don't show generic tags).
 */

import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { getTagInfo, type ConversationTag } from '@/services/autotag';

interface AutoTagBadgeProps {
  tag: ConversationTag;
  size?: 'sm' | 'md';
}

export function AutoTagBadge({ tag, size = 'md' }: AutoTagBadgeProps) {
  // Don't render anything for the generic 'general' tag
  if (tag === 'general') return null;

  const info = getTagInfo(tag);

  if (size === 'sm') {
    return (
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: info.color,
        }}
        accessibilityLabel={info.label}
      />
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: info.color,
        }}
      />
      <Text
        style={{
          fontSize: 10,
          fontWeight: '500',
          color: info.color,
        }}
      >
        {info.label}
      </Text>
    </View>
  );
}
