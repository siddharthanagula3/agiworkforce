import { Alert, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { EyeOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useTheme, motion } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import {
  TEMPORARY_CHAT_CLOUD_EXPLAINER,
  TEMPORARY_CHAT_LOCAL_EXPLAINER,
} from './TemporaryChatBanner';

export function TemporaryChatToggle() {
  const { colors } = useTheme();
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);
  const explanation =
    useChatAppModeStore((s) => s.appMode) === 'cloud'
      ? TEMPORARY_CHAT_CLOUD_EXPLAINER
      : TEMPORARY_CHAT_LOCAL_EXPLAINER;

  const handlePress = () => {
    if (isTemporaryChat) {
      setTemporaryChat(false);
      return;
    }
    Alert.alert('Turn on temporary chat?', explanation, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn on', onPress: () => setTemporaryChat(true) },
    ]);
  };

  return (
    <PressableBox
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
      accessibilityHint={isTemporaryChat ? 'Turns temporary chat off' : explanation}
      accessibilityRole="button"
      accessibilityState={{ selected: isTemporaryChat }}
    >
      <EyeOff size={16} color={isTemporaryChat ? colors.purple : colors.textMuted} />
      {isTemporaryChat ? (
        <Animated.View
          entering={FadeIn.duration(motion.quick)}
          exiting={FadeOut.duration(motion.quick)}
        >
          <View>
            <Text
              style={{
                fontSize: typeScale.caption,
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
    </PressableBox>
  );
}
