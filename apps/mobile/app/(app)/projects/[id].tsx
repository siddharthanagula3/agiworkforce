import { useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router';
import { ArrowLeft, Menu } from 'lucide-react-native';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { ProjectChatsTab } from '@/src/features/projects/components/ProjectChatsTab';
import { ProjectSourcesTab } from '@/src/features/projects/components/ProjectSourcesTab';
import { ProjectWorkTab } from '@/src/features/projects/components/ProjectWorkTab';
import { Text } from '@/components/ui/text';
import { useProjectSourceTarget, useProjectStore } from '@/src/features/projects/store';
import { useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useAuthStore } from '@/src/features/auth/store';
import {
  loadMissingCloudProject,
  refreshCloudProjectDetails,
} from '@/src/features/projects/service';
import { CloudProjectOverview } from '@/src/features/projects/components/CloudProjectOverview';

type TabId = 'chats' | 'work' | 'sources';

function LocalOnlyFallback({
  projectId,
  localProject,
  colors,
}: {
  projectId: string;
  localProject: { name: string } | undefined;
  colors: ReturnType<typeof useThemeColors>;
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
      <Text style={{ fontSize: typeScale.body, fontWeight: '600', color: colors.textPrimary }}>
        {localProject?.name ?? projectId}
      </Text>
      <Text style={{ fontSize: typeScale.footnote, color: colors.textSecondary }}>
        Local project. Details, chats, and sources stay on this device.
      </Text>
    </View>
  );
}

function ProjectNotice({
  title,
  message,
  action,
  onPress,
}: {
  title: string;
  message: string;
  action?: string;
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      testID="project-detail-scope-notice"
      style={{
        margin: 16,
        padding: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceElevated,
        gap: 12,
      }}
    >
      <Text style={{ color: colors.textPrimary, fontSize: typeScale.callout, fontWeight: '600' }}>
        {title}
      </Text>
      <Text style={{ color: colors.textSecondary, fontSize: typeScale.subhead }}>{message}</Text>
      {action && onPress ? (
        <PressableBox
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onPress}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={{ color: colors.teal, fontSize: typeScale.subhead, fontWeight: '600' }}>
            {action}
          </Text>
        </PressableBox>
      ) : null}
    </View>
  );
}

function TabBar({
  activeTab,
  onTabChange,
  showWork,
  colors,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  showWork: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'chats', label: 'Chats' },
    ...(showWork ? [{ id: 'work' as const, label: 'Work' }] : []),
    { id: 'sources', label: 'Sources' },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        borderRadius: 10,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 3,
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <PressableBox
            key={tab.id}
            onPress={() => onTabChange(tab.id)}
            style={{
              flex: 1,
              paddingVertical: 7,
              borderRadius: 8,
              alignItems: 'center',
              backgroundColor: isActive ? colors.surfaceOverlay : colors.transparent,
            }}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={{
                fontSize: typeScale.footnote,
                fontWeight: isActive ? '600' : '500',
                color: isActive ? colors.textPrimary : colors.textMuted,
              }}
            >
              {tab.label}
            </Text>
          </PressableBox>
        );
      })}
    </View>
  );
}

export default function ProjectDetailScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const navigation = useNavigation();

  const [activeTab, setActiveTab] = useState<TabId>('chats');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadState, setLoadState] = useState<{ id: string; status: 'loading' | 'error' } | null>(
    null,
  );

  const localProject = useProjectStore((s) => s.projects.find((p) => p.id === id));

  const appMode = useChatAppModeStore((s) => s.appMode);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const target = useProjectSourceTarget(id ?? '');
  const cloudProject = useCloudProjectStore((s) =>
    s.projects.find((p) => p.id === id && p.deletedAt === null),
  );
  const isCloudProject = target === 'cloud' && !!cloudProject;
  const cloudDetails = useCloudProjectStore((s) => (id ? s.details[id] : undefined));

  useEffect(() => {
    if (!isCloudProject || appMode !== 'cloud' || !isClerkSignedIn) return;
    const controller = new AbortController();
    void refreshCloudProjectDetails(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [appMode, isClerkSignedIn, isCloudProject]);

  useEffect(() => {
    if (!id || target !== 'unknown' || appMode !== 'cloud' || !isClerkSignedIn) return;
    const controller = new AbortController();
    setLoadState({ id, status: 'loading' });
    void loadMissingCloudProject(id, controller.signal).catch(() => {
      if (!controller.signal.aborted) setLoadState({ id, status: 'error' });
    });
    return () => controller.abort();
  }, [appMode, id, isClerkSignedIn, loadAttempt, target]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    }
  }, [router]);

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

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

  const screenTitle = isCloudProject
    ? (cloudProject?.name ?? 'Project')
    : (localProject?.name ?? 'Project');
  const cloudLoadFailed = loadState?.id === id && loadState?.status === 'error';

  const renderHeader = () => {
    if (isCloudProject) {
      return cloudProject ? (
        <CloudProjectOverview project={cloudProject} details={cloudDetails} />
      ) : null;
    }
    return target === 'local' ? (
      <LocalOnlyFallback projectId={id} localProject={localProject} colors={colors} />
    ) : null;
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top']}
      testID="project-detail-screen"
    >
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
        <PressableBox
          onPress={handleBack}
          style={{ padding: 8, borderRadius: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft size={22} color={colors.textSecondary} />
        </PressableBox>

        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: typeScale.callout,
            fontWeight: '600',
            color: colors.textPrimary,
            marginHorizontal: 8,
          }}
        >
          {screenTitle}
        </Text>

        <PressableBox
          onPress={handleOpenDrawer}
          style={{ padding: 8, borderRadius: 8 }}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Menu size={22} color={colors.textSecondary} />
        </PressableBox>
      </View>

      <View style={{ flex: 1 }} testID="project-detail-scroll">
        {renderHeader()}
        {target === 'unknown' ? (
          <ProjectNotice
            title={
              appMode === 'cloud' && isClerkSignedIn && !cloudLoadFailed
                ? 'Loading Cloud project'
                : 'Project unavailable'
            }
            message={
              appMode === 'cloud' && isClerkSignedIn
                ? cloudLoadFailed
                  ? 'This project could not be opened. It may have been removed, or the connection failed.'
                  : 'Checking this project in your Cloud account.'
                : 'This project is no longer available on this device or in the current account.'
            }
            action={
              appMode === 'cloud' && isClerkSignedIn
                ? cloudLoadFailed
                  ? 'Retry loading project'
                  : undefined
                : 'Open Projects'
            }
            onPress={
              appMode === 'cloud' && isClerkSignedIn
                ? () => setLoadAttempt((attempt) => attempt + 1)
                : () => router.replace('/(app)/(tabs)/projects')
            }
          />
        ) : appMode !== target ? (
          <ProjectNotice
            title={`${target === 'cloud' ? 'Cloud' : 'Local'} project`}
            message={`Switch to ${target === 'cloud' ? 'Cloud' : 'Local'} mode to open this project's chats and sources.`}
            action={`Switch to ${target === 'cloud' ? 'Cloud' : 'Local'} mode`}
            onPress={() => setAppMode(target)}
          />
        ) : (
          <>
            <TabBar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              showWork={isCloudProject}
              colors={colors}
            />
            {activeTab === 'chats' ? (
              <ProjectChatsTab projectId={id} />
            ) : activeTab === 'work' && isCloudProject ? (
              <ProjectWorkTab projectId={id} projectName={screenTitle} />
            ) : (
              <ProjectSourcesTab projectId={id} />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
