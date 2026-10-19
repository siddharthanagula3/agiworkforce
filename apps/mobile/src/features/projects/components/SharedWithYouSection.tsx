import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { Text } from '@/components/ui/text';
import { API_URL } from '@/lib/constants';
import {
  ACCESS_LABELS,
  fetchProjectSharing,
  projectsSharedWithMe,
  sharedResourcesForMe,
  type SharedWithMeProject,
} from '@/src/features/projects/projectSharing';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function SharedWithYouSection() {
  const colors = useThemeColors();
  const router = useRouter();
  const [projects, setProjects] = useState<SharedWithMeProject[]>([]);
  const [otherCount, setOtherCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchProjectSharing(controller.signal)
      .then((overview) => {
        if (controller.signal.aborted) return;
        setProjects(overview ? projectsSharedWithMe(overview) : []);
        const resources = overview ? sharedResourcesForMe(overview, API_URL) : null;
        setOtherCount(
          resources
            ? resources.conversations.length +
                resources.artifacts.length +
                resources.connectors.length
            : 0,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setProjects([]);
      });
    return () => controller.abort();
  }, []);

  if (projects.length === 0 && otherCount === 0) return null;

  return (
    <View testID="projects-shared-with-you" style={{ gap: 8, marginTop: 16, marginBottom: 8 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.textMuted,
          fontSize: typeScale.caption,
          fontWeight: '700',
          letterSpacing: 0.7,
        }}
      >
        SHARED WITH YOU
      </Text>
      {projects.map((project) => (
        <Pressable
          key={project.projectId}
          onPress={() =>
            router.push({
              pathname: '/(app)/projects/shared/[id]',
              params: { id: project.projectId },
            })
          }
          accessibilityRole="button"
          accessibilityLabel={`${project.name}, shared by ${project.ownerName}. ${ACCESS_LABELS[project.access]}`}
          style={{
            minHeight: 56,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surfaceElevated,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Users size={18} color={colors.textSecondary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: typeScale.body }}>
              {project.name}
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: colors.textMuted, fontSize: typeScale.footnote }}
            >
              {`${project.ownerName} · ${ACCESS_LABELS[project.access]}`}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textMuted} />
        </Pressable>
      ))}
      <Pressable
        testID="projects-shared-see-all"
        onPress={() => router.push('/(app)/shared')}
        accessibilityRole="button"
        accessibilityLabel="See everything shared with you"
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text
          style={{ color: colors.textPrimary, fontSize: typeScale.footnote, fontWeight: '600' }}
        >
          {otherCount > 0
            ? `See everything shared with you (${projects.length + otherCount})`
            : 'See everything shared with you'}
        </Text>
      </Pressable>
    </View>
  );
}
