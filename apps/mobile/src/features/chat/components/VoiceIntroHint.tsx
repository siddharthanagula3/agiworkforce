import { useEffect } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { radii, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useSettingsStore } from '@/stores/settingsStore';

const HINT_BOTTOM_OFFSET = 52;
const HINT_HEIGHT = 36;
export const VOICE_INTRO_HINT_VISIBLE_MS = 8000;

export function useVoiceIntroHintVisible(): boolean {
  const hintSeen = useSettingsStore((s) => s.voiceHintSeen);
  const voiceSeen = useSettingsStore((s) => s.voiceOnboardingSeen);
  return !hintSeen && !voiceSeen;
}

export function dismissVoiceIntroHint(): void {
  const { voiceHintSeen, setVoiceHintSeen } = useSettingsStore.getState();
  if (!voiceHintSeen) setVoiceHintSeen(true);
}

export function VoiceIntroHint() {
  const colors = useThemeColors();
  const visible = useVoiceIntroHintVisible();

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(dismissVoiceIntroHint, VOICE_INTRO_HINT_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel="Tip: tap the voice button to talk instead of typing"
      testID="chat.composer.voice-hint"
      style={{
        position: 'absolute',
        right: 0,
        bottom: HINT_BOTTOM_OFFSET,
        height: HINT_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderRadius: radii.full,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
      }}
    >
      <Text
        numberOfLines={1}
        style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '500' }}
      >
        Try voice
      </Text>
    </View>
  );
}
