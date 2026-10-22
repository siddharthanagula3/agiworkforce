import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import { useEffect, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Alert,
  Keyboard,
  Linking,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect, useNavigation } from 'expo-router';
import { MoreHorizontal, WifiOff, SquarePen, Menu } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { MessageList } from '@/src/features/chat/components/MessageList';
import type { ResearchPlanDecision } from '@/src/features/chat/components/research/ResearchRunCard';
import type { ResearchPlanChoices } from '@/src/features/chat/utils/researchPlanChoices';
import type { ResearchStep } from '@agiworkforce/types';
import { Composer } from '@/src/features/chat/components/Composer/Composer';
import { QuotedReplyBar } from '@/src/features/chat/components/QuotedReplyBar';
import { trackProductEvent } from '@/services/productAnalytics';
import { ContextWarningChip } from '@/src/features/chat/components/ContextWarningChip';
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';
import { confirmShareConversation } from '@/src/features/shared-links/shareConversation';
import { useMobileSkillSelectionStore } from '@/src/features/skills/selectionStore';
import { WorkModeSwitch } from '@/src/features/chat/components/WorkModeSwitch';
import { ComposerApprovalModeControl } from '@/src/features/chat/components/ComposerApprovalModeControl';
import {
  EMPTY_VARIANT_INFO,
  resolveLeafForSibling,
  variantInfoByMessage,
} from '@agiworkforce/cloud-contracts';
import { managedCloudChat } from '@/services/managedCloudChat';
import { ModeSwitchModal, type AppMode } from '@/src/features/chat/components/ModeSwitchModal';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { useComposerAttachmentHandoff } from '@/src/features/chat/useComposerAttachmentHandoff';
import { StyleSelector } from '@/src/features/chat/components/StyleSelector';
import { readClipboardImageAttachment } from '@/src/features/media/clipboard-image';
import { ProjectSelectorBar } from '@/src/features/chat/components/ProjectSelectorBar';
import { StudyModeBanner } from '@/src/features/study/StudyModeBanner';
import { FollowUpSuggestions } from '@/src/features/chat/components/FollowUpSuggestions';
import { retiredModelNotice } from '@/src/features/model-picker/retirement';
import { refreshPublishedArtifactAudiences } from '@/src/features/chat/services/artifactPublishing';
import { buildAgiWorkGoalInput } from '@/src/features/tasks/agiWorkGoal';
import { ConversationExportSheet } from '@/src/features/chat/components/ConversationExportSheet';
import { ContextDetailsSheet } from '@/src/features/chat/components/ContextDetailsSheet';
import {
  IN_FLIGHT_TURN_STALLED_MESSAGE,
  useInFlightTurnRecovery,
} from '@/src/features/chat/inFlightTurnRecovery';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import {
  VoiceOnboardingSheet,
  type VoiceOnboardingMode,
} from '@/src/features/voice/components/VoiceOnboardingSheet';
import { VoicePickerSheet } from '@/src/features/voice/components/VoicePickerSheet';
import { VoiceInlineBar } from '@/src/features/voice/components/VoiceInlineBar';
import { LiveVoiceComposer } from '@/src/features/voice/components/LiveVoiceComposer';
import { liveVoiceModeUnavailableReason } from '@/src/features/voice/services/liveVoiceAvailability';
import { CAPABILITY_SWITCHED_OFF_BODY, useCapability } from '@/src/lib/capabilities';
import { useKeyboardSafeComposer } from '@/src/features/chat/chrome/keyboardSafeComposer';
import {
  RenameConversationModal,
  useConversationActions,
} from '@/src/features/conversation-actions';
import { takeConversationSend } from '@/src/features/chat/conversationSendHandoff';
import {
  useVoiceConversation,
  voiceCaptureErrorMessage,
} from '@/src/features/voice/hooks/useVoiceConversation';
import * as TTS from '@/src/features/voice/services/tts';
import {
  createMessageIdSet,
  findNewAssistantResponse,
} from '@/src/features/voice/utils/assistantResponse';
import { Text } from '@/components/ui/text';
import {
  LOCAL_NO_MODEL_MESSAGE,
  paywallErrorStateFromApiError,
  useChatStore,
} from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { ProjectSourcesButton } from '@/src/features/projects/components/ProjectSourcesButton';
import { useWaitlistStore } from '@/src/features/waitlist';
import { ModelTierWarningBanner } from '@/src/features/chat/components/ModelTierWarningBanner';
import { TemporaryChatBanner } from '@/src/features/chat/components/TemporaryChatBanner';
import { SendErrorBanner } from '@/src/features/chat/components/SendErrorBanner';
import { ProviderConsentBanner } from '@/src/features/chat/components/ProviderConsentBanner';
import { MessageSkeleton } from '@/src/features/chat/components/MessageSkeleton';
import {
  classifyManagedQuotaErrorCode,
  formatUsageResetIn,
  managedQuotaResetAt,
  summarizeSendPreview,
  type ProviderMode,
  type SendPreviewInput,
} from '@agiworkforce/types';
import { UsageLimitBanner } from '@/src/features/chat/components/UsageLimitBanner';
import { useWorkUsageLimit } from '@/src/features/chat/hooks/useWorkUsageLimit';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
  isSelectableModelIdForAccess,
  getShortDisplayName,
} from '@/src/features/model-picker/service';
import { isCapabilityRequestable, useTierStore } from '@/src/features/billing/store';
import {
  executionModeForConversation,
  executionModeForSelection,
} from '@/src/features/chat/utils/conversationMode';
import { localModelRecovery } from '@/src/features/chat/utils/localModelRecovery';
import {
  readyLocalModelIdOr,
  useModelInstallStore,
} from '@/src/features/model-picker/installStore';
import { visibleThreadFor } from '@/src/features/chat/utils/conversationThread';
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
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { deleteCloudMessagesRemote } from '@/src/features/chat/services/cloudMessageMutations';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import * as VoiceOutput from '@/src/features/voice/services/voiceOutput';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { API_URL } from '@/lib/constants';
import { useSettingsStore } from '@/stores/settingsStore';
import { offlineQueue } from '@/services/offlineQueue';
import { createMobileCloudAgentRunClient } from '@/services/streaming';
import { ManagedCloudAgentRunReferenceSchema } from '@agiworkforce/cloud-contracts';
import { CLOUD_SIGN_IN_MESSAGE, offersModelSwitch } from '@/services/apiErrors';
import { pickableDocumentMimeTypes } from '@/services/docParser';
import { runImageGenerationTurn } from '@/src/features/chat/actions/runImageGenerationTurn';
import { runVideoGenerationTurn } from '@/src/features/chat/actions/runVideoGenerationTurn';
import {
  MediaGenerationAdmissionError,
  mediaGenerationFailureMessage,
} from '@/src/features/chat/actions/mediaGenerationError';
import { resolveMobileVideoGenerationRequest } from '@/src/features/chat/actions/resolveMobileVideoGenerationRequest';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { resolveMobileImageGenerationRequest } from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';
import { freeImageOfferFor } from '@/src/features/chat/actions/freeImageOffer';
import { alertBlockedImageRequest } from '@/src/features/chat/actions/alertBlockedImageRequest';
import { useTheme, radii } from '@/src/ui/theme';
import { typeScale } from '@/src/ui/theme/tokens';
import { useProjectStore } from '@/src/features/projects/store';
import { useAuthStore } from '@/src/features/auth/store';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import type { ChatMessage } from '@/types/chat';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';
import { toUserMessage } from '@/services/userMessage';
import { showToast } from '@/src/shared/components/Toast';
import type { ImageAreaEdit } from '@/src/features/image/components/ImageAreaEditor';

const STYLE_SHEET_HANDOFF_DELAY_MS = 450;
const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];
const MESSAGE_LOAD_FAILED = 'Messages could not be loaded. Check your connection and retry.';

interface ConversationUiActionScope {
  conversationId: string;
  ownership: AccountScopedUiState;
}

