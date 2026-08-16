
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { getTagInfo, type ConversationTag } from '@/services/autotag';

interface AutoTagBadgeProps {
  tag: ConversationTag;
  size?: 'sm' | 'md';
}

export function AutoTagBadge({ tag, size = 'md' }: AutoTagBadgeProps) {
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
