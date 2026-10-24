import { View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { ListChecks } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui/Text';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export const AGI_WORK_EXAMPLE_PROMPT_KEYS = [
  'newChat.agiWork.p1',
  'newChat.agiWork.p2',
  'newChat.agiWork.p3',
  'newChat.agiWork.p4',
] as const;

export const AGI_WORK_EXAMPLE_KEYS = [
  'newChat.agiWorkExamples',
  'newChat.agiWorkIntro',
  'newChat.agiWorkExampleHint',
  ...AGI_WORK_EXAMPLE_PROMPT_KEYS,
] as const;

export function AgiWorkExamples({ onChoose }: { onChoose: (prompt: string) => void }) {
  const colors = useThemeColors();
  const { t } = useTranslation();
  return (
    <View style={{ width: '100%', maxWidth: 360, marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <ListChecks size={15} color={colors.textSecondary} />
        <Text
          accessibilityRole="header"
          style={{ fontSize: typeScale.subhead, fontWeight: '600', color: colors.textSecondary }}
        >
          {t('newChat.agiWorkExamples')}
        </Text>
      </View>
      <Text
        style={{
          fontSize: typeScale.subhead,
          lineHeight: 19,
          color: colors.textMuted,
          marginBottom: 6,
        }}
      >
        {t('newChat.agiWorkIntro')}
      </Text>
      {AGI_WORK_EXAMPLE_PROMPT_KEYS.map((key) => {
        const prompt = t(key);
        return (
          <PressableBox
            key={key}
            onPress={() => onChoose(prompt)}
            accessibilityRole="button"
            accessibilityHint={t('newChat.agiWorkExampleHint')}
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
