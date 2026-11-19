import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { fetchManagedSkills, type ManagedSkillSummary } from './service';
import { skillsMatchingMention } from './skillRequirements';

export function SkillMentionPalette({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (skill: ManagedSkillSummary) => void;
}) {
  const colors = useThemeColors();
  const [skills, setSkills] = useState<ManagedSkillSummary[]>([]);

  useEffect(() => {
    const account = captureCloudAccountEpoch();
    const controller = new AbortController();
    fetchManagedSkills(controller.signal)
      .then((fetched) => {
        if (controller.signal.aborted || !isCloudAccountEpochCurrent(account)) return;
        setSkills(fetched);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSkills([]);
      });
    return () => controller.abort();
  }, []);

  const matches = skillsMatchingMention(skills, query);
  if (matches.length === 0) return null;

  return (
    <View
      testID="skill-mention-palette"
      accessibilityLabel="Skills to use"
      style={{
        marginBottom: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceOverlay,
        overflow: 'hidden',
      }}
    >
      {matches.map((skill) => (
        <PressableBox
          key={skill.name}
          onPress={() => onSelect(skill)}
          accessibilityRole="button"
          accessibilityLabel={`Use the ${skill.title ?? skill.name} skill`}
          style={{
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 12,
          }}
        >
          <Sparkles size={16} color={colors.textSecondary} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, color: colors.textPrimary, fontSize: typeScale.subhead }}
          >
            {skill.title ?? skill.name}
          </Text>
        </PressableBox>
      ))}
    </View>
  );
}
