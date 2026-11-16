import { useState, useCallback, useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router';
import { ArrowLeft, FileText, Menu, MoreHorizontal, Settings2 } from 'lucide-react-native';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import { ProjectChatsTab } from '@/src/features/projects/components/ProjectChatsTab';
import { ProjectSourcesTab } from '@/src/features/projects/components/ProjectSourcesTab';
import { ProjectWorkTab } from '@/src/features/projects/components/ProjectWorkTab';
import { ProjectArtifactsTab } from '@/src/features/projects/components/ProjectArtifactsTab';
import { ProjectRoutinesTab } from '@/src/features/projects/components/ProjectRoutinesTab';
import { Text } from '@/components/ui/Text';
import { HEADER_TEXT_SCALE_LIMIT } from '@/src/features/chat/components/WorkModeSwitch';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import { ProjectEditorModal } from '@/src/features/projects/components/ProjectEditorModal';
import {
  ProjectInstructionsEntry,
  ProjectInstructionsSheet,
} from '@/src/features/projects/components/ProjectInstructionsSheet';
import { ProjectMemorySheet } from '@/src/features/projects/components/ProjectMemorySheet';
import { useProjectActions } from '@/src/features/projects/useProjectActions';
import { useProjectEditor } from '@/src/features/projects/useProjectEditor';
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
import {
  PROJECT_FILE_CITATION_FILE_PARAM,
  PROJECT_FILE_CITATION_PAGE_PARAM,
} from '@agiworkforce/types';

const HEADER_SCROLL_STYLE = { flexGrow: 0, maxHeight: '50%' } as const;

type TabId = 'chats' | 'work' | 'sources' | 'artifacts' | 'routines';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function citedPage(value: string | string[] | undefined): number | undefined {
  const page = Number(firstParam(value));
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

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

function ProjectQuickActions({
  projectId,
  projectName,
  instructions,
  canEditInstructions,
  showMemory,
}: {
  projectId: string;
  projectName: string;
  instructions: string;
  canEditInstructions: boolean;
  showMemory: boolean;
}) {
  const colors = useThemeColors();
  const router = useRouter();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const closeInstructions = useCallback(() => setInstructionsOpen(false), []);
  const closeMemory = useCallback(() => setMemoryOpen(false), []);
  const openMemorySettings = useCallback(
    () => router.push({ pathname: '/(app)/projects/settings/[id]', params: { id: projectId } }),
    [projectId, router],
  );

  const hasInstructions = instructions.trim().length > 0;
  if (!canEditInstructions && !hasInstructions && !showMemory) return null;

  return (
    <View style={{ marginHorizontal: 16, marginTop: 4, gap: 8 }} testID="project-quick-actions">
      {canEditInstructions || hasInstructions ? (
        <ProjectInstructionsEntry
          instructions={instructions}
          {...(canEditInstructions ? { onPress: () => setInstructionsOpen(true) } : {})}
        />
      ) : null}
      {showMemory ? (
        <PressableBox
          testID="project-view-memory"
          onPress={() => setMemoryOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="View memory"
          style={{
            minHeight: 44,
            paddingHorizontal: 16,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.textPrimary, fontSize: typeScale.body, fontWeight: '600' }}>
            View memory
          </Text>
        </PressableBox>
      ) : null}
      {instructionsOpen && canEditInstructions ? (
        <ProjectInstructionsSheet
          projectId={projectId}
          projectName={projectName}
          instructions={instructions}
          onClose={closeInstructions}
        />
      ) : null}
      {showMemory ? (
        <ProjectMemorySheet
          visible={memoryOpen}
          projectId={projectId}
          onClose={closeMemory}
          onOpenSettings={openMemorySettings}
        />
      ) : null}
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
    ...(showWork
      ? [
          { id: 'artifacts' as const, label: 'Artifacts' },
          { id: 'routines' as const, label: 'Routines' },
        ]
      : []),
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
  const params = useLocalSearchParams();
  const id = firstParam(params.id);
  const knowledgeFile = firstParam(params[PROJECT_FILE_CITATION_FILE_PARAM])?.trim() || undefined;
  const page = citedPage(params[PROJECT_FILE_CITATION_PAGE_PARAM]);
  const router = useRouter();
  const navigation = useNavigation();

  const [activeTab, setActiveTab] = useState<TabId>(knowledgeFile ? 'sources' : 'chats');
  const [shownFile, setShownFile] = useState(knowledgeFile);
  if (shownFile !== knowledgeFile) {
    setShownFile(knowledgeFile);
    if (knowledgeFile) setActiveTab('sources');
  }
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
  const editor = useProjectEditor();
  const projectActions = useProjectActions(editor.openEdit);

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

  const { openActions } = projectActions;
  const handleOpenActions = useCallback(() => {
    if (!id) return;
    openActions(id, { variant: 'page', onRemoved: handleBack });
  }, [handleBack, id, openActions]);

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
  const projectInstructions = isCloudProject
    ? (cloudProject?.instructions ?? '')
    : (localProject?.instructions ?? '');
  const isSharedWithMe = isCloudProject && cloudDetails?.sharedAccess != null;
  const isArchived = isCloudProject && cloudProject?.isArchived === true;
  const canEditInstructions = !isArchived && !isSharedWithMe;
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
          minHeight: 48,
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
          maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
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

        {isCloudProject && appMode === 'cloud' ? (
          <PressableBox
            testID="project-detail-notebook"
            onPress={() =>
              router.push({
                pathname: '/(app)/projects/notebook/[id]',
                params: { id, name: screenTitle },
              })
            }
            style={{ padding: 8, borderRadius: 8 }}
            accessibilityLabel="Project notebook"
            accessibilityHint="Create study guides, briefings, quizzes and more from this project's sources"
            accessibilityRole="button"
          >
            <FileText size={21} color={colors.textSecondary} />
          </PressableBox>
        ) : null}
        {isCloudProject && appMode === 'cloud' ? (
          <PressableBox
            testID="project-detail-settings"
            onPress={() =>
              router.push({ pathname: '/(app)/projects/settings/[id]', params: { id } })
            }
            style={{ padding: 8, borderRadius: 8 }}
            accessibilityLabel="Project settings"
            accessibilityRole="button"
          >
            <Settings2 size={21} color={colors.textSecondary} />
          </PressableBox>
        ) : null}
        {target !== 'unknown' && appMode === target ? (
          <PressableBox
            testID="project-detail-actions"
            onPress={handleOpenActions}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel="More project actions"
            accessibilityRole="button"
          >
            <MoreHorizontal size={22} color={colors.textSecondary} />
          </PressableBox>
        ) : null}
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
        <ScrollView
          testID="project-detail-header-scroll"
          style={HEADER_SCROLL_STYLE}
          showsVerticalScrollIndicator={false}
        >
          {renderHeader()}
          {target !== 'unknown' && appMode === target ? (
            <ProjectQuickActions
              projectId={id}
              projectName={screenTitle}
              instructions={projectInstructions}
              canEditInstructions={canEditInstructions}
              showMemory={isCloudProject && !isSharedWithMe}
            />
          ) : null}
        </ScrollView>
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
            ) : activeTab === 'artifacts' && isCloudProject ? (
              <ProjectArtifactsTab projectId={id} />
            ) : activeTab === 'routines' && isCloudProject ? (
              <ProjectRoutinesTab projectId={id} />
            ) : (
              <ProjectSourcesTab
                projectId={id}
                {...(knowledgeFile ? { openFileId: knowledgeFile } : {})}
                {...(page ? { openPage: page } : {})}
              />
            )}
          </>
        )}
      </View>
      <ProjectEditorModal editor={editor} />
      <ActionMenuSheet menu={projectActions.menu} dismissLabel="Dismiss project actions" />
    </SafeAreaView>
  );
}
