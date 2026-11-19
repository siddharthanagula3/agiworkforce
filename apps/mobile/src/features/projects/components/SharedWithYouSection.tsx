import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { Text } from '@/components/ui/Text';
import { API_URL } from '@/lib/constants';
import {
  ACCESS_LABELS,
  fetchProjectSharing,
  projectsSharedWithMe,
  sharedResourcesForMe,
  type SharedWithMeProject,
} from '@/src/features/projects/projectSharing';
import { withoutHiddenSharers } from '@/src/features/shared-with-you/hiddenSharers';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';

export function SharedWithYouSection({ emptyMessage }: { emptyMessage?: string }) {
  const colors = useThemeColors();
  const router = useRouter();
  const [projects, setProjects] = useState<SharedWithMeProject[]>([]);
  const [otherCount, setOtherCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void fetchProjectSharing(controller.signal)
      .then((fetched) => {
        if (controller.signal.aborted) return;
        const overview = fetched ? withoutHiddenSharers(fetched) : null;
        setProjects(overview ? projectsSharedWithMe(overview) : []);
        setLoaded(true);
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
        if (controller.signal.aborted) return;
        setProjects([]);
        setFailed(true);
        setLoaded(true);
      });
    return () => controller.abort();
  }, [attempt]);

  if (projects.length === 0 && otherCount === 0) {
    if (!emptyMessage || !loaded) return null;
    return (
      <View testID="projects-shared-empty" style={{ alignItems: 'center', paddingTop: 48, gap: 8 }}>
        <Text style={{ color: colors.textMuted, fontSize: typeScale.subhead, textAlign: 'center' }}>
          {failed ? 'Shared projects could not be loaded.' : emptyMessage}
        </Text>
        {failed ? (
          <Pressable
            onPress={() => setAttempt((count) => count + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading shared projects"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: colors.teal, fontWeight: '600' }}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

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
        onPress={() => router.push('/(app)/shared' as Parameters<typeof router.push>[0])}
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
