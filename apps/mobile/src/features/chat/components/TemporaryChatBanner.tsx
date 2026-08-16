import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { EyeOff, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors } from '@/src/ui/theme';

let hasShownThisSession = false;

export function TemporaryChatBanner() {
  const colors = useThemeColors();
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
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
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary }}>
        This chat won&apos;t appear in history, use memory, or train models. May be retained briefly
        for safety.
      </Text>
      <Pressable
        onPress={() => setVisible(false)}
        hitSlop={8}
        accessibilityLabel="Dismiss temporary chat explainer"
        accessibilityRole="button"
      >
        <X size={14} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
