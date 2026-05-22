import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { DrawerActions } from '@react-navigation/native';
import { ArrowLeft, LogIn, Menu } from 'lucide-react-native';
import { summarizeProjectHeader, formatChatExecutionModeLabel } from '@agiworkforce/types';
import type { ProjectRecord } from '@agiworkforce/types';
import { formatRelativeTime } from '@agiworkforce/utils/format';
import { ProjectHeader } from '@/src/features/projects/components/ProjectHeader';
import { Text } from '@/components/ui/text';
import { useProjectStore } from '@/src/features/projects/store';
import { fetchProject } from '@/src/features/projects/service';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'success'; project: ProjectRecord }
  | { kind: 'error'; message: string };

function LocalOnlyFallback({
  projectId,
  localProject,
  colors,
  onJoinWaitlist,
}: {
  projectId: string;
  localProject: { name: string } | undefined;
  colors: ReturnType<typeof useThemeColors>;
  onJoinWaitlist: () => void;
}) {
  return (
    <View
      style={{
        margin: 16,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        backgroundColor: colors.surfaceElevated,
        borderColor: colors.border,
        gap: 12,
      }}
      testID="project-detail-local-fallback"
    >
      <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textPrimary }}>
        {localProject?.name ?? projectId}
      </Text>
      <Text style={{ fontSize: 13, color: colors.textSecondary }}>
        {formatChatExecutionModeLabel('local_only')} — project details sync when you join Cloud.
      </Text>
      <Pressable
        onPress={onJoinWaitlist}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 8,
          backgroundColor: `${colors.teal}20`,
          borderWidth: 1,
          borderColor: `${colors.teal}40`,
        }}
        accessibilityRole="button"
        accessibilityLabel="Join Cloud waitlist"
      >
        <LogIn size={14} color={colors.teal} />
        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.teal }}>
          Join Cloud waitlist
        </Text>
      </Pressable>
    </View>
  );
}

export default function ProjectDetailScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const navigation = useNavigation();

  const localProject = useProjectStore((s) => s.projects.find((p) => p.id === id));

  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });

  const loadProject = useCallback(async () => {
    if (!id) return;
    if (!FEATURES.auth) {
      setFetchState({ kind: 'error', message: 'no-auth' });
      return;
    }
    setFetchState({ kind: 'loading' });
    try {
      const project = await fetchProject(id);
      setFetchState({ kind: 'success', project });
    } catch {
      setFetchState({ kind: 'error', message: 'fetch-failed' });
    }
  }, [id]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    }
  }, [router]);

  const handleOpenDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer());
  }, [navigation]);

  const handleJoinWaitlist = useCallback(() => {
    // Cloud waitlist is gated — navigate to tabs which surfaces the ModeToggle waitlist CTA
    router.push('/(app)' as Parameters<typeof router.push>[0]);
  }, [router]);

  if (!id) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        edges={['top']}
      >
        <Text style={{ color: colors.textSecondary }}>No project selected</Text>
      </SafeAreaView>
    );
  }

  const renderContent = () => {
    if (fetchState.kind === 'loading') {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.teal} size="small" />
          <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 8 }}>
            Loading project…
          </Text>
        </View>
      );
    }

    if (fetchState.kind === 'success') {
      const lastUsedAt = fetchState.project.lastUsedAt;
      const lastUsedRelativeLabel = lastUsedAt ? formatRelativeTime(lastUsedAt) : undefined;
      const presentation = summarizeProjectHeader({
        project: fetchState.project,
        lastUsedRelativeLabel,
      });
      return (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          testID="project-detail-scroll"
        >
          <ProjectHeader presentation={presentation} />
        </ScrollView>
      );
    }

    // error or idle — show local-only fallback
    return (
      <LocalOnlyFallback
        projectId={id}
        localProject={localProject}
        colors={colors}
        onJoinWaitlist={handleJoinWaitlist}
      />
    );
  };

  const screenTitle =
    fetchState.kind === 'success' ? fetchState.project.name : (localProject?.name ?? 'Project');

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top']}
      testID="project-detail-screen"
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          height: 48,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Pressable
          onPress={handleBack}
          style={{ padding: 8, borderRadius: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </Pressable>

        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 16,
            fontWeight: '600',
            color: colors.textPrimary,
            marginHorizontal: 8,
          }}
        >
          {screenTitle}
        </Text>

        <Pressable
          onPress={handleOpenDrawer}
          style={{ padding: 8, borderRadius: 8 }}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Menu size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {renderContent()}
    </SafeAreaView>
  );
}