export default function ChatScreen() {
  const { colors, isDark } = useTheme();
  const pageBackground = isDark ? colors.background : colors.surfaceBase;
  const params = useLocalSearchParams<{ id: string; prompt?: string; voice?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  useFocusEffect(
    useCallback(() => {
      if (id) useChatViewStore.getState().bindStyleConversation(id);
    }, [id]),
  );
  const initialPrompt = Array.isArray(params.prompt) ? params.prompt[0] : (params.prompt ?? '');
  const requestedVoiceMode = Array.isArray(params.voice) ? params.voice[0] : params.voice;
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) =>
    s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : undefined,
  );
  const router = useRouter();
  const navigation = useNavigation();
  const modelPickerRef = useRef<BottomSheet>(null);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const [contextSheetVisible, setContextSheetVisible] = useState(false);
  const addToChatRef = useRef<BottomSheet>(null);
  const [modelPickerScope, setModelPickerScope] = useState<'local' | 'cloud'>('local');
  const [styleSelectorOpenSignal, setStyleSelectorOpenSignal] = useState(0);
  const [projectPickerOpenSignal, setProjectPickerOpenSignal] = useState(0);
  const chatInputAttachRef = useRef<
    import('@/src/features/chat/components/ChatInput').ChatInputHandle | null
  >(null);
  useComposerAttachmentHandoff(id, chatInputAttachRef);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const quotedMessageScopeRef = useRef<ConversationUiActionScope | null>(null);
  const currentConversationScopeRef = useRef<{
    conversationId: string;
    scope: 'local' | 'cloud';
  } | null>(null);
  const [modeSwitchState, setModeSwitchState] = useState<{
    visible: boolean;
    fromMode: AppMode;
    toMode: AppMode;
    pendingModelId: string;
  }>({ visible: false, fromMode: 'cloud', toMode: 'cloud', pendingModelId: '' });
  const paywallSheetRef = useRef<import('@gorhom/bottom-sheet').default>(null);
  const { isOnline, queueSize } = useNetworkStatus();

  const conversationRows = useChatStore((s) =>
    id ? (s.messages[id] ?? EMPTY_CHAT_MESSAGES) : EMPTY_CHAT_MESSAGES,
  );
  const isStreaming = useChatStore((s) => (id ? s.streamingConversationIds.includes(id) : false));
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const conversations = useChatStore((s) => s.conversations);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const workMode = useChatStore((s) => s.workMode);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setCurrentConversationId = useChatStore((s) => s.setCurrentConversationId);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setMessageReaction = useChatStore((s) => s.setMessageReaction);
  const retryMessage = useChatStore((s) => s.retryMessage);
  const resumeResearch = useChatStore((s) => s.resumeResearch);
  const editMessage = useChatStore((s) => s.editMessage);
  const resolveToolApproval = useChatStore((s) => s.resolveToolApproval);
  const setConversationModel = useChatStore((s) => s.setConversationModel);
  const forkConversation = useChatStore((s) => s.forkConversation);
  const messageLoadFailed = useChatStore(
    (s) => id !== undefined && s.messageLoadErrorConversationId === id,
  );
  const clearMessageLoadError = useChatStore((s) => s.clearMessageLoadError);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const paywallError = useChatStore((s) => s.paywallError);
  const clearPaywallError = useChatStore((s) => s.clearPaywallError);
  const setPaywallError = useChatStore((s) => s.setPaywallError);
  const sendError = useChatStore((s) => s.error);
  const sendFailureCode = useChatStore((s) => s.failureCode);
  const providerConsentError = useChatStore((s) => s.providerConsentError);
  const freeCapacityError = useChatStore((s) => s.freeCapacityError);
  const clearProviderConsentError = useChatStore((s) => s.clearProviderConsentError);
  const clearError = useChatStore((s) => s.clearError);
  const setSendError = useChatStore((s) => s.setSendError);
  const enqueueOfflineMessage = useChatStore((s) => s.enqueueOfflineMessage);
  const resolveOfflineMessage = useChatStore((s) => s.resolveOfflineMessage);
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
  const videoAspectRatio = useChatViewStore((s) => s.videoAspectRatio);
  const videoResolution = useChatViewStore((s) => s.videoResolution);
  const imageAspectRatio = useChatViewStore((s) => s.imageAspectRatio);
  const imageTransparentBackground = useChatViewStore((s) => s.imageTransparentBackground);
  const videoDurationSecs = useChatViewStore((s) => s.videoDurationSecs);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const imageGenerationEnabled = useChatStore((s) => s.features.imageGen);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const skillSelection = useMobileSkillSelectionStore((s) => s.selection);
  const clearSelectedSkill = useMobileSkillSelectionStore((s) => s.clearSkill);
  const appMode = useChatAppModeStore((s) => s.appMode);

  const setAppMode = useChatAppModeStore((s) => s.setAppMode);

  const conversationActions = useConversationActions();
  const { openActions } = conversationActions;
  const conversation = conversations.find((c) => c.id === id);
  // Branches are resolved here rather than in the store so the abandoned turns
  // stay in memory for the pager, and so a conversation that has never branched
  // keeps the very array the store holds.
  const conversationMessages = useMemo(
    () => visibleThreadFor(conversationRows, conversation),
    [conversationRows, conversation],
  );
  const title = conversation?.title ?? 'Chat';
  const conversationExecutionMode = conversation
    ? executionModeForConversation(conversation)
    : executionModeForSelection(selectedModel, appMode);
  const inFlightTurn = useInFlightTurnRecovery({
    conversationId: id,
    isCloud: conversationExecutionMode === 'cloud',
    isStreaming: isStreaming || isLoadingMessages,
    messages: conversationMessages,
    onFinished: () => {
      if (id) void loadMessages(id);
    },
  });
  const variantInfo = useMemo(
    () =>
      conversationExecutionMode === 'cloud'
        ? variantInfoByMessage(conversationRows, conversation?.activeLeafMessageId)
        : EMPTY_VARIANT_INFO,
    [conversationExecutionMode, conversationRows, conversation?.activeLeafMessageId],
  );

  const sendPreviewInput = useMemo<SendPreviewInput>(
    () => ({
      providerMode: (conversationExecutionMode === 'cloud'
        ? 'ManagedGateway'
        : 'Local') satisfies ProviderMode,
      ...(conversationExecutionMode === 'cloud' ? { destinationHost: new URL(API_URL).host } : {}),
      modelLabel: getShortDisplayName(selectedModel, subscriptionTier),
      modelId: selectedModel,
    }),
    [conversationExecutionMode, selectedModel, subscriptionTier],
  );

  const usageLimit = useWorkUsageLimit({
    metered: conversationExecutionMode === 'cloud' && isClerkSignedIn,
    isStreaming,
    refreshKey: paywallError,
  });
  const usageSnapshot = usageLimit.snapshot;
  const workUsageCardShown = workMode === 'agiwork' && usageLimit.exhaustedRecovery !== null;
  const paywallPresentation = classifyManagedQuotaErrorCode(paywallError?.code);
  const paywallResetAt =
    paywallPresentation?.showResetTime && usageSnapshot
      ? managedQuotaResetAt(paywallError?.code, {
          usageResetAt: usageSnapshot.usageResetAt,
          sessionResetAt: usageSnapshot.sessionResetAt,
          weeklyResetAt: usageSnapshot.weeklyResetAt,
          flagshipWeeklyResetAt: usageSnapshot.flagshipWeeklyResetAt,
        })
      : null;
  const paywallResetLabel = paywallResetAt ? formatUsageResetIn(paywallResetAt) : null;
  const sendPreviewPresentation = useMemo(
    () => summarizeSendPreview(sendPreviewInput),
    [sendPreviewInput],
  );

  const isConversationActionCurrent = useCallback(
    (action: ConversationUiActionScope | null | undefined) => {
      const current = currentConversationScopeRef.current;
      return Boolean(
        action &&
        current &&
        action.conversationId === current.conversationId &&
        isAccountScopedUiStateCurrent(action.ownership, current.scope),
      );
    },
    [],
  );

  const captureConversationAction = useCallback((): ConversationUiActionScope | null => {
    if (!id) return null;
    const ownership = captureAccountScopedUiState(conversationExecutionMode);
    return ownership ? { conversationId: id, ownership } : null;
  }, [conversationExecutionMode, id]);

  useLayoutEffect(() => {
    currentConversationScopeRef.current = {
      conversationId: id,
      scope: conversationExecutionMode,
    };
    if (quotedMessage && !isConversationActionCurrent(quotedMessageScopeRef.current)) {
      quotedMessageScopeRef.current = null;
      setQuotedMessage(null);
    }
  }, [clerkUserId, conversationExecutionMode, id, isConversationActionCurrent, quotedMessage]);

  useEffect(() => {
    if (!id) return;
    setCurrentConversationId(id);
    loadMessages(id);
    markConversationRead(id);

    return () => {
      setCurrentConversationId(null);
    };
  }, [id, setCurrentConversationId, loadMessages, markConversationRead]);

  const stopSpeaking = useCallback(() => {
    void VoiceOutput.stop();
  }, []);

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  useEffect(() => {
    if (paywallError) {
      paywallSheetRef.current?.expand();
    }
  }, [paywallError]);

  const handleSend = useCallback(
    (
      text: string,
      attachments?: Attachment[],
      dispatchOptions?: { awaitCompletion?: boolean },
    ): boolean | Promise<boolean> => {
      if (!id) return false;
      stopSpeaking?.();
      if (conversationExecutionMode === 'cloud' && !FEATURES.cloudChat) {
        Alert.alert(
          'AGI Cloud is unavailable in this build',
          'Local Mode is still available on this device.',
        );
        return false;
      }

      let finalText = text;
      const currentQuote =
        quotedMessage && isConversationActionCurrent(quotedMessageScopeRef.current)
          ? quotedMessage
          : null;
      if (quotedMessage && !currentQuote) {
        quotedMessageScopeRef.current = null;
        setQuotedMessage(null);
      }
      if (currentQuote) {
        const quoteLabel =
          currentQuote.role === 'user' ? 'You' : (currentQuote.model ?? 'Assistant');
        const quotePreview =
          currentQuote.content.length > 150
            ? currentQuote.content.slice(0, 150).trim() + '...'
            : currentQuote.content;
        finalText = `> ${quoteLabel}: ${quotePreview}\n\n${text}`;
      }

      const trimmedInput = text.trim();

      const videoRequest = resolveMobileVideoGenerationRequest({
        executionMode: conversationExecutionMode,
        text: trimmedInput,
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
        let started = false;
        const videoTurn = runVideoGenerationTurn({
          conversationId: id,
          displayText: finalText,
          prompt: videoRequest.prompt,
          model: videoRequest.model,
          aspectRatio: videoRequest.aspectRatio,
          resolution: videoRequest.resolution,
          durationSecs: videoRequest.durationSecs,
          ownerId: videoRequest.ownerId,
          onStarted: () => {
            started = true;
            clearError();
            quotedMessageScopeRef.current = null;
            setQuotedMessage(null);
          },
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
            console.warn('[ChatScreen] Video generation failed:', error);
            setSendError(
              !started && error instanceof MediaGenerationAdmissionError
                ? error.userMessage
                : mediaGenerationFailureMessage('video'),
            );
          },
        });
        if (dispatchOptions?.awaitCompletion) {
          return videoTurn.then((outcome) => outcome.assistantMessageId !== null);
        }
        void videoTurn;
        return started;
      }

      const imageRequest = resolveMobileImageGenerationRequest({
        executionMode: conversationExecutionMode,
        text: trimmedInput,
        mediaMode,
        selection: selectedModel,
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
        if (imageRequest.prompt === undefined) {
          alertBlockedImageRequest(imageRequest);
          return false;
        }
        return freeImageOfferFor(imageRequest).then((offer) => {
          if (!offer) {
            alertBlockedImageRequest(imageRequest);
            return false;
          }
          clearError();
          return sendMessage(id, offer.prompt, offer.model);
        });
      }
      if (imageRequest.status === 'ready') {
        let started = false;
        const imageTurn = runImageGenerationTurn({
          conversationId: id,
          displayText: finalText,
          prompt: imageRequest.prompt,
          model: imageRequest.model,
          aspectRatio: imageRequest.aspectRatio,
          transparentBackground: imageRequest.transparentBackground,
          operation: imageRequest.operation,
          sourceImage: imageRequest.sourceImage,
          referenceImages: imageRequest.referenceImages,
          ownerId: imageRequest.ownerId,
          onStarted: () => {
            started = true;
            clearError();
            quotedMessageScopeRef.current = null;
            setQuotedMessage(null);
          },
          begin: beginImageGeneration,
          complete: completeImageGeneration,
          fail: failImageGeneration,
          remove: deleteMessage,
          onPaywall: (error) => {
            setPaywallError(paywallErrorStateFromApiError(error));
          },
          onUnexpectedError: (error) => {
            console.warn('[ChatScreen] Image generation failed:', error);
            setSendError(
              !started && error instanceof MediaGenerationAdmissionError
                ? error.userMessage
                : mediaGenerationFailureMessage('image'),
            );
          },
        });
        if (dispatchOptions?.awaitCompletion) {
          return imageTurn.then((outcome) => outcome.assistantMessageId !== null);
        }
        void imageTurn;
        return started;
      }

      if (!isOnline && conversationExecutionMode === 'cloud') {
        if (!clerkUserId) {
          Alert.alert(
            'Sign in to queue this message',
            'AGI Cloud messages are tied to your account and cannot be queued without an active session.',
          );
          return false;
        }
        quotedMessageScopeRef.current = null;
        setQuotedMessage(null);
        let entry;
        try {
          entry = offlineQueue.enqueue({
            conversationId: id,
            content: finalText,
            model: selectedModel,
            provenance: { scope: 'cloud', ownerId: clerkUserId },
          });
        } catch {
          Alert.alert(
            'Account changed',
            'This Cloud message was not queued because the active account changed. Please try again.',
          );
          return false;
        }
        enqueueOfflineMessage(id, finalText, selectedModel, entry.id);
        return true;
      }

      const skillNameForTurn =
        conversationExecutionMode === 'cloud' &&
        clerkUserId &&
        skillSelection?.ownerId === clerkUserId
          ? skillSelection.name
          : undefined;
      const sendOptions = skillNameForTurn ? { skillName: skillNameForTurn } : {};

      quotedMessageScopeRef.current = null;
      setQuotedMessage(null);
      if (dispatchOptions?.awaitCompletion) {
        return sendMessage(id, finalText, selectedModel, attachments, sendOptions)
          .then((accepted) => {
            if (accepted && skillNameForTurn) clearSelectedSkill();
            return accepted;
          })
          .catch((err: unknown) => {
            console.warn('[ChatScreen] sendMessage rejected:', err);
            setSendError('Message could not be sent. Please try again.');
            return false;
          });
      }
      return resolveOnAcceptedSend(
        (onAccepted) =>
          sendMessage(id, finalText, selectedModel, attachments, {
            ...sendOptions,
            onAccepted,
          }),
        (err) => {
          console.warn('[ChatScreen] sendMessage rejected:', err);
          setSendError('Message could not be sent. Please try again.');
        },
      ).then((accepted) => {
        if (accepted && skillNameForTurn) clearSelectedSkill();
        return accepted;
      });
    },
    [
      id,
      conversationExecutionMode,
      selectedModel,
      subscriptionTier,
      grantedCapabilities,
      imageGenerationEnabled,
      imageTransparentBackground,
      videoDurationSecs,
      isClerkSignedIn,
      sendMessage,
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
      deleteMessage,
      setPaywallError,
      setSendError,
      clearError,
      stopSpeaking,
      quotedMessage,
      isConversationActionCurrent,
      isOnline,
      clerkUserId,
      skillSelection,
      clearSelectedSkill,
      enqueueOfflineMessage,
      imageAspectRatio,
      videoAspectRatio,
      videoResolution,
    ],
  );

  useEffect(() => {
    if (!id || isStreaming || isLoadingMessages) return;
    const handedOff = takeConversationSend(id);
    if (handedOff) void handleSend(handedOff);
  }, [handleSend, id, isLoadingMessages, isStreaming]);

  const handleStop = useCallback(() => {
    trackProductEvent('generation_stopped');
    stopStreaming();
  }, [stopStreaming]);

  const [resumingResearchMessageId, setResumingResearchMessageId] = useState<string | null>(null);

  const runResearchDecision = useCallback(
    async (
      messageId: string,
      decision: 'start' | 'cancel' | 'retry',
      steps?: ResearchStep[],
      choices?: ResearchPlanChoices,
    ) => {
      if (!id) return;
      if (decision === 'cancel') {
        await resumeResearch(id, messageId, decision);
        return;
      }
      setResumingResearchMessageId(messageId);
      try {
        await resumeResearch(id, messageId, decision, steps, choices);
      } finally {
        setResumingResearchMessageId(null);
      }
    },
    [id, resumeResearch],
  );

  const handleResearchPlanDecision = useCallback(
    (messageId: string, decision: ResearchPlanDecision) => {
      if (decision === 'cancel') void runResearchDecision(messageId, 'cancel');
      else void runResearchDecision(messageId, 'start', decision.steps, decision.choices);
    },
    [runResearchDecision],
  );

  const handleRetryResearch = useCallback(
    (messageId: string) => {
      void runResearchDecision(messageId, 'retry');
    },
    [runResearchDecision],
  );

  const handlePauseResearch = useCallback(
    async (messageId: string): Promise<boolean> => {
      const reference = ManagedCloudAgentRunReferenceSchema.safeParse(
        conversationMessages.find((message) => message.id === messageId)?.metadata?.cloudAgentRun,
      );
      if (!reference.success) {
        setSendError('This research cannot be paused. Stop it instead to keep what it found.');
        return false;
      }
      try {
        await createMobileCloudAgentRunClient().pauseRun(reference.data.runId);
        return true;
      } catch {
        setSendError('Could not pause this research. It is still running.');
        return false;
      }
    },
    [conversationMessages, setSendError],
  );

  const resolveAppMode = useCallback(
    (modelId: string): AppMode => {
      return executionModeForSelection(modelId, conversationExecutionMode);
    },
    [conversationExecutionMode],
  );

  const retryWithModelRef = useRef<string | null>(null);

  const handleOpenModelPicker = useCallback(
    (scope?: 'local' | 'cloud') => {
      retryWithModelRef.current = null;
      setModelPickerScope(scope ?? conversationExecutionMode);
      setModelPickerOpenSignal((value) => value + 1);
      modelPickerRef.current?.snapToIndex(0);
    },
    [conversationExecutionMode],
  );

  useEffect(() => {
    if (conversationExecutionMode !== 'cloud' || !isClerkSignedIn) return;
    refreshPublishedArtifactAudiences().catch((error: unknown) => {
      console.warn('[ChatScreen] publication states unavailable', error);
    });
  }, [clerkUserId, conversationExecutionMode, id, isClerkSignedIn]);

  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);

  useEffect(() => {
    if (!conversation) return;
    setAppMode(conversationExecutionMode);
    const preferredModel =
      conversationExecutionMode === 'cloud'
        ? conversation.model &&
          executionModeForSelection(conversation.model, conversationExecutionMode) === 'cloud' &&
          isSelectableModelIdForAccess(conversation.model, cloudUnlocked, subscriptionTier)
          ? conversation.model
          : (getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID)
        : conversation.model &&
            executionModeForSelection(conversation.model, conversationExecutionMode) === 'local'
          ? conversation.model
          : readyLocalModelIdOr(DEFAULT_LOCAL_MODEL_ID);

    if (!preferredModel) return;
    if (conversationExecutionMode === 'cloud' && !cloudUnlocked) return;
    if (useModelStore.getState().selectedModel !== preferredModel) {
      useModelStore.getState().setModel(preferredModel);
    }
  }, [cloudUnlocked, conversation, conversationExecutionMode, setAppMode, subscriptionTier]);

  const installedModelIds = useModelInstallStore((state) => state.installedModelIds);
  const readySystemModelIds = useModelInstallStore((state) => state.readySystemModelIds);

  const localRecovery = useMemo(
    () =>
      localModelRecovery({
        executionMode: conversationExecutionMode,
        isNoLocalModelError: sendError === LOCAL_NO_MODEL_MESSAGE,
        selectedModelId: selectedModel,
        installedModelIds,
        readySystemModelIds,
        displayNameFor: (modelId) => getShortDisplayName(modelId, subscriptionTier),
      }),
    [
      conversationExecutionMode,
      installedModelIds,
      readySystemModelIds,
      selectedModel,
      sendError,
      subscriptionTier,
    ],
  );

  const localRecoveryAction = useMemo(() => {
    if (!localRecovery) return null;
    return {
      label: localRecovery.label,
      onPress: () => {
        if (localRecovery.kind === 'open-models') {
          clearError();
          router.push('/(app)/models' as Parameters<typeof router.push>[0]);
          return;
        }
        if (!localRecovery.modelId) return;
        useModelStore.getState().setModel(localRecovery.modelId);
        clearError();
        if (!id) return;
        const lastUser = [...conversationMessages].reverse().find((m) => m.role === 'user');
        if (lastUser) retryMessage(id, lastUser.id);
      },
    };
  }, [clearError, conversationMessages, id, localRecovery, retryMessage, router]);

  const handleOpenCloudSignIn = useCallback(() => {
    router.push(beginCloudPostAuthIntent());
  }, [router]);

  const sendRecoveryAction = useMemo(() => {
    if (localRecoveryAction) return localRecoveryAction;
    if (sendError === CLOUD_SIGN_IN_MESSAGE) {
      return {
        label: 'Sign in',
        onPress: () => {
          clearError();
          handleOpenCloudSignIn();
        },
      };
    }
    if (
      sendFailureCode &&
      sendFailureCode.message === sendError &&
      offersModelSwitch(sendFailureCode.code)
    ) {
      return {
        label: 'Switch model',
        onPress: () => {
          clearError();
          handleOpenModelPicker();
        },
      };
    }
    return null;
  }, [
    clearError,
    handleOpenCloudSignIn,
    handleOpenModelPicker,
    localRecoveryAction,
    sendError,
    sendFailureCode,
  ]);

  const handleRetryWithModel = useCallback(
    (messageId: string) => {
      setModelPickerScope(conversationExecutionMode);
      setModelPickerOpenSignal((value) => value + 1);
      modelPickerRef.current?.snapToIndex(0);
      retryWithModelRef.current = messageId;
    },
    [conversationExecutionMode],
  );

  const branchingRef = useRef(false);
  const handleBranchFromMessage = useCallback(
    async (messageId: string) => {
      if (!id || branchingRef.current) return;
      branchingRef.current = true;
      try {
        const branchId = await forkConversation(id, {
          forkPointMessageId: messageId,
          title: `${title} (branch)`,
        });
        showToast('Conversation branch created');
        router.push(`/(app)/chat/${branchId}` as Parameters<typeof router.push>[0]);
      } catch (error) {
        Alert.alert(
          'Could not create conversation branch',
          toUserMessage(error, 'Check your connection and try again.'),
        );
      } finally {
        branchingRef.current = false;
      }
    },
    [forkConversation, id, router, title],
  );

  const retiredNotice = retiredModelNotice(conversation?.model);
  const lastMessage = conversationMessages[conversationMessages.length - 1];
  const followUpTarget =
    conversationExecutionMode === 'cloud' &&
    !conversation?.temporary &&
    !isStreaming &&
    lastMessage?.role === 'assistant' &&
    !lastMessage.isStreaming &&
    lastMessage.content.trim().length > 0 &&
    !lastMessage.metadata?.research
      ? lastMessage.id
      : null;

  const handleScheduleMessage = useCallback(
    (messageId: string) => {
      const source = conversationMessages.find((message) => message.id === messageId);
      if (!source?.content.trim()) return;
      router.push({
        pathname: '/(app)/schedules/create',
        params: {
          prompt: source.content,
          ...(source.model ? { model: source.model } : {}),
        },
      });
    },
    [conversationMessages, router],
  );

  const handleModelSelect = useCallback(
    (newModelId: string) => {
      const retryTarget = retryWithModelRef.current;
      retryWithModelRef.current = null;
      const hasMessages = conversationMessages.length > 0;
      const nextMode = resolveAppMode(newModelId);
      if (!hasMessages) {
        setAppMode(nextMode === 'cloud' ? 'cloud' : 'local');
        if (id && nextMode === conversationExecutionMode) {
          void setConversationModel(id, newModelId);
        }
        useModelStore.getState().setModel(newModelId);
        modelPickerRef.current?.close();
        return;
      }

      const currentMode = conversationExecutionMode;

      if (currentMode !== nextMode) {
        modelPickerRef.current?.close();
        setModeSwitchState({
          visible: true,
          fromMode: currentMode,
          toMode: nextMode,
          pendingModelId: newModelId,
        });
        return;
      }

      if (id) void setConversationModel(id, newModelId);
      useModelStore.getState().setModel(newModelId);
      modelPickerRef.current?.close();
      if (id && retryTarget) {
        stopSpeaking();
        trackProductEvent('response_regenerated');
        retryMessage(id, retryTarget, newModelId);
      }
    },
    [
      conversationExecutionMode,
      conversationMessages.length,
      id,
      resolveAppMode,
      retryMessage,
      setAppMode,
      setConversationModel,
      stopSpeaking,
    ],
  );

  const handleModeSwitchConfirm = useCallback(async () => {
    const nextModelId = modeSwitchState.pendingModelId;
    if (!nextModelId) return;

    useModelStore.getState().setModel(nextModelId);
    setAppMode(modeSwitchState.toMode === 'cloud' ? 'cloud' : 'local');
    setModeSwitchState((s) => ({ ...s, visible: false }));
  }, [modeSwitchState.pendingModelId, modeSwitchState.toMode, setAppMode]);

  const handleModeSwitchCancel = useCallback(() => {
    setModeSwitchState((s) => ({ ...s, visible: false }));
  }, []);

  const handleOpenAddToChat = useCallback(() => {
    addToChatRef.current?.snapToIndex(0);
  }, []);

  const handleOpenStyleSelector = useCallback(() => {
    addToChatRef.current?.close();
    setTimeout(() => {
      setStyleSelectorOpenSignal((value) => value + 1);
    }, STYLE_SHEET_HANDOFF_DELAY_MS);
  }, []);

  const handleSheetModelPicker = useCallback(() => {
    addToChatRef.current?.close();
    setTimeout(() => {
      handleOpenModelPicker();
    }, STYLE_SHEET_HANDOFF_DELAY_MS);
  }, [handleOpenModelPicker]);

  const handlePaywallChooseModel = useCallback(() => {
    setTimeout(() => {
      handleOpenModelPicker('cloud');
    }, STYLE_SHEET_HANDOFF_DELAY_MS);
  }, [handleOpenModelPicker]);

  const handleSheetProjectPicker = useCallback(() => {
    addToChatRef.current?.close();
    setTimeout(() => {
      setProjectPickerOpenSignal((value) => value + 1);
    }, STYLE_SHEET_HANDOFF_DELAY_MS);
  }, []);

  const handleOpenConnectors = useCallback(() => {
    if (!FEATURES.connectors) {
      handleOpenCloudSignIn();
      return;
    }
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [handleOpenCloudSignIn, router]);

  const handleSheetCamera = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Camera Access',
          'Camera permission is required to take photos. Allow it in Settings to attach a photo.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
      const assets = await captureImageAssetsFromCamera();
      if (assets.length > 0) {
        chatInputAttachRef.current?.addAttachments(imageAssetsToChatAttachments(assets, 'cam'));
      }
    } catch (error) {
      Alert.alert(
        'Camera',
        error instanceof PictureMetadataError
          ? PICTURE_METADATA_RECOVERY_MESSAGE
          : 'Could not open the camera. Please try again.',
      );
    }
  }, []);

  const handleSheetPasteImage = useCallback(async () => {
    try {
      const attachment = await readClipboardImageAttachment();
      if (attachment) chatInputAttachRef.current?.addAttachments([attachment]);
      else Alert.alert('Paste image', 'There is no image on the clipboard to paste.');
    } catch {
      Alert.alert('Paste image', 'The image on the clipboard could not be pasted. Try again.');
    }
  }, []);

  const handleSheetPhotos = useCallback(async () => {
    try {
      const assets = await pickImageAssetsFromLibrary({
        allowsMultipleSelection: true,
        selectionLimit: 5,
        orderedSelection: true,
      });
      if (assets.length > 0) {
        const attachments = imageAssetsToChatAttachments(assets);
        chatInputAttachRef.current?.addAttachments(attachments);
      }
    } catch (error) {
      Alert.alert(
        'Photos',
        error instanceof PictureMetadataError
          ? PICTURE_METADATA_RECOVERY_MESSAGE
          : 'Could not open Photos. Please try again.',
      );
    }
  }, []);

  const handleSheetFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: pickableDocumentMimeTypes(conversationExecutionMode),
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const attachments: Attachment[] = result.assets.map((asset) => ({
          id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          uri: asset.uri,
          mimeType: asset.mimeType ?? 'application/octet-stream',
          fileName: asset.name ?? 'document',
          fileSize: asset.size,
        }));
        chatInputAttachRef.current?.addAttachments(attachments);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
  }, [conversationExecutionMode]);

  const handleSelectVariant = useCallback(
    (messageId: string) => {
      if (!id || isStreaming) return;
      const leafId = resolveLeafForSibling(conversationRows, messageId);
      useChatCloudMessageStore
        .getState()
        .patchCloudConversation(id, { activeLeafMessageId: leafId });
      managedCloudChat.updateConversation(id, { activeLeafMessageId: leafId }).catch((error) => {
        console.warn('[ChatScreen] The chosen version was not saved for other devices:', error);
      });
    },
    [conversationRows, id, isStreaming],
  );

  const handleOpenSkills = useCallback(() => {
    router.push('/(app)/skills?returnTo=composer' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleAttachFromLibrary = useCallback((attachment: Attachment) => {
    chatInputAttachRef.current?.addAttachments([attachment]);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [voiceIntroVisible, setVoiceIntroVisible] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [voiceInlineVisible, setVoiceInlineVisible] = useState(false);
  const [liveVoiceVisible, setLiveVoiceVisible] = useState(false);
  const voiceAllowed = useCapability('canUseVoice');
  const keyboard = useKeyboardSafeComposer('screen');
  const [voiceFallbackReason, setVoiceFallbackReason] = useState<string | null>(null);
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const handleNewChat = useCallback(() => {
    router.push('/(app)' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const handleQuoteReply = useCallback(
    (message: ChatMessage) => {
      const actionScope = captureConversationAction();
      if (!actionScope || !isConversationActionCurrent(actionScope)) return;
      quotedMessageScopeRef.current = actionScope;
      setQuotedMessage(message);
    },
    [captureConversationAction, isConversationActionCurrent],
  );

  const handleDismissQuote = useCallback(() => {
    quotedMessageScopeRef.current = null;
    setQuotedMessage(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await loadMessages(id);
    setRefreshing(false);
  }, [id, loadMessages]);

  const voiceOnboardingMode: VoiceOnboardingMode = useMemo(
    () =>
      liveVoiceModeUnavailableReason({
        executionMode: conversationExecutionMode,
        signedIn: isClerkSignedIn,
      })
        ? 'on-device'
        : 'live',
    [conversationExecutionMode, isClerkSignedIn],
  );

  const startVoiceMode = useCallback(() => {
    if (!voiceAllowed) {
      Alert.alert('Voice is unavailable', CAPABILITY_SWITCHED_OFF_BODY);
      return;
    }
    const reason = liveVoiceModeUnavailableReason({
      executionMode: conversationExecutionMode,
      signedIn: isClerkSignedIn,
    });
    setVoiceFallbackReason(reason);
    if (reason) {
      setVoiceInlineVisible(true);
      return;
    }
    setLiveVoiceVisible(true);
  }, [conversationExecutionMode, isClerkSignedIn, voiceAllowed]);

  const handleOpenVoiceMode = useCallback(() => {
    Keyboard.dismiss();
    if (!useSettingsStore.getState().voiceOnboardingSeen) {
      setVoiceIntroVisible(true);
      return;
    }
    startVoiceMode();
  }, [startVoiceMode]);

  const handleVoiceIntroContinue = useCallback(() => {
    setVoiceIntroVisible(false);
    setVoicePickerVisible(true);
  }, []);

  const handleVoiceIntroDismiss = useCallback(() => {
    setVoiceIntroVisible(false);
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
  }, []);

  const handleEnsureVoiceConversation = useCallback(async () => id ?? null, [id]);

  const handleVoiceStartWorkTask = useCallback(
    (goal: string) => {
      const agiWorkGoal = buildAgiWorkGoalInput(goal);
      if (!id || !agiWorkGoal || !isCapabilityRequestable('canUseAgiWork')) return false;
      void sendMessage(id, goal, selectedModel, undefined, { workMode: 'agiwork', agiWorkGoal });
      return true;
    },
    [id, selectedModel, sendMessage],
  );

  useEffect(() => {
    if (requestedVoiceMode !== 'live') return;
    startVoiceMode();
  }, [requestedVoiceMode, startVoiceMode]);

  const handleLiveVoiceEnded = useCallback((message: string | null) => {
    setLiveVoiceVisible(false);
    if (message) setVoiceFallbackReason(message);
  }, []);

  const handleSwitchLiveVoiceToText = useCallback(() => {
    setLiveVoiceVisible(false);
    requestAnimationFrame(() => chatInputAttachRef.current?.focus?.());
  }, []);

  const handleVoiceAttach = useCallback(() => {
    setVoiceInlineVisible(false);
    handleOpenAddToChat();
  }, [handleOpenAddToChat]);

  const handleOpenCompare = useCallback(() => {
    router.push('/(app)/compare' as Parameters<typeof router.push>[0]);
  }, [router]);
  const compareAction = conversationExecutionMode === 'cloud' ? handleOpenCompare : undefined;

  const handleOpenExport = useCallback(() => {
    setExportSheetVisible(true);
  }, []);

  const handleVoiceSendMessage = useCallback(
    async (text: string): Promise<string> => {
      if (!id) throw new Error('No conversation');
      stopSpeaking();
      const previousMessageIds = createMessageIdSet(useChatStore.getState().messages[id] ?? []);
      const accepted = await handleSend(text, undefined, { awaitCompletion: true });
      if (!accepted) {
        throw new Error(useChatStore.getState().error ?? 'Message was not sent. Please try again.');
      }
      return (
        findNewAssistantResponse(useChatStore.getState().messages[id] ?? [], previousMessageIds) ??
        ''
      );
    },
    [handleSend, id, stopSpeaking],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!id) return;
      if (conversationExecutionMode === 'cloud') {
        const accountEpoch = captureCloudAccountEpoch();
        if (!isCloudAccountEpochCurrent(accountEpoch)) return;
        const previous = useChatCloudMessageStore.getState().messages[id];
        useChatCloudMessageStore.getState().deleteCloudMessage(id, messageId);
        deleteCloudMessagesRemote(id, [messageId], accountEpoch).catch(() => {
          if (!isCloudAccountEpochCurrent(accountEpoch)) return;
          if (previous) {
            useChatCloudMessageStore.getState().setCloudMessages(id, previous);
          }
          Alert.alert('Could not delete message', 'Check your connection and try again.');
        });
        return;
      }
      deleteMessage(id, messageId);
    },
    [id, deleteMessage, conversationExecutionMode],
  );

  const handleReaction = useCallback(
    (messageId: string, reaction: 'thumbsUp' | 'thumbsDown' | null) => {
      if (!id) return;
      void setMessageReaction(id, messageId, reaction).catch(() => {
        Alert.alert('Could not save rating', 'Check your connection or sign in, then try again.');
      });
    },
    [id, setMessageReaction],
  );

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      if (!id) return;
      stopSpeaking();
      const messageIndex = conversationMessages.findIndex((message) => message.id === messageId);
      const target = messageIndex >= 0 ? conversationMessages[messageIndex] : undefined;
      const failedQueueId = target?.queueFailed ? target.offlineQueueId : undefined;
      if (target && failedQueueId) {
        void Promise.resolve(handleSend(target.content))
          .then((accepted) => {
            if (accepted) resolveOfflineMessage(id, failedQueueId);
          })
          .catch((err: unknown) => {
            console.warn('[ChatScreen] Resending a failed queued message failed:', err);
            setSendError('Message could not be sent. Please try again.');
          });
        return;
      }
      if (
        target?.role === 'assistant' &&
        (target.type === 'video' ||
          target.videoGenStatus === 'failed' ||
          target.videoGenStatus === 'timeout' ||
          target.videoGenStatus === 'cancelled')
      ) {
        const original = conversationMessages[messageIndex - 1];
        const prompt = target.videoGenPrompt?.trim() || original?.content.trim();
        if (prompt) {
          void Promise.resolve(
            handleSend(/^\/video(?:\s|$)/i.test(prompt) ? prompt : `/video ${prompt}`),
          );
          return;
        }
      }
      if (
        target?.role === 'assistant' &&
        (target.type === 'image' || target.imageGenStatus === 'failed')
      ) {
        const original = conversationMessages[messageIndex - 1];
        if (original?.role === 'user') {
          void Promise.resolve(handleSend(original.content));
          return;
        }
      }
      trackProductEvent('response_regenerated');
      retryMessage(id, messageId);
    },
    [
      conversationMessages,
      handleSend,
      id,
      resolveOfflineMessage,
      retryMessage,
      setSendError,
      stopSpeaking,
    ],
  );

  const handleProviderConsentEnabled = useCallback(() => {
    clearProviderConsentError();
    clearError();
    if (!id) return;
    const lastUser = [...conversationMessages].reverse().find((m) => m.role === 'user');
    if (lastUser) retryMessage(id, lastUser.id);
  }, [clearError, clearProviderConsentError, conversationMessages, id, retryMessage]);

  const handleProviderConsentDismiss = useCallback(() => {
    clearProviderConsentError();
    clearError();
  }, [clearError, clearProviderConsentError]);

  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!id) return;
      stopSpeaking();
      editMessage(id, messageId, newContent);
    },
    [id, editMessage, stopSpeaking],
  );

  const handleResolveToolApproval = useCallback(
    (
      messageId: string,
      toolCallId: string,
      decision: 'approved' | 'rejected',
      guidance?: string,
    ) => {
      if (!id) return;
      void resolveToolApproval(id, messageId, toolCallId, decision, guidance);
    },
    [id, resolveToolApproval],
  );

  const handleBack = useCallback(() => {
    stopSpeaking();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    }
  }, [router, stopSpeaking]);

  const canEditImages =
    conversationExecutionMode === 'cloud' &&
    isClerkSignedIn &&
    FEATURES.imageGen &&
    imageGenerationEnabled;

  const handleEditImageArea = useCallback(
    (message: ChatMessage, edit: ImageAreaEdit) => {
      if (!id || !clerkUserId || !message.model) return;
      void runImageGenerationTurn({
        conversationId: id,
        displayText: edit.prompt,
        prompt: edit.prompt,
        model: message.model,
        operation: 'inpaint',
        sourceImageBase64: edit.sourceBase64,
        maskImageBase64: edit.maskBase64,
        ownerId: clerkUserId,
        begin: beginImageGeneration,
        complete: completeImageGeneration,
        fail: failImageGeneration,
        remove: deleteMessage,
        onPaywall: (error) => setPaywallError(paywallErrorStateFromApiError(error)),
        onUnexpectedError: () => setSendError(mediaGenerationFailureMessage('image')),
      });
    },
    [
      beginImageGeneration,
      clerkUserId,
      completeImageGeneration,
      deleteMessage,
      failImageGeneration,
      id,
      setPaywallError,
      setSendError,
    ],
  );

  const handleDeleteImageConversation = useCallback(() => {
    const actionScope = captureConversationAction();
    if (!id || !actionScope || !isConversationActionCurrent(actionScope)) return;
    deleteConversation(id);
    handleBack();
  }, [captureConversationAction, deleteConversation, handleBack, id, isConversationActionCurrent]);

  const shareConversationLink = useCallback(
    (actionScope: ConversationUiActionScope) => {
      if (!id || !isConversationActionCurrent(actionScope)) return;
      if (conversation?.temporary) {
        Alert.alert(
          'Save this chat to share it?',
          'Saving moves it into your history like any other chat.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save chat',
              onPress: () => {
                if (!isConversationActionCurrent(actionScope)) return;
                useChatStore
                  .getState()
                  .keepTemporaryConversation(id)
                  .then(() =>
                    Alert.alert('Chat saved', 'It is in your history. You can share it now.'),
                  )
                  .catch((error: unknown) => {
                    Alert.alert(
                      'This chat could not be saved',
                      toUserMessage(error, 'Try again in a moment.'),
                    );
                  });
              },
            },
          ],
        );
        return;
      }
      confirmShareConversation({
        conversationId: id,
        title,
        modelId: conversation?.model ?? null,
        readMessages: () =>
          conversationMessages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.createdAt ? { createdAt: message.createdAt } : {}),
          })),
        isCurrent: () => isConversationActionCurrent(actionScope),
      });
    },
    [conversation, conversationMessages, id, isConversationActionCurrent, title],
  );

  const handleMenuPress = useCallback(() => {
    const actionScope = captureConversationAction();
    if (!id || !actionScope || !isConversationActionCurrent(actionScope)) return;
    const cloud = conversationExecutionMode === 'cloud';
    const whenCurrent = (run: () => void) => () => {
      if (isConversationActionCurrent(actionScope)) run();
    };
    openActions(id, title, conversation?.pinned === true, {
      extraActions: [
        ...(cloud && conversation?.temporary
          ? [
              {
                key: 'share-temporary',
                label: 'Share link',
                run: () => shareConversationLink(actionScope),
              },
            ]
          : []),
        {
          key: 'export',
          label: 'Export',
          run: whenCurrent(() => setExportSheetVisible(true)),
        },
        {
          key: 'context',
          label: 'What is in context',
          run: whenCurrent(() => setContextSheetVisible(true)),
        },
      ],
      onDeleted: handleBack,
    });
  }, [
    captureConversationAction,
    conversation?.pinned,
    conversation?.temporary,
    conversationExecutionMode,
    handleBack,
    id,
    isConversationActionCurrent,
    openActions,
    shareConversationLink,
    title,
  ]);

  const {
    phase: inlineVoicePhase,
    muted: inlineVoiceMuted,
    audioLevel: inlineVoiceLevel,
    toggleMute: inlineToggleMute,
  } = useVoiceConversation({
    enabled: voiceInlineVisible,
    pttMode: false,
    hapticsEnabled: useSettingsStore.getState().hapticsEnabled,
    sendMessage: handleVoiceSendMessage,
    speak: (text, callbacks) =>
      TTS.speak(text, { ...TTS.speechOptionsFromSettings(), ...callbacks }),
    stopSpeaking: () => TTS.stop(),
    onCaptureError: (err) => {
      setVoiceInlineVisible(false);
      Alert.alert('Voice unavailable', voiceCaptureErrorMessage(err));
    },
  });

  if (!id) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: pageBackground }}
      >
        <Text style={{ color: colors.textMuted }}>No conversation selected</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: pageBackground }} edges={['top']}>
      {/* Android: adjustResize (Expo default softwareKeyboardLayoutMode) already
          resizes the window; stacking behavior="height" on top double-handles
          the keyboard and causes resize jumps. iOS keeps "padding". */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={keyboard.behavior}
        keyboardVerticalOffset={keyboard.keyboardVerticalOffset}
      >
        {/* Chat header: circular hamburger left, circular
            new-chat + menu right -- same pill-chrome language as the home
            tab header (app/(app)/(tabs)/chat.tsx), applied here for the
            in-conversation screen. */}
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
            onPress={handleOpenDrawer}
            hitSlop={6}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: radii.full,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
            })}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
          >
            <Menu size={18} color={colors.textSecondary} />
          </Pressable>

          {conversationExecutionMode === 'local' && activeProjectId && activeProject ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(app)/projects/[id]' as const,
                  params: { id: activeProjectId },
                })
              }
              hitSlop={6}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 12,
                height: 32,
                borderRadius: radii.full,
                backgroundColor: colors.inputSurface,
                maxWidth: 120,
                flexShrink: 1,
              }}
              accessibilityLabel={`Active project: ${activeProject.name}. Tap to view details.`}
              accessibilityRole="button"
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: typeScale.caption, color: colors.teal, fontWeight: '500' }}
              >
                {activeProject.name}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleMenuPress}
            style={{ flex: 1, minHeight: 32, justifyContent: 'center', paddingHorizontal: 4 }}
            accessibilityLabel={`${title}. Open conversation menu`}
            accessibilityRole="button"
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: typeScale.callout,
                fontWeight: '600',
                color: colors.textPrimary,
              }}
            >
              {title}
            </Text>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ProjectSourcesButton projectId={conversation?.projectId} />
            <Pressable
              onPress={handleNewChat}
              hitSlop={6}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
              })}
              accessibilityLabel="New chat"
              accessibilityRole="button"
            >
              <SquarePen size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={handleMenuPress}
              hitSlop={6}
              style={({ pressed }) => ({
                width: 32,
                height: 32,
                borderRadius: radii.full,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
              })}
              accessibilityLabel="Conversation menu"
              accessibilityRole="button"
            >
              <MoreHorizontal size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {!isOnline && conversationExecutionMode === 'cloud' && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: colors.dangerSurface,
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: colors.dangerBorder,
            }}
          >
            <WifiOff size={12} color={colors.agentError} />
            <Text style={{ fontSize: typeScale.caption, color: colors.agentError }}>
              You're offline, viewing cached conversations
            </Text>
          </View>
        )}

        <TemporaryChatBanner />

        {retiredNotice ? (
          <View
            testID="retired-model-notice"
            accessibilityRole="alert"
            style={{ paddingHorizontal: 16, paddingVertical: 6 }}
          >
            <Text style={{ color: colors.agentWarning, fontSize: typeScale.footnote }}>
              {retiredNotice}
            </Text>
          </View>
        ) : null}

        {id && conversationExecutionMode === 'cloud' && !conversation?.temporary ? (
          <StudyModeBanner conversationId={id} />
        ) : null}

        <SendErrorBanner
          error={messageLoadFailed ? MESSAGE_LOAD_FAILED : null}
          onRetry={() => {
            if (id) void loadMessages(id);
          }}
          onDismiss={clearMessageLoadError}
        />

        <View style={liveVoiceVisible ? { display: 'none' } : { flex: 1 }}>
          {isLoadingMessages && conversationMessages.length === 0 ? (
            <MessageSkeleton />
          ) : (
            <MessageList
              messages={conversationMessages}
              onDeleteMessage={handleDeleteMessage}
              onReaction={handleReaction}
              onRetryMessage={handleRetryMessage}
              onRetryWithModel={handleRetryWithModel}
              onBranch={conversation?.temporary ? undefined : handleBranchFromMessage}
              onScheduleMessage={
                conversationExecutionMode === 'cloud' && !conversation?.temporary
                  ? handleScheduleMessage
                  : undefined
              }
              footer={
                followUpTarget && id ? (
                  <FollowUpSuggestions
                    conversationId={id}
                    messageId={followUpTarget}
                    onSelect={(prompt) => void handleSend(prompt)}
                  />
                ) : null
              }
              onEditImageArea={canEditImages ? handleEditImageArea : undefined}
              onDeleteImageConversation={handleDeleteImageConversation}
              variantInfoByMessageId={variantInfo}
              onSelectVariant={handleSelectVariant}
              onSwitchModel={handleOpenModelPicker}
              onResearchPlanDecision={handleResearchPlanDecision}
              onRetryResearch={handleRetryResearch}
              onStopResearch={handleStop}
              onPauseResearch={handlePauseResearch}
              resumingResearchMessageId={resumingResearchMessageId}
              onEditMessage={handleEditMessage}
              onRefresh={handleRefresh}
              refreshing={refreshing}
              onQuoteReply={handleQuoteReply}
              onResolveToolApproval={handleResolveToolApproval}
            />
          )}
        </View>

        {quotedMessage && <QuotedReplyBar message={quotedMessage} onDismiss={handleDismissQuote} />}

        {/* Context-budget warning. The component computes its own threshold and
            renders null below it, so it is mounted unconditionally, it appears
            only once the thread crosses ~70% of the model's context window. */}
        {inFlightTurn !== 'idle' ? (
          <View
            accessibilityRole={inFlightTurn === 'stalled' ? 'alert' : undefined}
            accessibilityLiveRegion="polite"
            testID="chat-in-flight-turn"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            {inFlightTurn === 'running' ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : null}
            <Text
              style={{
                flex: 1,
                fontSize: typeScale.footnote,
                color: inFlightTurn === 'stalled' ? colors.agentError : colors.textSecondary,
              }}
            >
              {inFlightTurn === 'running'
                ? 'Still answering. The reply appears here when it is ready.'
                : IN_FLIGHT_TURN_STALLED_MESSAGE}
            </Text>
          </View>
        ) : null}
        <ContextWarningChip
          modelId={selectedModel}
          messages={conversationMessages}
          onStartFreshChat={handleNewChat}
        />

        <ModelTierWarningBanner />

        <UsageLimitBanner
          warning={workUsageCardShown ? null : usageLimit.warning}
          actionLabel={usageLimit.actionLabel}
          onAction={usageLimit.openRecovery}
          onDismiss={usageLimit.dismissWarning}
        />

        <ProviderConsentBanner
          state={providerConsentError}
          onEnabled={handleProviderConsentEnabled}
          onDismiss={handleProviderConsentDismiss}
        />

        <SendErrorBanner
          error={providerConsentError ? null : sendError}
          freeCapacity={providerConsentError ? null : freeCapacityError}
          action={sendRecoveryAction}
          onRetry={
            sendError !== CLOUD_SIGN_IN_MESSAGE &&
            !sendError?.startsWith('The active AGI Cloud account changed') &&
            conversationMessages.some((m) => m.role === 'user')
              ? () => {
                  if (!id) return;
                  const lastUser = [...conversationMessages]
                    .reverse()
                    .find((m) => m.role === 'user');
                  clearError();
                  if (lastUser) retryMessage(id, lastUser.id);
                }
              : undefined
          }
          onDismiss={clearError}
        />

        {/* Composer.
            Hidden in inline voice mode: VoiceInlineBar IS the composer there,
            and rendering both stacked two input rows on screen at once, which
            is neither reference-03 nor what VoiceInlineBar's own docstring
            promises ("the only thing that changes is the composer"). */}
        {conversationExecutionMode === 'cloud' && !voiceInlineVisible && !liveVoiceVisible ? (
          <WorkModeSwitch />
        ) : null}
        {conversationExecutionMode === 'cloud' &&
        workMode === 'agiwork' &&
        !voiceInlineVisible &&
        !liveVoiceVisible ? (
          <ComposerApprovalModeControl />
        ) : null}
        {voiceInlineVisible || liveVoiceVisible ? null : (
          <Composer
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={handleStop}
            onOpenModelPicker={handleOpenModelPicker}
            onOpenVoiceMode={handleOpenVoiceMode}
            onOpenCompare={compareAction}
            onOpenExport={handleOpenExport}
            onOpenAddToChat={handleOpenAddToChat}
            isOnline={conversationExecutionMode === 'local' || isOnline}
            queueSize={queueSize}
            attachRef={chatInputAttachRef}
            sendPreview={sendPreviewInput}
            attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
            isThreadActive={conversationMessages.length > 0}
            exhaustedUsageRecovery={usageLimit.exhaustedRecovery}
            initialText={initialPrompt || undefined}
            draftKey={id}
            draftProvenance={
              conversationExecutionMode === 'local'
                ? { scope: 'local' }
                : clerkUserId
                  ? { scope: 'cloud', ownerId: clerkUserId }
                  : undefined
            }
            selectedSkillName={
              conversationExecutionMode === 'cloud' &&
              clerkUserId &&
              skillSelection?.ownerId === clerkUserId
                ? skillSelection.name
                : undefined
            }
            onClearSelectedSkill={clearSelectedSkill}
          />
        )}

        <AddToChatSheet
          ref={addToChatRef}
          onCamera={handleSheetCamera}
          onPhotos={handleSheetPhotos}
          onPasteImage={handleSheetPasteImage}
          onFile={handleSheetFile}
          onOpenCloudAccess={handleOpenCloudSignIn}
          onOpenStyleSelector={handleOpenStyleSelector}
          onOpenModelPicker={handleSheetModelPicker}
          onOpenProjectPicker={handleSheetProjectPicker}
          onAttachFromLibrary={handleAttachFromLibrary}
          onOpenSkills={handleOpenSkills}
          offersOutputFormat
        />

        <StyleSelector openSignal={styleSelectorOpenSignal} />

        <ProjectSelectorBar
          openSignal={projectPickerOpenSignal}
          {...(conversation && id
            ? {
                conversation: {
                  id,
                  ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
                  executionMode: conversationExecutionMode,
                },
              }
            : {})}
        />

        {/* Model picker bottom sheet, conversationId scopes the reasoning-effort
            selector to this conversation (agentControlStore override). */}
        <ModelPickerSheet
          sheetRef={modelPickerRef}
          openSignal={modelPickerOpenSignal}
          modelScope={modelPickerScope}
          conversationId={id}
          onSelect={handleModelSelect}
          onOpenCloudAccess={handleOpenCloudSignIn}
          offerRoutingProfiles
        />

        {/* First-run intro carrying the recording disclosure, then the voice
            picker, then the inline bar. The thread above stays visible for the
            inline mode, references-2 voice-03. */}
        <VoiceOnboardingSheet
          visible={voiceIntroVisible}
          mode={voiceOnboardingMode}
          onContinue={handleVoiceIntroContinue}
          onDismiss={handleVoiceIntroDismiss}
        />

        <VoicePickerSheet
          visible={voicePickerVisible}
          onStart={handleVoicePickerStart}
          onDismiss={handleVoicePickerDismiss}
        />

        <VoiceInlineBar
          visible={voiceInlineVisible}
          phase={inlineVoicePhase}
          audioLevel={inlineVoiceLevel}
          muted={inlineVoiceMuted}
          notice={voiceFallbackReason}
          onAttach={handleVoiceAttach}
          onOpenKeyboard={handleExitInlineVoice}
          onToggleMic={inlineToggleMute}
          onExit={handleExitInlineVoice}
        />

        {/* Full-duplex voice for a cloud conversation: the same live session the
            web app runs, sharing this conversation's thread. */}
        <LiveVoiceComposer
          visible={liveVoiceVisible}
          conversationId={id ?? null}
          model={selectedModel}
          ensureConversation={handleEnsureVoiceConversation}
          onSwitchToText={handleSwitchLiveVoiceToText}
          onEnded={handleLiveVoiceEnded}
          onStartWorkTask={handleVoiceStartWorkTask}
        />

        <ConversationExportSheet
          visible={exportSheetVisible}
          onClose={() => setExportSheetVisible(false)}
          messages={conversationMessages}
          title={title}
        />

        <ContextDetailsSheet
          visible={contextSheetVisible}
          modelId={selectedModel}
          messages={conversationMessages}
          onClose={() => setContextSheetVisible(false)}
          onStartFreshChat={handleNewChat}
        />

        <PaywallBottomSheet
          ref={paywallSheetRef}
          feature={paywallError?.feature ?? 'token_cap'}
          requiredTier={paywallError?.requiredTier ?? 'basic'}
          reason={paywallError?.reason}
          recoveryAction={paywallError?.recoveryAction}
          resetLabel={paywallResetLabel}
          onChooseStandardModel={
            paywallPresentation?.suggestStandardModel ? handlePaywallChooseModel : undefined
          }
          onDismiss={clearPaywallError}
        />

        <ModeSwitchModal
          visible={modeSwitchState.visible}
          fromMode={modeSwitchState.fromMode}
          toMode={modeSwitchState.toMode}
          onConfirm={handleModeSwitchConfirm}
          onCancel={handleModeSwitchCancel}
        />

        <RenameConversationModal rename={conversationActions.rename} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
