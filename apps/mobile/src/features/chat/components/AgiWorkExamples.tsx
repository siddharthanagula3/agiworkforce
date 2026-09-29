import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { ListChecks } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

const PROMPT_SLOTS = ['p1', 'p2', 'p3', 'p4'] as const;

export function AgiWorkExamples({ onChoose }: { onChoose: (prompt: string) => void }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  return (
    <View style={{ width: '100%', maxWidth: 360, marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ListChecks size={15} color={colors.textSecondary} />
        <Text
          accessibilityRole="header"
          style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.textSecondary }}
        >
          {t('newChat.agiWorkExamples')}
        </Text>
      </View>
      <Text
        style={{
          fontSize: typeScale.footnote,
          lineHeight: 18,
          color: colors.textMuted,
          marginBottom: 6,
        }}
      >
        {t('newChat.agiWorkIntro')}
      </Text>
      {PROMPT_SLOTS.map((slot) => {
        const prompt = t(`newChat.agiWork.${slot}`);
        return (
          <PressableBox
            key={slot}
            onPress={() => onChoose(prompt)}
            accessibilityRole="button"
            accessibilityHint="Puts this example in the message box"
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: 'center',
              paddingHorizontal: 10,
              borderRadius: 10,
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
          >
            <Text
              style={{ fontSize: typeScale.subhead, lineHeight: 19, color: colors.textPrimary }}
            >
              {prompt}
            </Text>
          </PressableBox>
        );
      })}
    </View>
  );
}
