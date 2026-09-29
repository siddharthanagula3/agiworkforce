import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { EyeOff, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const TEMPORARY_CHAT_CLOUD_EXPLAINER =
  "This chat won't appear in your history or search, and it won't use or update memory. Anything kept to run it, including files you attach, is deleted after 30 days.";
export const TEMPORARY_CHAT_LOCAL_EXPLAINER =
  "This chat won't be saved on this device or appear in search, and it won't use or update memory. Files you attach are read on this device and never uploaded.";

const PERSONALIZED_LABEL = 'Personalized';
const UNPERSONALIZED_LABEL = 'Unpersonalized';
const PERSONALIZATION_HINT =
  'Personalized uses your profile, instructions and response style. Unpersonalized leaves them out.';

let hasShownThisSession = false;

export function TemporaryChatBanner() {
  const colors = useThemeColors();
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const personalized = useSettingsStore((s) => s.temporaryChatPersonalized);
  const setPersonalized = useSettingsStore((s) => s.setTemporaryChatPersonalized);
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isTemporaryChat && !hasShownThisSession) {
      hasShownThisSession = true;
      setVisible(true);
    }
  }, [isTemporaryChat]);

  if (!visible) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: colors.purpleSurface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
      accessibilityRole="alert"
      accessibilityLabel="Temporary chat explainer"
    >
      <EyeOff size={14} color={colors.purple} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Text style={{ fontSize: typeScale.caption, lineHeight: 17, color: colors.textSecondary }}>
          {isCloud ? TEMPORARY_CHAT_CLOUD_EXPLAINER : TEMPORARY_CHAT_LOCAL_EXPLAINER}
        </Text>
        {isCloud ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text
              style={{
                flex: 1,
                fontSize: typeScale.caption,
                lineHeight: 17,
                color: colors.textPrimary,
              }}
            >
              {personalized ? PERSONALIZED_LABEL : UNPERSONALIZED_LABEL}
            </Text>
            <Switch
              value={personalized}
              onValueChange={setPersonalized}
              accessibilityLabel={PERSONALIZED_LABEL}
              accessibilityHint={PERSONALIZATION_HINT}
            />
          </View>
        ) : null}
      </View>
      <PressableBox
        onPress={() => setVisible(false)}
        hitSlop={8}
        accessibilityLabel="Dismiss temporary chat explainer"
        accessibilityRole="button"
      >
        <X size={14} color={colors.textMuted} />
      </PressableBox>
    </View>
  );
}
