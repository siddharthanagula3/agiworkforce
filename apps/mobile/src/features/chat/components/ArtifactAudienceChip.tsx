import { View } from 'react-native';
import { Globe, Users } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';
import { usePublishedArtifactAudience } from '../services/artifactPublishing';
import { typeScale } from '@/src/ui/theme/tokens';

export function ArtifactAudienceChip({ artifactId }: { artifactId: string }) {
  const colors = useThemeColors();
  const audience = usePublishedArtifactAudience(artifactId);
  if (!audience) return null;
  const Icon = audience === 'organization' ? Users : Globe;
  const label = audience === 'organization' ? 'Workspace' : 'Published';
  return (
    <View
      accessibilityLabel={
        audience === 'organization'
          ? 'Shared with your workspace'
          : 'Published to anyone with the link'
      }
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
