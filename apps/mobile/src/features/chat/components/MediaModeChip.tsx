
import { View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { Film, Paintbrush, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import type { MediaMode } from '@/stores/chat/chatViewStore';

export interface MediaModeChipProps {
  mode: Exclude<MediaMode, 'text'>;
  modelName?: string | null;
  onExit: () => void;
}

export function MediaModeChip({ mode, modelName, onExit }: MediaModeChipProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const Icon = mode === 'video' ? Film : Paintbrush;
  const label = mode === 'video' ? 'Video' : 'Image';

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(180)}
      exiting={reducedMotion ? undefined : FadeOut.duration(120)}
      style={{ flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 6 }}
    >
      <View
        testID="media-mode-chip"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 10,
          paddingRight: 4,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: colors.accentSurface,
          borderWidth: 1,
          borderColor: colors.accentBorder,
        }}
      >
        <Icon size={13} color={colors.teal} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>{label}</Text>
        {modelName ? (
          <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
            {modelName}
          </Text>
        ) : null}
        <Pressable
          onPress={onExit}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Leave ${label.toLowerCase()} mode and return to text chat`}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={13} color={colors.textMuted} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default MediaModeChip;
