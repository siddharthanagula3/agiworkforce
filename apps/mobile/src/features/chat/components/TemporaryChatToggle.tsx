import { Alert, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { EyeOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTheme } from '@/src/ui/theme';

const TEMPORARY_CHAT_EXPLANATION =
  "A temporary chat won't be saved to your history, and memory is neither used nor updated from it.";

export function TemporaryChatToggle() {
  const { colors } = useTheme();
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);

  const handlePress = () => {
    if (isTemporaryChat) {
      setTemporaryChat(false);
      return;
    }
    Alert.alert('Turn on temporary chat?', TEMPORARY_CHAT_EXPLANATION, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn on', onPress: () => setTemporaryChat(true) },
    ]);
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
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
      accessibilityHint={isTemporaryChat ? 'Turns temporary chat off' : TEMPORARY_CHAT_EXPLANATION}
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
