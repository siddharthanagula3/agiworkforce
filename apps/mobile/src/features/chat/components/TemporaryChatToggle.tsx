import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { EyeOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/src/ui/theme';

/**
 * Small icon button placed in the ChatInput toolbar.
 * When tapped, toggles temporary-chat mode in the settings store.
 * In active state shows a purple EyeOff icon and a "Temporary" label.
 * Tooltip/hint is provided via accessibilityHint.
 */
export function TemporaryChatToggle() {
  const { colors } = useTheme();
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);

  const handlePress = () => {
    setTemporaryChat(!isTemporaryChat);
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: isTemporaryChat ? 8 : 6,
        paddingVertical: 6,
        borderRadius: 10,
        backgroundColor: isTemporaryChat ? colors.purpleSurface : colors.transparent,
      }}
      accessible={true}
      accessibilityLabel={isTemporaryChat ? 'Temporary chat active' : 'Enable temporary chat'}
      accessibilityHint="This conversation won't be saved"
      accessibilityRole="button"
      accessibilityState={{ selected: isTemporaryChat }}
    >
      <EyeOff size={16} color={isTemporaryChat ? colors.purple : colors.textMuted} />
      {isTemporaryChat ? (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
          <View>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: colors.purple,
                letterSpacing: 0.2,
              }}
            >
              Temporary
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}
