import { View } from 'react-native';
import { Globe, Lock, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import {
  usePublishedArtifactAudience,
  type PublishedArtifactAudience,
} from '../services/artifactPublishing';
import { typeScale } from '@/src/ui/theme/tokens';

const AUDIENCE_CHIP: Record<
  PublishedArtifactAudience,
  { Icon: typeof Globe; label: string; description: string }
> = {
  public: { Icon: Globe, label: 'Published', description: 'Published to anyone with the link' },
  organization: { Icon: Users, label: 'Workspace', description: 'Shared with your workspace' },
  invited: { Icon: Lock, label: 'Invited', description: 'Only people you invite can open this' },
};

export function ArtifactAudienceChip({ artifactId }: { artifactId: string }) {
  const colors = useThemeColors();
  const audience = usePublishedArtifactAudience(artifactId);
  if (!audience) return null;
  const { Icon, label, description } = AUDIENCE_CHIP[audience];
  return (
    <View
      accessibilityLabel={description}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 3,
        backgroundColor: colors.neutralSurface,
      }}
    >
      <Icon size={10} color={colors.textSecondary} />
      <Text style={{ fontSize: typeScale.caption, fontWeight: '600', color: colors.textSecondary }}>
        {label}
      </Text>
    </View>
  );
}
