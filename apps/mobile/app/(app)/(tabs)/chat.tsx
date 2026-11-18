import { runComposerAttachmentPick } from '@/src/features/chat/utils/runComposerAttachmentPick';
import {
  agreeToCloudUploadAhead,
  takeCloudUploadAgreedAhead,
} from '@/src/features/chat/utils/cloudUploadConsent';
import { photoSelectionLimitForPlan } from '@/src/features/chat/utils/photoSelectionLimit';
import { attachmentLimitsFor } from '@/src/features/chat/utils/attachmentValidation';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Alert,
  Keyboard,
  Linking,
  ScrollView,
  KeyboardAvoidingView,
  StyleSheet,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/PressableBox';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Building2, FolderOpen, UserRound, X } from 'lucide-react-native';
import { useNewChatWorkspace } from '@/src/features/team/useNewChatWorkspace';
import { Download } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import {
  canUseBillingPlanCapability,
  getModelMetadataById,
  summarizeSendPreview,
  type ProviderMode,
  type SendPreviewInput,
} from '@agiworkforce/types';
import { ChatInput, type ComposerSendOutcome } from '@/src/features/chat/components/ChatInput';
import { TemporaryChatToggle } from '@/src/features/chat/components/TemporaryChatToggle';
import {
  HEADER_TEXT_SCALE_LIMIT,
  WorkModeSwitch,
} from '@/src/features/chat/components/WorkModeSwitch';
import { UsageLimitBanner } from '@/src/features/chat/components/UsageLimitBanner';
import { useWorkUsageLimit } from '@/src/features/chat/hooks/useWorkUsageLimit';
import { useGreetingName } from '@/src/features/chat/hooks/useGreetingName';
import { useGreetingTime } from '@/src/features/chat/hooks/useGreetingTime';
import {
  ProjectChatBackButton,
  openedFromProject,
} from '@/src/features/projects/components/ProjectChatBackButton';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { useComposerAttachmentHandoff } from '@/src/features/chat/useComposerAttachmentHandoff';
import { readClipboardImageAttachment } from '@/src/features/media/clipboard-image';
import { ProjectSelectorBar } from '@/src/features/chat/components/ProjectSelectorBar';
import { StyleSelector } from '@/src/features/chat/components/StyleSelector';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import {
  VoiceOnboardingSheet,
  type VoiceOnboardingMode,
} from '@/src/features/voice/components/VoiceOnboardingSheet';
import { VoicePickerSheet } from '@/src/features/voice/components/VoicePickerSheet';
import { VoiceInlineBar } from '@/src/features/voice/components/VoiceInlineBar';
import { liveVoiceModeUnavailableReason } from '@/src/features/voice/services/liveVoiceAvailability';
import { onDeviceRecognizerGuaranteed } from '@/src/features/voice/services/voiceInput';
import { CAPABILITY_SWITCHED_OFF_BODY, useCapability } from '@/src/lib/Capabilities';
import { useKeyboardSafeComposer } from '@/src/features/chat/chrome/keyboardSafeComposer';
import { useVoiceConversation } from '@/src/features/voice/hooks/useVoiceConversation';
import { showVoiceCaptureFailureAlert } from '@/src/features/voice/components/voicePermissionAlert';
import { classifyVoiceFailure } from '@/src/features/voice/services/voiceFailure';
import { useVoiceOutputOwner } from '@/src/features/voice/hooks/useVoiceOutputOwner';
import type { DraftProvenance } from '@/src/features/chat/draftStore';
import { draftIdentityKey } from '@/src/features/chat/draftIdentity';
import { useVoiceAttachments } from '@/src/features/voice/hooks/useVoiceAttachments';
import { useFocusBoundVisibility } from '@/src/features/voice/hooks/useInlineVoiceBar';
import {
  discardVoiceHandoff,
  openVoiceHandoff,
  type VoiceHandoffSettler,
} from '@/src/features/voice/services/voiceHandoff';
import { speechSettings } from '@/src/features/voice/services/speechSettings';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  takeStartWithVoiceOnLaunch,
  useLocalSettingsStore,
} from '@/stores/settings/localSettingsStore';
import { NEW_CHAT_STYLE_KEY, useChatViewStore } from '@/stores/chat/chatViewStore';
import { findNewAssistantResponse } from '@/src/features/voice/utils/assistantResponse';
import { Text } from '@/components/ui/Text';
import { AgiMark } from '@/components/ui/AgiMark';
import { paywallErrorStateFromApiError, useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getSelectableModelById,
  getShortDisplayName,
  isSelectableModelIdForAccess,
} from '@/src/features/model-picker/service';
import { useCloudProjectStore } from '@/stores/projects/cloudProjectStore';
import {
  clearNewChatProjectScope,
  leaveNewChatComposer,
  returnToNewChatComposer,
  startNewChatComposerRoundTrip,
} from '@/stores/projects/newChatProjectScope';
import { useProjectStore } from '@/src/features/projects/store';
import { refreshCloudProjectDetails } from '@/src/features/projects/service';
import { executionModeForSelection } from '@/src/features/chat/utils/conversationMode';
import { resolveNewConversationModel } from '@/src/features/chat/utils/newConversationModel';
import {
  captureImageAssetsFromCamera,
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '@/src/features/media/photo-picker';
import {
  PictureMetadataError,
  PICTURE_METADATA_RECOVERY_MESSAGE,
} from '@/src/features/media/image-metadata';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { resolveMediaModelId } from '@/src/features/chat/actions/mediaMode';
import { resolveGreetingHeadline } from '@agiworkforce/utils/greeting';
import { fallBackToLocalMode } from '@/src/features/chat/store/cloudModeFallback';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { useTierStore } from '@/src/features/billing/store';
import { useTheme, useThemeColors } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { contentColumn } from '@/src/shared/layout/contentColumn';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { API_URL } from '@/lib/constants';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { toUserMessage } from '@/services/userMessage';
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';
import { refuseFilteredSend } from '@/src/features/chat/utils/refuseFilteredSend';
import { runImageGenerationTurn } from '@/src/features/chat/actions/runImageGenerationTurn';
import { runVideoGenerationTurn } from '@/src/features/chat/actions/runVideoGenerationTurn';
import { resolveMobileVideoGenerationRequest } from '@/src/features/chat/actions/resolveMobileVideoGenerationRequest';
import { useAuthStore } from '@/src/features/auth/store';
import { resolveMobileImageGenerationRequest } from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';
import { alertBlockedImageRequest } from '@/src/features/chat/actions/alertBlockedImageRequest';
import {
  freeImageOfferFor,
  FREE_IMAGE_OFFER_UNKNOWN_ALERT,
} from '@/src/features/chat/actions/freeImageOffer';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { ComposerApprovalModeControl } from '@/src/features/chat/components/ComposerApprovalModeControl';
import { pickableDocumentMimeTypes } from '@/services/docParser';
import { useMobileSkillSelectionStore } from '@/src/features/skills/selectionStore';
import { selectedSkillTools } from '@/stores/chat/skillTurnOptions';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { sharingWithProvidersAllowed } from '@/src/features/chat/actions/mediaGenerationConsent';

const STYLE_SHEET_HANDOFF_DELAY_MS = 450;
const OFFLINE_NEW_CLOUD_CHAT_ALERT = {
  title: "You're offline",
  message:
    'AGI Cloud needs a connection to start a new chat. Your message is still in the composer. Reconnect and send again.',
} as const;
type RouterHref = Parameters<ReturnType<typeof useRouter>['push']>[0];
const HEADER_SIDE_SLOT = 44;
const NEW_CHAT_SYMBOL_SIZE = 40;
const GREETING_MINIMUM_FONT_SCALE = 0.6;

async function sharingAllowedWhile(isStillCurrent: () => boolean): Promise<boolean> {
  return (await sharingWithProvidersAllowed()) && isStillCurrent();
}

export default function ChatTabScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors: c, isDark } = useTheme();
  const pageBackground = isDark ? c.background : c.surfaceBase;
  const modelPickerRef = useRef<BottomSheet>(null);
  const addToChatRef = useRef<BottomSheet>(null);
  const chatInputAttachRef = useRef<
    import('@/src/features/chat/components/ChatInput').ChatInputHandle | null
  >(null);
  const [voiceIntroVisible, setVoiceIntroVisible] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [voiceFallbackReason, setVoiceFallbackReason] = useState<string | null>(null);
  const voiceAllowed = useCapability('canUseVoice');
  const keyboard = useKeyboardSafeComposer('screen');
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const [styleSelectorOpenSignal, setStyleSelectorOpenSignal] = useState(0);
  const [projectPickerOpenSignal, setProjectPickerOpenSignal] = useState(0);
  const [modelPickerScope, setModelPickerScope] = useState<'local' | 'cloud'>('local');

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const discardUnsentConversation = useChatStore((s) => s.discardUnsentConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const beginImageGeneration = useChatStore((s) => s.beginImageGeneration);
  const completeImageGeneration = useChatStore((s) => s.completeImageGeneration);
  const failImageGeneration = useChatStore((s) => s.failImageGeneration);
  const beginVideoGeneration = useChatStore((s) => s.beginVideoGeneration);
  const updateVideoGenerationProgress = useChatStore((s) => s.updateVideoGenerationProgress);
  const completeVideoGeneration = useChatStore((s) => s.completeVideoGeneration);
  const failVideoGeneration = useChatStore((s) => s.failVideoGeneration);
  const recordVideoGenerationTask = useChatStore((s) => s.recordVideoGenerationTask);
  const isVideoGenerationCancelRequested = useChatStore((s) => s.isVideoGenerationCancelRequested);
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const selectedMediaModel = useChatViewStore((s) => s.selectedMediaModel);
  const videoAspectRatio = useChatViewStore((s) => s.videoAspectRatio);
  const videoResolution = useChatViewStore((s) => s.videoResolution);
  const imageAspectRatio = useChatViewStore((s) => s.imageAspectRatio);
  const imageTransparentBackground = useChatViewStore((s) => s.imageTransparentBackground);
  const videoDurationSecs = useChatViewStore((s) => s.videoDurationSecs);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setPaywallError = useChatStore((s) => s.setPaywallError);
  const clearUnscopedError = useChatStore((s) => s.clearUnscopedError);
  const setSendError = useChatStore((s) => s.setSendError);
  const imageGenerationEnabled = useChatStore((s) => s.features.imageGen);
  const workMode = useChatStore((s) => s.workMode);
  const setWorkMode = useChatStore((s) => s.setWorkMode);

  const composerFocusedRef = useRef(false);
  const composerFocusGenerationRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      composerFocusGenerationRef.current += 1;
      composerFocusedRef.current = true;
      clearUnscopedError();
      if (!returnToNewChatComposer()) useModelStore.getState().endConversationModel();
      useChatViewStore.getState().bindStyleConversation(NEW_CHAT_STYLE_KEY);
      return () => {
        composerFocusedRef.current = false;
        composerFocusGenerationRef.current += 1;
        leaveNewChatComposer();
      };
    }, [clearUnscopedError]),
  );
  useEffect(() => clearNewChatProjectScope, []);
  useComposerAttachmentHandoff('new-chat', chatInputAttachRef);
  const { isOnline } = useNetworkStatus();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const setModel = useModelStore((s) => s.setModel);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const skillSelection = useMobileSkillSelectionStore((s) => s.selection);
  const clearSelectedSkill = useMobileSkillSelectionStore((s) => s.clearSkill);
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const installedModelIds = useModelInstallStore((s) => s.installedModelIds);
  const readySystemModelIds = useModelInstallStore((s) => s.readySystemModelIds);
  const defaultLocalModelDownloading = useModelInstallStore(
    (s) => s.jobs[DEFAULT_LOCAL_MODEL_ID]?.status === 'downloading',
  );
  const activeMode = appMode;
  const speechOwner = useVoiceOutputOwner(activeMode, 'new-chat');
  const [voiceInlineVisible, setVoiceInlineVisible] = useFocusBoundVisibility(
    `new-chat:${activeMode}`,
  );
  const composerDraftProvenance: DraftProvenance | undefined =
    activeMode === 'local'
      ? { scope: 'local' }
      : clerkUserId
        ? { scope: 'cloud', ownerId: clerkUserId }
        : undefined;
  const voiceAttachments = useVoiceAttachments({
    active: voiceInlineVisible,
    scopeKey: draftIdentityKey('new-chat', composerDraftProvenance),
    composerRef: chatInputAttachRef,
    onRelease: (items) => chatInputAttachRef.current?.addAttachments(items),
  });
  const { activeTarget: activeAttachTarget, beginSend: beginVoiceAttachmentSend } =
    voiceAttachments;
  const activeCloudProjectId = useCloudProjectStore((s) => s.activeProjectId);
  const cloudProjects = useCloudProjectStore((s) => s.projects);
  const activeLocalProjectId = useProjectStore((s) => s.activeProjectId);
  const localProjects = useProjectStore((s) => s.projects);
  const setActiveProject = useProjectStore((s) => s.setActiveProject);
  const newChatProject = useMemo(() => {
    if (activeMode === 'cloud') {
      return activeCloudProjectId
        ? (cloudProjects.find(
            (project) => project.id === activeCloudProjectId && project.deletedAt === null,
          ) ?? null)
        : null;
    }
    return activeLocalProjectId
      ? (localProjects.find((project) => project.id === activeLocalProjectId) ?? null)
      : null;
  }, [activeCloudProjectId, activeLocalProjectId, activeMode, cloudProjects, localProjects]);
  const clearNewChatProject = useCallback(() => setActiveProject(null), [setActiveProject]);
  const projectDefaultModelId = useCloudProjectStore((s) =>
    s.activeProjectId ? (s.details[s.activeProjectId]?.defaultModelId ?? null) : null,
  );
  const hasActiveProjectDetails = useCloudProjectStore((s) =>
    s.activeProjectId ? s.details[s.activeProjectId] !== undefined : true,
  );
  const conversationModelShown = useModelStore((s) => s.conversationModelShown);
  const newChatProjectKey = newChatProject ? `${activeMode}:${newChatProject.id}` : null;
  const previousNewChatProjectKeyRef = useRef(newChatProjectKey);

  useEffect(() => {
    const previous = previousNewChatProjectKeyRef.current;
    previousNewChatProjectKeyRef.current = newChatProjectKey;
    if (previous === null || previous === newChatProjectKey || !composerFocusedRef.current) return;
    useModelStore.getState().endConversationModel();
  }, [newChatProjectKey]);

  useEffect(() => {
    if (activeMode !== 'cloud' || !isClerkSignedIn || hasActiveProjectDetails) return;
    const controller = new AbortController();
    void refreshCloudProjectDetails(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [activeMode, hasActiveProjectDetails, isClerkSignedIn]);

  useEffect(() => {
    if (activeMode !== 'cloud' || !activeCloudProjectId || !projectDefaultModelId) return;
    if (conversationModelShown) return;
    if (
      !isSelectableModelIdForAccess(projectDefaultModelId, cloudUnlocked, subscriptionTier) ||
      executionModeForSelection(projectDefaultModelId, 'cloud') !== 'cloud'
    ) {
      return;
    }
    useModelStore.getState().showConversationModel(projectDefaultModelId);
  }, [
    activeCloudProjectId,
    activeMode,
    cloudUnlocked,
    conversationModelShown,
    projectDefaultModelId,
    subscriptionTier,
  ]);
  const handleSelectNewChatModel = useCallback(
    (modelId: string) => {
      if (newChatProject) useModelStore.getState().showConversationModel(modelId);
      else setModel(modelId);
    },
    [newChatProject, setModel],
  );
  const selectedSkillName =
    activeMode === 'cloud' && clerkUserId && skillSelection?.ownerId === clerkUserId
      ? skillSelection.name
      : undefined;

  useEffect(() => {
    if (
      isClerkLoaded &&
      skillSelection &&
      (!clerkUserId || skillSelection.ownerId !== clerkUserId)
    ) {
      clearSelectedSkill();
    }
  }, [clearSelectedSkill, clerkUserId, isClerkLoaded, skillSelection]);
  const hasReadyLocalModel = useMemo(
    () =>
      [...installedModelIds, ...readySystemModelIds].some((modelId) =>
        Boolean(getSelectableModelById(modelId)),
      ),
    [installedModelIds, readySystemModelIds],
  );
  const { t } = useTranslation();
  const newChatWorkspace = useNewChatWorkspace(
    activeMode === 'cloud' && isClerkSignedIn,
    t('navPersonalWorkspace'),
  );
  const cloudChatAvailable = FEATURES.cloudChat && Boolean(DEFAULT_CLOUD_MODEL_ID);

  const workSwitchVisible =
    activeMode === 'cloud' && canUseBillingPlanCapability(subscriptionTier, 'agi_work');
  const [composerMultiline, setComposerMultiline] = useState(false);
  const usageLimit = useWorkUsageLimit({
    metered: activeMode === 'cloud' && isClerkSignedIn,
  });
  const workUsageCardShown =
    workSwitchVisible && workMode === 'agiwork' && usageLimit.exhaustedRecovery !== null;

  useEffect(() => {
    if (workSwitchVisible && !isClerkLoaded) return;
    if (workMode === 'agiwork' && (!workSwitchVisible || !cloudUnlocked || !isClerkSignedIn)) {
      setWorkMode('chat');
    }
  }, [cloudUnlocked, isClerkLoaded, isClerkSignedIn, setWorkMode, workMode, workSwitchVisible]);

  const modelForSend = useMemo(() => {
    return resolveNewConversationModel({
      selectedModel,
      mode: activeMode,
      subscriptionTier,
      installedModelIds,
      readySystemModelIds,
      defaultLocalModelDownloading,
    });
  }, [
    activeMode,
    defaultLocalModelDownloading,
    installedModelIds,
    readySystemModelIds,
    selectedModel,
    subscriptionTier,
  ]);

  const sendPreviewInput = useMemo<SendPreviewInput>(
    () => ({
      providerMode: (activeMode === 'cloud' ? 'ManagedGateway' : 'Local') satisfies ProviderMode,
      ...(activeMode === 'cloud' ? { destinationHost: new URL(API_URL).host } : {}),
      modelLabel: modelForSend ? getShortDisplayName(modelForSend, subscriptionTier) : undefined,
      modelId: modelForSend,
    }),
    [activeMode, modelForSend, subscriptionTier],
  );
  const sendPreviewPresentation = useMemo(
    () => summarizeSendPreview(sendPreviewInput),
    [sendPreviewInput],
  );

  useEffect(() => {
    if (appMode === 'cloud' && (!isClerkSignedIn || !clerkUserId)) return;
    void loadConversations({ firstPageOnly: appMode === 'cloud' });
  }, [appMode, clerkUserId, isClerkSignedIn, loadConversations]);

  useEffect(() => {
    if (appMode === 'cloud') {
      if (!cloudChatAvailable || !DEFAULT_CLOUD_MODEL_ID) {
        setAppMode('local');
        useModelStore.getState().restoreNewChatModel();
        return;
      }
      if (!isClerkLoaded) return;
      if (!isClerkSignedIn) {
        fallBackToLocalMode();
        useModelStore.getState().restoreNewChatModel();
        return;
      }
      if (!cloudUnlocked) return;
      if (executionModeForSelection(selectedModel, appMode) !== 'cloud') {
        useModelStore.getState().restoreNewChatModel();
      }
      return;
    }

    if (executionModeForSelection(selectedModel, appMode) !== 'local') {
      useModelStore.getState().restoreNewChatModel();
    }
  }, [
    appMode,
    cloudChatAvailable,
    cloudUnlocked,
    isClerkLoaded,
    isClerkSignedIn,
    selectedModel,
    setAppMode,
    subscriptionTier,
  ]);

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const params = useLocalSearchParams<{ from?: string }>();
  const startedFromProject = openedFromProject(params.from);
  const drawerNavigation = startedFromProject ? navigation.getParent() : undefined;
  const backToProject = startedFromProject && (drawerNavigation?.canGoBack() ?? false);
  const handleBackToProject = useCallback(() => {
    void speechOwner?.stop().catch(() => undefined);
    drawerNavigation?.goBack();
  }, [drawerNavigation, speechOwner]);
  const greetingTime = useGreetingTime();
  const greetingName = useGreetingName();
  const greeting = resolveGreetingHeadline(greetingTime, greetingName);
  const mediaKind = mediaMode === 'image' || mediaMode === 'video' ? mediaMode : null;
  const mediaHeading =
    mediaKind === 'image' ? 'Create an image' : mediaKind === 'video' ? 'Create a video' : null;
  const mediaModelId = mediaKind ? resolveMediaModelId(mediaKind, selectedMediaModel) : null;
  const mediaModelName = mediaModelId ? getModelMetadataById(mediaModelId)?.name : undefined;

  const handleSend = useCallback(
    async (
      text: string,
      attachments?: Attachment[],
      dispatchOptions?: {
        awaitCompletion?: boolean;
        onAccepted?: () => void;
        onOpenConversation?: (conversationId: string) => void;
      },
    ): Promise<boolean> => {
      const openCreatedConversation = (conversationId: string) => {
        dispatchOptions?.onOpenConversation?.(conversationId);
        if (startedFromProject) router.setParams({ from: undefined });
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
      };
      const entryAccount = activeMode === 'cloud' ? captureCloudAccountEpoch() : null;
      const entryAccountCurrent = () => !entryAccount || isCloudAccountEpochCurrent(entryAccount);
      let discardAbandoned: (() => void) | null = null;
      try {
        if (activeMode === 'cloud' && !FEATURES.cloudChat) {
          Alert.alert(
            'AGI Cloud is unavailable in this build',
            'Local Mode is still available on this device.',
          );
          return false;
        }
        const trimmed = text.trim();
        if (refuseFilteredSend(trimmed)) return false;
        const skillNameForTurn = activeMode === 'cloud' ? selectedSkillName : undefined;

        const videoRequest = skillNameForTurn
          ? ({ status: 'not_requested' } as const)
          : resolveMobileVideoGenerationRequest({
              executionMode: activeMode,
              text: trimmed,
              mediaMode,
              aspectRatio: videoAspectRatio,
              resolution: videoResolution,
              durationSecs: videoDurationSecs,
              subscriptionTier,
              isClerkSignedIn,
              ownerId: clerkUserId,
              grantedCapabilities,
              isOnline,
            });
        if (videoRequest.status === 'blocked') {
          Alert.alert(videoRequest.alert.title, videoRequest.alert.message);
          return false;
        }
        if (videoRequest.status === 'ready') {
          const title =
            videoRequest.prompt.length > 40
              ? videoRequest.prompt.slice(0, 40).trim() + '...'
              : videoRequest.prompt;
          if (!(await sharingAllowedWhile(entryAccountCurrent))) return false;
          const conversationId = await createConversation(title);
          openCreatedConversation(conversationId);
          useChatViewStore.getState().resetMediaChoice('video');

          const videoTurn = runVideoGenerationTurn({
            conversationId,
            displayText: trimmed,
            prompt: videoRequest.prompt,
            model: videoRequest.model,
            aspectRatio: videoRequest.aspectRatio,
            resolution: videoRequest.resolution,
            durationSecs: videoRequest.durationSecs,
            ownerId: videoRequest.ownerId,
            begin: beginVideoGeneration,
            taskCreated: recordVideoGenerationTask,
            isCancelRequested: isVideoGenerationCancelRequested,
            progress: updateVideoGenerationProgress,
            complete: completeVideoGeneration,
            fail: failVideoGeneration,
            remove: deleteMessage,
            onPaywall: (error) => {
              setPaywallError(paywallErrorStateFromApiError(error));
            },
            onUnexpectedError: (error) => {
              console.warn('[ChatTabScreen] Video generation failed:', error);
            },
          });
          if (dispatchOptions?.awaitCompletion) await videoTurn;
          else void videoTurn;
          return true;
        }

        const imageRequest = skillNameForTurn
          ? ({ status: 'not_requested' } as const)
          : resolveMobileImageGenerationRequest({
              executionMode: activeMode,
              text: trimmed,
              mediaMode,
              selection: modelForSend ?? selectedModel,
              subscriptionTier,
              attachments: attachments ?? [],
              globalImageGenerationEnabled: FEATURES.imageGen,
              imageGenerationEnabled,
              isClerkSignedIn,
              ownerId: clerkUserId,
              grantedCapabilities,
              isOnline,
              aspectRatio: imageAspectRatio,
              transparentBackground: imageTransparentBackground,
            });

        if (imageRequest.status === 'blocked') {
          if (imageRequest.code !== 'plan_required' || !imageRequest.prompt) {
            alertBlockedImageRequest(imageRequest);
            return false;
          }
          const account = captureCloudAccountEpoch();
          if (!account || account.ownerId !== clerkUserId) {
            Alert.alert(
              FREE_IMAGE_OFFER_UNKNOWN_ALERT.title,
              FREE_IMAGE_OFFER_UNKNOWN_ALERT.message,
            );
            return false;
          }
          const selection = useModelStore.getState().selectedModel;
          const projectId = useCloudProjectStore.getState().activeProjectId;
          const focusGeneration = composerFocusGenerationRef.current;
          const imageModel = useChatViewStore.getState().selectedMediaModel.image;
          const isRequestCurrent = () =>
            isCloudAccountEpochCurrent(account) &&
            composerFocusedRef.current &&
            composerFocusGenerationRef.current === focusGeneration &&
            useChatAppModeStore.getState().appMode === activeMode &&
            useModelStore.getState().selectedModel === selection &&
            useCloudProjectStore.getState().activeProjectId === projectId &&
            useChatViewStore.getState().mediaMode === mediaMode &&
            useChatViewStore.getState().selectedMediaModel.image === imageModel;
          const offer = await freeImageOfferFor(imageRequest, account);
          if (!isRequestCurrent()) return false;
          if (offer.status !== 'offered') {
            if (offer.status === 'unknown') {
              Alert.alert(
                FREE_IMAGE_OFFER_UNKNOWN_ALERT.title,
                FREE_IMAGE_OFFER_UNKNOWN_ALERT.message,
              );
            } else {
              alertBlockedImageRequest(imageRequest);
            }
            return false;
          }
          const title =
            offer.prompt.length > 40 ? offer.prompt.slice(0, 40).trim() + '...' : offer.prompt;
          if (!(await sharingAllowedWhile(isRequestCurrent))) return false;
          const conversationId = await createConversation(title, projectId ?? undefined);
          if (!isRequestCurrent()) return false;
          const accepted = dispatchOptions?.awaitCompletion
            ? await sendMessage(conversationId, offer.prompt, offer.model)
            : await resolveOnAcceptedSend(
                (onAccepted) =>
                  sendMessage(conversationId, offer.prompt, offer.model, undefined, { onAccepted }),
                () => {
                  if (isRequestCurrent())
                    setSendError('Image request could not be sent. Please try again.');
                },
              );
          if (accepted && isRequestCurrent()) {
            openCreatedConversation(conversationId);
            useChatViewStore.getState().resetMediaChoice('image');
          }
          return accepted;
        }
        if (imageRequest.status === 'ready') {
          const title =
            imageRequest.prompt.length > 40
              ? imageRequest.prompt.slice(0, 40).trim() + '...'
              : imageRequest.prompt;
          if (!(await sharingAllowedWhile(entryAccountCurrent))) return false;
          const conversationId = await createConversation(title);
          openCreatedConversation(conversationId);
          useChatViewStore.getState().resetMediaChoice('image');

          const imageTurn = runImageGenerationTurn({
            conversationId,
            displayText: trimmed,
            prompt: imageRequest.prompt,
            model: imageRequest.model,
            aspectRatio: imageRequest.aspectRatio,
            transparentBackground: imageRequest.transparentBackground,
            operation: imageRequest.operation,
            sourceImage: imageRequest.sourceImage,
            referenceImages: imageRequest.referenceImages,
            ownerId: imageRequest.ownerId,
            onStarted: dispatchOptions?.onAccepted,
            begin: beginImageGeneration,
            complete: completeImageGeneration,
            fail: failImageGeneration,
            remove: deleteMessage,
            onPaywall: (error) => {
              setPaywallError(paywallErrorStateFromApiError(error));
            },
            onUnexpectedError: (error) => {
              console.warn('[ChatTabScreen] Image generation failed:', error);
            },
          });
          if (dispatchOptions?.awaitCompletion) await imageTurn;
          else void imageTurn;
          return true;
        }

        if (!modelForSend) return false;
        if (activeMode === 'cloud' && !isOnline) {
          Alert.alert(OFFLINE_NEW_CLOUD_CHAT_ALERT.title, OFFLINE_NEW_CLOUD_CHAT_ALERT.message);
          return false;
        }
        const fallbackTitle = attachments?.[0]?.fileName ?? 'New chat';
        const titleSource = trimmed || fallbackTitle;
        const title =
          titleSource.length > 40 ? titleSource.slice(0, 40).trim() + '...' : titleSource;
        if (activeMode === 'cloud' && !(await sharingAllowedWhile(entryAccountCurrent))) {
          return false;
        }
        const needingUpload =
          activeMode === 'cloud'
            ? (attachments ?? []).filter((attachment) => !attachment.assetId)
            : [];
        if (needingUpload.length > 0) {
          if (!(await agreeToCloudUploadAhead(needingUpload))) return false;
          if (!entryAccountCurrent()) {
            takeCloudUploadAgreedAhead(needingUpload);
            return false;
          }
        }
        const conversationId = await createConversation(title);
        // Files go up before the message is stored, so the chat opens only once
        // the send is accepted: a failed upload leaves the draft where it was.
        const asksToUpload = needingUpload.length > 0;
        let opened = false;
        const openOnce = () => {
          if (opened) return;
          opened = true;
          openCreatedConversation(conversationId);
        };
        if (!asksToUpload) openOnce();
        discardAbandoned = () => {
          if (!opened) void discardUnsentConversation(conversationId);
        };
        const sendOptions = skillNameForTurn
          ? { skillName: skillNameForTurn, skillTools: selectedSkillTools(skillSelection) }
          : {};
        if (dispatchOptions?.awaitCompletion) {
          const accepted = await sendMessage(conversationId, trimmed, modelForSend, attachments, {
            ...sendOptions,
            onAccepted: () => {
              openOnce();
              dispatchOptions.onAccepted?.();
            },
          });
          if (accepted) openOnce();
          else discardAbandoned();
          if (accepted && skillNameForTurn) clearSelectedSkill();
          return accepted;
        }
        const accepted = await resolveOnAcceptedSend(
          (onAccepted) =>
            sendMessage(conversationId, trimmed, modelForSend, attachments, {
              ...sendOptions,
              onAccepted: () => {
                openOnce();
                onAccepted();
              },
            }),
          (err) => {
            console.warn('[ChatTabScreen] sendMessage rejected:', err);
            setSendError('Message could not be sent. Please try again.');
          },
        );
        if (accepted) openOnce();
        else discardAbandoned();
        if (accepted && skillNameForTurn) clearSelectedSkill();
        return accepted;
      } catch (err) {
        discardAbandoned?.();
        if (!entryAccountCurrent()) return false;
        console.warn('[ChatTabScreen] createConversation failed:', err);
        Alert.alert(
          'Could not start the chat',
          toUserMessage(
            err instanceof Error && err.cause ? err.cause : err,
            'Something went wrong. Please try again.',
          ),
        );
        return false;
      }
    },
    [
      activeMode,
      createConversation,
      discardUnsentConversation,
      sendMessage,
      modelForSend,
      subscriptionTier,
      grantedCapabilities,
      imageGenerationEnabled,
      isClerkSignedIn,
      clerkUserId,
      router,
      startedFromProject,
      isOnline,
      beginImageGeneration,
      completeImageGeneration,
      failImageGeneration,
      beginVideoGeneration,
      recordVideoGenerationTask,
      isVideoGenerationCancelRequested,
      updateVideoGenerationProgress,
      completeVideoGeneration,
      failVideoGeneration,
      mediaMode,
      videoAspectRatio,
      videoResolution,
      imageAspectRatio,
      imageTransparentBackground,
      videoDurationSecs,
      selectedModel,
      deleteMessage,
      setPaywallError,
      setSendError,
      selectedSkillName,
      skillSelection,
      clearSelectedSkill,
    ],
  );

  const handleComposerSend = useCallback(
    async (text: string, attachments?: Attachment[]): Promise<ComposerSendOutcome> => {
      const opened: { conversationId?: string } = {};
      const accepted = await handleSend(text, attachments, {
        onOpenConversation: (conversationId) => {
          opened.conversationId = conversationId;
          chatInputAttachRef.current?.handOverTypingTo?.(conversationId);
        },
      });
      return accepted && opened.conversationId
        ? { openedConversationId: opened.conversationId }
        : accepted;
    },
    [handleSend],
  );

  const handleOpenModelPicker = useCallback(
    (scope?: 'local' | 'cloud') => {
      setModelPickerScope(scope ?? activeMode);
      setModelPickerOpenSignal((value) => value + 1);
      modelPickerRef.current?.snapToIndex(0);
    },
    [activeMode],
  );

  const handleOpenAddToChat = useCallback(() => {
    addToChatRef.current?.snapToIndex(0);
  }, []);

  const handleOpenStyleSelector = useCallback(() => {
    addToChatRef.current?.close();
    setTimeout(() => {
      setStyleSelectorOpenSignal((value) => value + 1);
    }, STYLE_SHEET_HANDOFF_DELAY_MS);
  }, []);

  const handleSheetProjectPicker = useCallback(() => {
    addToChatRef.current?.close();
    setTimeout(() => {
      setProjectPickerOpenSignal((value) => value + 1);
    }, STYLE_SHEET_HANDOFF_DELAY_MS);
  }, []);

  const pushFromComposer = useCallback(
    (href: RouterHref) => {
      startNewChatComposerRoundTrip();
      router.push(href);
    },
    [router],
  );

  const handleOpenCloudAccess = useCallback(() => {
    pushFromComposer(beginCloudPostAuthIntent());
  }, [pushFromComposer]);

  const handleTapWorkMode = useCallback(() => {
    if (!cloudUnlocked || !isClerkSignedIn) {
      pushFromComposer(beginCloudPostAuthIntent());
      return;
    }
    setWorkMode('agiwork');
  }, [cloudUnlocked, isClerkSignedIn, pushFromComposer, setWorkMode]);

  const handleSheetCamera = useCallback(async () => {
    const operation = activeAttachTarget()?.captureAttachmentOperation(activeMode);
    await runComposerAttachmentPick(
      operation,
      async (scope, onPicked) => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (!scope.isCurrent()) return [];
        if (status !== 'granted') {
          Alert.alert(
            'Camera Access',
            'Camera permission is required to take photos. Allow it in Settings to attach a photo.',
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Open Settings',
                onPress: () => {
                  if (scope.isCurrent()) void Linking.openSettings();
                },
              },
            ],
          );
          return [];
        }
        const assets = await captureImageAssetsFromCamera({ onPicked });
        return scope.isCurrent() ? imageAssetsToChatAttachments(assets, 'cam') : [];
      },
      (error) => {
        Alert.alert(
          'Camera',
          error instanceof PictureMetadataError
            ? PICTURE_METADATA_RECOVERY_MESSAGE
            : 'Could not open the camera. Please try again.',
        );
      },
    );
  }, [activeAttachTarget, activeMode]);

  const handleSheetPasteImage = useCallback(async () => {
    const operation = activeAttachTarget()?.captureAttachmentOperation(activeMode);
    await runComposerAttachmentPick(
      operation,
      async (scope) => {
        const attachment = await readClipboardImageAttachment();
        if (!scope.isCurrent()) return [];
        if (attachment) return [attachment];
        Alert.alert('Paste image', 'There is no image on the clipboard to paste.');
        return [];
      },
      () => {
        Alert.alert('Paste image', 'The image on the clipboard could not be pasted. Try again.');
      },
    );
  }, [activeAttachTarget, activeMode]);

  const handleSheetPhotos = useCallback(async () => {
    const operation = activeAttachTarget()?.captureAttachmentOperation(activeMode);
    await runComposerAttachmentPick(
      operation,
      async (scope, onPicked) => {
        const assets = await pickImageAssetsFromLibrary({
          allowsMultipleSelection: true,
          selectionLimit:
            attachmentLimitsFor(activeMode, subscriptionTier).filesPerMessage ??
            photoSelectionLimitForPlan(subscriptionTier),
          orderedSelection: true,
          onPicked,
        });
        return scope.isCurrent() ? imageAssetsToChatAttachments(assets) : [];
      },
      (error) => {
        Alert.alert(
          'Photos',
          error instanceof PictureMetadataError
            ? PICTURE_METADATA_RECOVERY_MESSAGE
            : 'Could not open Photos. Please try again.',
        );
      },
    );
  }, [activeAttachTarget, activeMode, subscriptionTier]);

  const handleSheetFile = useCallback(async () => {
    const operation = activeAttachTarget()?.captureAttachmentOperation(activeMode);
    await runComposerAttachmentPick(
      operation,
      async (scope) => {
        const result = await DocumentPicker.getDocumentAsync({
          type: pickableDocumentMimeTypes(activeMode),
          copyToCacheDirectory: true,
          multiple: true,
        });
        if (!scope.isCurrent() || result.canceled) return [];
        return result.assets.map((asset) => ({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          uri: asset.uri,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          fileName: asset.name ?? 'document',
          fileSize: asset.size,
        }));
      },
      () => {
        Alert.alert('Error', 'Failed to pick document. Please try again.');
      },
    );
  }, [activeAttachTarget, activeMode]);

  const handleOpenSkills = useCallback(() => {
    pushFromComposer('/(app)/skills?returnTo=composer' as RouterHref);
  }, [pushFromComposer]);

  const handleAttachFromLibrary = useCallback(
    (attachment: Attachment) => {
      activeAttachTarget()?.addAttachments([attachment]);
    },
    [activeAttachTarget],
  );

  const voiceOnboardingMode: VoiceOnboardingMode = useMemo(
    () =>
      liveVoiceModeUnavailableReason({
        executionMode: activeMode === 'cloud' ? 'cloud' : 'local',
        signedIn: isClerkSignedIn,
      })
        ? 'on-device'
        : 'live',
    [activeMode, isClerkSignedIn],
  );
  const voiceModeAvailable = onDeviceRecognizerGuaranteed() || voiceOnboardingMode === 'live';

  const startVoiceMode = useCallback(() => {
    if (!voiceAllowed) {
      Alert.alert('Voice is unavailable', CAPABILITY_SWITCHED_OFF_BODY);
      return;
    }
    const reason = liveVoiceModeUnavailableReason({
      executionMode: activeMode === 'cloud' ? 'cloud' : 'local',
      signedIn: isClerkSignedIn,
    });
    if (reason && !onDeviceRecognizerGuaranteed()) return;
    setVoiceFallbackReason(reason);
    if (reason) {
      setVoiceInlineVisible(true);
      return;
    }
    const entryAccount = captureCloudAccountEpoch();
    sharingAllowedWhile(() => !entryAccount || isCloudAccountEpochCurrent(entryAccount))
      .then(async (allowed) => {
        if (!allowed) return;
        const conversationId = await createConversation('Voice chat');
        if (startedFromProject) router.setParams({ from: undefined });
        router.push(
          `/(app)/chat/${conversationId}?voice=live` as Parameters<typeof router.push>[0],
        );
      })
      .catch(() => {
        if (!onDeviceRecognizerGuaranteed()) {
          Alert.alert('Voice is unavailable', 'The chat could not be started.');
          return;
        }
        setVoiceFallbackReason('The chat could not be started, so voice stays turn based.');
        setVoiceInlineVisible(true);
      });
  }, [
    activeMode,
    createConversation,
    isClerkSignedIn,
    router,
    setVoiceInlineVisible,
    startedFromProject,
    voiceAllowed,
  ]);

  const handleOpenVoiceMode = useCallback(() => {
    if (!voiceModeAvailable) return;
    Keyboard.dismiss();
    if (!useSettingsStore.getState().voiceOnboardingSeen) {
      setVoiceIntroVisible(true);
      return;
    }
    startVoiceMode();
  }, [startVoiceMode, voiceModeAvailable]);

  useEffect(() => {
    if (!isClerkLoaded && !onDeviceRecognizerGuaranteed()) return;
    const openVoiceOnLaunch = () => {
      if (
        takeStartWithVoiceOnLaunch() &&
        useSettingsStore.getState().voiceEnabled &&
        voiceModeAvailable
      ) {
        handleOpenVoiceMode();
      }
    };
    if (useLocalSettingsStore.persist.hasHydrated()) {
      openVoiceOnLaunch();
      return;
    }
    return useLocalSettingsStore.persist.onFinishHydration(openVoiceOnLaunch);
  }, [handleOpenVoiceMode, isClerkLoaded, voiceModeAvailable]);

  const handleVoiceIntroContinue = useCallback(() => {
    setVoiceIntroVisible(false);
    setVoicePickerVisible(true);
  }, []);

  const handleVoicePickerStart = useCallback(() => {
    setVoicePickerVisible(false);
    startVoiceMode();
  }, [startVoiceMode]);

  const handleVoicePickerDismiss = useCallback(() => {
    setVoicePickerVisible(false);
  }, []);

  const handleExitInlineVoice = useCallback(() => {
    setVoiceInlineVisible(false);
    requestAnimationFrame(() => chatInputAttachRef.current?.focus?.());
  }, [setVoiceInlineVisible]);

  const handleVoiceIntroDismiss = useCallback(() => {
    setVoiceIntroVisible(false);
  }, []);

  const handleOpenCompare = useCallback(() => {
    pushFromComposer('/(app)/compare' as RouterHref);
  }, [pushFromComposer]);
  const openUsageRecovery = usageLimit.openRecovery;
  const handleOpenUsageRecovery = useCallback(() => {
    startNewChatComposerRoundTrip();
    openUsageRecovery();
  }, [openUsageRecovery]);
  const compareAction = activeMode === 'cloud' ? handleOpenCompare : undefined;

  const handleVoiceSendMessage = useCallback(
    async (text: string): Promise<string> => {
      const send = beginVoiceAttachmentSend();
      const opened: { id: string | null; handoff: VoiceHandoffSettler | null } = {
        id: null,
        handoff: null,
      };
      try {
        const accepted = await handleSend(text, send.attachments, {
          awaitCompletion: true,
          onAccepted: send.markSent,
          onOpenConversation: (conversationId) => {
            opened.id = conversationId;
            opened.handoff = openVoiceHandoff(conversationId, text);
          },
        });
        if (!accepted) {
          throw new Error(useChatStore.getState().error ?? 'Message was not sent.');
        }
        const reply = opened.id
          ? (findNewAssistantResponse(
              useChatStore.getState().messages[opened.id] ?? [],
              new Set(),
            ) ?? '')
          : '';
        opened.handoff?.resolve(reply);
        return reply;
      } catch (err) {
        opened.handoff?.reject(err);
        throw new Error('Failed to send voice message');
      } finally {
        if (opened.id) discardVoiceHandoff(opened.id);
        send.settle();
      }
    },
    [beginVoiceAttachmentSend, handleSend],
  );

  const {
    phase: inlineVoicePhase,
    muted: inlineVoiceMuted,
    audioLevel: inlineVoiceLevel,
    handleMicPress: inlineMicPress,
  } = useVoiceConversation({
    enabled: voiceInlineVisible,
    listenOnEnable: true,
    pttMode: false,
    hapticsEnabled: useSettingsStore.getState().hapticsEnabled,
    sendMessage: handleVoiceSendMessage,
    speechOwner,
    speechOptions: speechSettings(),
    onCaptureError: (err) => {
      if (classifyVoiceFailure(err) !== 'no-speech') setVoiceInlineVisible(false);
      showVoiceCaptureFailureAlert(err);
    },
  });

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: pageBackground }} edges={['top']}>
      <View className="flex-row items-center justify-between px-4 min-h-12">
        {backToProject ? (
          <ProjectChatBackButton
            testID="chat.new-chat.back-to-project"
            projectName={newChatProject?.name}
            onPress={handleBackToProject}
          />
        ) : (
          <DrawerButton onPress={handleOpenDrawer} />
        )}
        {workSwitchVisible ? (
          <WorkModeSwitch
            workReady={cloudUnlocked && isClerkSignedIn}
            onSelectWork={handleTapWorkMode}
          />
        ) : null}
        <View style={{ minWidth: HEADER_SIDE_SLOT, alignItems: 'flex-end' }}>
          <TemporaryChatToggle />
        </View>
      </View>

      {/* Android: adjustResize already resizes the window; stacking
          behavior="height" double-handles the keyboard and causes resize
          jumps. iOS keeps "padding". */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={keyboard.behavior}
        keyboardVerticalOffset={keyboard.keyboardVerticalOffset}
      >
        <View style={{ flex: 1 }}>
          <ScrollView
            testID="chat.new-chat.middle"
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{
              flexGrow: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
              paddingTop: 24,
              paddingBottom: 16,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            accessibilityLabel={activeMode === 'cloud' ? 'New AGI Cloud chat' : 'New local chat'}
          >
            {composerMultiline ? null : (
              <>
                <View style={{ marginBottom: 16 }}>
                  <AgiMark size={NEW_CHAT_SYMBOL_SIZE} testID="chat.new-chat.symbol" />
                </View>
                <Text
                  testID="chat.new-chat.greeting"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  adjustsFontSizeToFit
                  minimumFontScale={GREETING_MINIMUM_FONT_SCALE}
                  maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                  style={{
                    fontSize: typeScale.title1,
                    lineHeight: 34,
                    fontWeight: '500',
                    color: c.textPrimary,
                    textAlign: 'center',
                    width: '100%',
                  }}
                >
                  {mediaHeading ?? greeting}
                </Text>
                {mediaHeading && mediaModelName ? (
                  <Text
                    testID="chat.new-chat.media-model"
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    maxFontSizeMultiplier={HEADER_TEXT_SCALE_LIMIT}
                    style={{
                      fontSize: typeScale.body,
                      lineHeight: 22,
                      color: c.textMuted,
                      textAlign: 'center',
                      width: '100%',
                      marginTop: 4,
                    }}
                  >
                    {`with ${mediaModelName}`}
                  </Text>
                ) : null}
              </>
            )}
            {activeMode === 'cloud' && newChatWorkspace ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 12,
                  maxWidth: 300,
                }}
              >
                {newChatWorkspace.organization ? (
                  <Building2 size={14} color={c.textMuted} />
                ) : (
                  <UserRound size={14} color={c.textMuted} />
                )}
                <Text
                  numberOfLines={1}
                  style={{ fontSize: typeScale.footnote, color: c.textMuted }}
                >
                  {t('newChat.workspace', { name: newChatWorkspace.name })}
                </Text>
              </View>
            ) : null}
            {newChatProject ? (
              <View
                testID="chat.new-chat.project"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 4,
                  maxWidth: 300,
                }}
              >
                <FolderOpen size={14} color={c.textMuted} />
                <Text
                  numberOfLines={1}
                  style={{ flexShrink: 1, fontSize: typeScale.footnote, color: c.textMuted }}
                >
                  {`In ${newChatProject.name}`}
                </Text>
                <Pressable
                  onPress={clearNewChatProject}
                  accessibilityRole="button"
                  accessibilityLabel={`Start this chat outside ${newChatProject.name}`}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={14} color={c.textMuted} />
                </Pressable>
              </View>
            ) : null}
            {activeMode === 'local' && !hasReadyLocalModel ? (
              <View
                testID="download-model-banner.column"
                style={{ ...contentColumn('reading'), marginTop: 16 }}
              >
                <DownloadModelBanner
                  onPress={() => pushFromComposer('/(app)/models' as RouterHref)}
                />
              </View>
            ) : null}
          </ScrollView>
        </View>

        {/* Mode-aware: shows local projects in Local, cloud projects in Cloud.
            Trigger lives in the "+" sheet; this renders the picker modal only. */}
        <ProjectSelectorBar openSignal={projectPickerOpenSignal} />

        {voiceInlineVisible ? null : (
          <UsageLimitBanner
            warning={workUsageCardShown ? null : usageLimit.warning}
            actionLabel={usageLimit.actionLabel}
            onAction={handleOpenUsageRecovery}
            onDismiss={usageLimit.dismissWarning}
          />
        )}
        {workMode === 'agiwork' && !voiceInlineVisible ? <ComposerApprovalModeControl /> : null}
        {voiceInlineVisible ? null : (
          <ChatInput
            onSend={handleComposerSend}
            onOpenModelPicker={handleOpenModelPicker}
            onOpenVoiceMode={voiceModeAvailable ? handleOpenVoiceMode : undefined}
            onOpenCompare={compareAction}
            onOpenAddToChat={handleOpenAddToChat}
            attachRef={chatInputAttachRef}
            attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
            sendPreview={sendPreviewInput}
            draftKey="new-chat"
            draftProvenance={composerDraftProvenance}
            selectedSkillName={selectedSkillName}
            onClearSelectedSkill={clearSelectedSkill}
            exhaustedUsageRecovery={usageLimit.exhaustedRecovery}
            onMultilineChange={setComposerMultiline}
          />
        )}
      </KeyboardAvoidingView>

      <AddToChatSheet
        destinationKey="new-chat"
        ref={addToChatRef}
        onCamera={handleSheetCamera}
        onPhotos={handleSheetPhotos}
        onPasteImage={handleSheetPasteImage}
        onFile={handleSheetFile}
        onOpenCloudAccess={handleOpenCloudAccess}
        onOpenStyleSelector={handleOpenStyleSelector}
        onOpenProjectPicker={handleSheetProjectPicker}
        onAttachFromLibrary={handleAttachFromLibrary}
        onOpenSkills={handleOpenSkills}
        onStartComposerRoundTrip={startNewChatComposerRoundTrip}
        offersOutputFormat
      />

      <StyleSelector openSignal={styleSelectorOpenSignal} />

      <ModelPickerSheet
        sheetRef={modelPickerRef}
        openSignal={modelPickerOpenSignal}
        modelScope={modelPickerScope}
        onSelect={handleSelectNewChatModel}
        onOpenCloudAccess={handleOpenCloudAccess}
        showEffort={false}
      />

      <VoiceOnboardingSheet
        visible={voiceIntroVisible}
        mode={voiceOnboardingMode}
        onContinue={handleVoiceIntroContinue}
        onDismiss={handleVoiceIntroDismiss}
      />

      {/* Inline voice: the thread stays visible, only the composer changes.
          This is the only voice presentation, every entry point lands here. */}
      <VoiceInlineBar
        visible={voiceInlineVisible}
        phase={inlineVoicePhase}
        audioLevel={inlineVoiceLevel}
        muted={inlineVoiceMuted}
        notice={voiceFallbackReason}
        attachments={voiceAttachments.attachments}
        attachmentPrivacyLabel={sendPreviewPresentation.privacyShortLabel}
        onRemoveAttachment={voiceAttachments.remove}
        onAttach={handleOpenAddToChat}
        onOpenKeyboard={handleExitInlineVoice}
        onToggleMic={inlineMicPress}
        onExit={handleExitInlineVoice}
      />

      <VoicePickerSheet
        visible={voicePickerVisible}
        onStart={handleVoicePickerStart}
        onDismiss={handleVoicePickerDismiss}
      />
    </SafeAreaView>
  );
}

interface DownloadModelBannerProps {
  onPress: () => void;
}

function DownloadModelBanner({ onPress }: DownloadModelBannerProps) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Download a model to chat"
      accessibilityHint="Opens the model library to download a local AI model"
      testID="download-model-banner"
      className="active:opacity-80"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: c.accentSurface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.accentBorder,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 16,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: c.accentSurface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Download size={16} color={c.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: typeScale.footnote, fontWeight: '600', color: c.textPrimary }}>
          Download a model to chat
        </Text>
        <Text style={{ fontSize: typeScale.caption, color: c.textMuted, marginTop: 2 }}>
          Run AI privately on this device, no account needed.
        </Text>
      </View>
    </Pressable>
  );
}
