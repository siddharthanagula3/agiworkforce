import { useEffect, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  Alert,
  Keyboard,
  Modal,
  TextInput,
} from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from 'expo-router';
import { MoreHorizontal, WifiOff, SquarePen, Menu } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { MessageList } from '@/src/features/chat/components/MessageList';
import { Composer } from '@/src/features/chat/components/Composer/Composer';
import {
  TASK_CHIP_SEND_CONTEXT,
  type TaskChipType,
} from '@/src/features/chat/components/TaskChips';
import { QuotedReplyBar } from '@/src/features/chat/components/QuotedReplyBar';
import { ContextWarningChip } from '@/src/features/chat/components/ContextWarningChip';
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';
import { ModeSwitchModal, type AppMode } from '@/src/features/chat/components/ModeSwitchModal';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { StyleSelector } from '@/src/features/chat/components/StyleSelector';
import { ProjectSelectorBar } from '@/src/features/chat/components/ProjectSelectorBar';
import { ConversationExportSheet } from '@/src/features/chat/components/ConversationExportSheet';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { VoiceOnboardingSheet } from '@/src/features/voice/components/VoiceOnboardingSheet';
import { VoicePickerSheet } from '@/src/features/voice/components/VoicePickerSheet';
import { VoiceInlineBar } from '@/src/features/voice/components/VoiceInlineBar';
import {
  useVoiceConversation,
  voiceCaptureErrorMessage,
} from '@/src/features/voice/hooks/useVoiceConversation';
import * as TTS from '@/src/features/voice/services/tts';
import {
  createMessageIdSet,
  findNewAssistantResponse,
} from '@/src/features/voice/utils/assistantResponse';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import { Text } from '@/components/ui/text';
import { paywallErrorStateFromApiError, useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useAgentStore } from '@/stores/agentStore';
import { useWaitlistStore } from '@/src/features/waitlist';
import { ModelTierWarningBanner } from '@/src/features/chat/components/ModelTierWarningBanner';
import { TemporaryChatBanner } from '@/src/features/chat/components/TemporaryChatBanner';
import { SendErrorBanner } from '@/src/features/chat/components/SendErrorBanner';
import { MessageSkeleton } from '@/src/features/chat/components/MessageSkeleton';
import {
  summarizeSendPreview,
  type ProviderMode,
  type SendPreviewInput,
} from '@agiworkforce/types';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
  isSelectableModelIdForAccess,
  getShortDisplayName,
} from '@/src/features/model-picker/service';
import { useTierStore } from '@/src/features/billing/store';
import {
  executionModeForConversation,
  executionModeForSelection,
} from '@/src/features/chat/utils/conversationMode';
import {
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '@/src/features/media/photo-picker';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { deleteCloudMessagesRemote } from '@/src/features/chat/services/cloudMessageMutations';
import { useVoicePlayback } from '@/src/features/voice/hooks/useVoicePlayback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useSettingsStore } from '@/stores/settingsStore';
import { offlineQueue } from '@/services/offlineQueue';
import { PICKABLE_DOCUMENT_MIME_TYPES } from '@/services/docParser';
import { runImageGenerationTurn } from '@/src/features/chat/actions/runImageGenerationTurn';
import { runVideoGenerationTurn } from '@/src/features/chat/actions/runVideoGenerationTurn';
import { resolveMobileVideoGenerationRequest } from '@/src/features/chat/actions/resolveMobileVideoGenerationRequest';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { resolveMobileImageGenerationRequest } from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';
import { useThemeColors, radii } from '@/src/ui/theme';
import { useProjectStore } from '@/src/features/projects/store';
import { useAuthStore } from '@/src/features/auth/store';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import type { ChatMessage } from '@/types/chat';
import {
  captureAccountScopedUiState,
  isAccountScopedUiStateCurrent,
  type AccountScopedUiState,
} from '@/src/features/auth/services/accountScopedUiState';

const STYLE_SHEET_HANDOFF_DELAY_MS = 450;
const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];

interface ConversationUiActionScope {
  conversationId: string;
  ownership: AccountScopedUiState;
}

export default function ChatScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id: string; prompt?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const initialPrompt = Array.isArray(params.prompt) ? params.prompt[0] : (params.prompt ?? '');
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) =>
    s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : undefined,
  );
  const router = useRouter();
  const navigation = useNavigation();
  const modelPickerRef = useRef<BottomSheet>(null);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const addToChatRef = useRef<BottomSheet>(null);
  const [modelPickerScope, setModelPickerScope] = useState<'local' | 'cloud'>('local');
  const [styleSelectorOpenSignal, setStyleSelectorOpenSignal] = useState(0);
  const [projectPickerOpenSignal, setProjectPickerOpenSignal] = useState(0);
  const chatInputAttachRef = useRef<
    import('@/src/features/chat/components/ChatInput').ChatInputHandle | null
  >(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const quotedMessageScopeRef = useRef<ConversationUiActionScope | null>(null);
  const renameScopeRef = useRef<ConversationUiActionScope | null>(null);
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

  const conversationMessages = useChatStore((s) =>
    id ? (s.messages[id] ?? EMPTY_CHAT_MESSAGES) : EMPTY_CHAT_MESSAGES,
  );
  const isStreaming = useChatStore((s) => (id ? s.streamingConversationIds.includes(id) : false));
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const conversations = useChatStore((s) => s.conversations);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setCurrentConversationId = useChatStore((s) => s.setCurrentConversationId);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setMessageReaction = useChatStore((s) => s.setMessageReaction);
  const retryMessage = useChatStore((s) => s.retryMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const resolveToolApproval = useChatStore((s) => s.resolveToolApproval);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const setConversationModel = useChatStore((s) => s.setConversationModel);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const paywallError = useChatStore((s) => s.paywallError);
  const clearPaywallError = useChatStore((s) => s.clearPaywallError);
  const setPaywallError = useChatStore((s) => s.setPaywallError);
  const sendError = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);
  const setSendError = useChatStore((s) => s.setSendError);
  const enqueueOfflineMessage = useChatStore((s) => s.enqueueOfflineMessage);
  const beginImageGeneration = useChatStore((s) => s.beginImageGeneration);
  const completeImageGeneration = useChatStore((s) => s.completeImageGeneration);
  const failImageGeneration = useChatStore((s) => s.failImageGeneration);
  const beginVideoGeneration = useChatStore((s) => s.beginVideoGeneration);
  const updateVideoGenerationProgress = useChatStore((s) => s.updateVideoGenerationProgress);
  const completeVideoGeneration = useChatStore((s) => s.completeVideoGeneration);
  const failVideoGeneration = useChatStore((s) => s.failVideoGeneration);
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const videoAspectRatio = useChatViewStore((s) => s.videoAspectRatio);
  const videoResolution = useChatViewStore((s) => s.videoResolution);
  const imageAspectRatio = useChatViewStore((s) => s.imageAspectRatio);
  const markConversationRead = useChatStore((s) => s.markConversationRead);
  const imageGenerationEnabled = useChatStore((s) => s.features.imageGen);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const approveRequest = useAgentStore((s) => s.approveRequest);
  const rejectRequest = useAgentStore((s) => s.rejectRequest);

  const conversation = conversations.find((c) => c.id === id);
  const title = conversation?.title ?? 'Chat';
  const conversationExecutionMode = conversation
    ? executionModeForConversation(conversation)
    : executionModeForSelection(selectedModel, appMode);

  const sendPreviewInput = useMemo<SendPreviewInput>(
    () => ({
      providerMode: (conversationExecutionMode === 'cloud'
        ? 'ManagedGateway'
        : 'Local') satisfies ProviderMode,
      modelLabel: getShortDisplayName(selectedModel, subscriptionTier),
      modelId: selectedModel,
    }),
    [conversationExecutionMode, selectedModel, subscriptionTier],
  );
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
    if (renameModalVisible && !isConversationActionCurrent(renameScopeRef.current)) {
      renameScopeRef.current = null;
      setRenameModalVisible(false);
      setRenameText('');
    }
  }, [
    clerkUserId,
    conversationExecutionMode,
    id,
    isConversationActionCurrent,
    quotedMessage,
    renameModalVisible,
  ]);

  useEffect(() => {
    if (!id) return;
    setCurrentConversationId(id);
    loadMessages(id);
    markConversationRead(id);

    return () => {
      setCurrentConversationId(null);
    };
  }, [id, setCurrentConversationId, loadMessages, markConversationRead]);

  const { stop: stopSpeaking } = useVoicePlayback();

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
      attachments?: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
      mode?: TaskChipType,
      dispatchOptions?: { awaitCompletion?: boolean },
    ): boolean | Promise<boolean> => {
      if (!id) return false;
      stopSpeaking?.();
      if (conversationExecutionMode === 'cloud' && !FEATURES.cloudChat) {
        Alert.alert(
          'AGI Cloud is unavailable in this build',
          'This build has Cloud chat turned off. Local Mode remains available and stays on this device.',
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
        quotedMessageScopeRef.current = null;
        setQuotedMessage(null);
        const videoTurn = runVideoGenerationTurn({
          conversationId: id,
          displayText: finalText,
          prompt: videoRequest.prompt,
          model: videoRequest.model,
          aspectRatio: videoRequest.aspectRatio,
          resolution: videoRequest.resolution,
          ownerId: videoRequest.ownerId,
          begin: beginVideoGeneration,
          progress: updateVideoGenerationProgress,
          complete: completeVideoGeneration,
          fail: failVideoGeneration,
          remove: deleteMessage,
          onPaywall: (error) => {
            setPaywallError(paywallErrorStateFromApiError(error));
          },
          onUnexpectedError: (error) => {
            console.warn('[ChatScreen] Video generation failed:', error);
          },
        });
        if (dispatchOptions?.awaitCompletion) {
          return videoTurn.then(() => true);
        }
        void videoTurn;
        return true;
      }

      const imageRequest = resolveMobileImageGenerationRequest({
        executionMode: conversationExecutionMode,
        text: trimmedInput,
        mediaMode,
        selection: selectedModel,
        subscriptionTier,
        hasAttachments: Boolean(attachments?.length),
        globalImageGenerationEnabled: FEATURES.imageGen,
        imageGenerationEnabled,
        isClerkSignedIn,
        ownerId: clerkUserId,
        grantedCapabilities,
        isOnline,
        aspectRatio: imageAspectRatio,
      });

      if (imageRequest.status === 'blocked') {
        Alert.alert(imageRequest.alert.title, imageRequest.alert.message);
        return false;
      }
      if (imageRequest.status === 'ready') {
        quotedMessageScopeRef.current = null;
        setQuotedMessage(null);
        const imageTurn = runImageGenerationTurn({
          conversationId: id,
          displayText: finalText,
          prompt: imageRequest.prompt,
          model: imageRequest.model,
          aspectRatio: imageRequest.aspectRatio,
          ownerId: imageRequest.ownerId,
          begin: beginImageGeneration,
          complete: completeImageGeneration,
          fail: failImageGeneration,
          remove: deleteMessage,
          onPaywall: (error) => {
            setPaywallError(paywallErrorStateFromApiError(error));
          },
          onUnexpectedError: (error) => {
            console.warn('[ChatScreen] Image generation failed:', error);
          },
        });
        if (dispatchOptions?.awaitCompletion) {
          return imageTurn.then(() => true);
        }
        void imageTurn;
        return true;
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

      const sendOptions = mode ? TASK_CHIP_SEND_CONTEXT[mode] : undefined;

      quotedMessageScopeRef.current = null;
      setQuotedMessage(null);
      if (dispatchOptions?.awaitCompletion) {
        return sendMessage(id, finalText, selectedModel, attachments, sendOptions).catch(
          (err: unknown) => {
            console.warn('[ChatScreen] sendMessage rejected:', err);
            setSendError('Message could not be sent. Please try again.');
            return false;
          },
        );
      }
      return resolveOnAcceptedSend(
        (onAccepted) =>
          sendMessage(id, finalText, selectedModel, attachments, {
            ...(sendOptions ?? {}),
            onAccepted,
          }),
        (err) => {
          console.warn('[ChatScreen] sendMessage rejected:', err);
          setSendError('Message could not be sent. Please try again.');
        },
      );
    },
    [
      id,
      conversationExecutionMode,
      selectedModel,
      subscriptionTier,
      grantedCapabilities,
      imageGenerationEnabled,
      isClerkSignedIn,
      sendMessage,
      beginImageGeneration,
      completeImageGeneration,
      failImageGeneration,
      beginVideoGeneration,
      updateVideoGenerationProgress,
      completeVideoGeneration,
      failVideoGeneration,
      mediaMode,
      deleteMessage,
      setPaywallError,
      setSendError,
      stopSpeaking,
      quotedMessage,
      isConversationActionCurrent,
      isOnline,
      clerkUserId,
      enqueueOfflineMessage,
      imageAspectRatio,
      videoAspectRatio,
      videoResolution,
    ],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  const resolveAppMode = useCallback(
    (modelId: string): AppMode => {
      return executionModeForSelection(modelId, conversationExecutionMode);
    },
    [conversationExecutionMode],
  );

  const handleOpenModelPicker = useCallback(
    (scope?: 'local' | 'cloud') => {
      setModelPickerScope(scope ?? conversationExecutionMode);
      setModelPickerOpenSignal((value) => value + 1);
      modelPickerRef.current?.snapToIndex(0);
    },
    [conversationExecutionMode],
  );

  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const waitlistJoined = useWaitlistStore((s) => s.joined);
  const waitlistRank = useWaitlistStore((s) => s.rank);

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
          : DEFAULT_LOCAL_MODEL_ID;

    if (!preferredModel) return;
    if (conversationExecutionMode === 'cloud' && !cloudUnlocked) return;
    if (useModelStore.getState().selectedModel !== preferredModel) {
      useModelStore.getState().setModel(preferredModel);
    }
  }, [cloudUnlocked, conversation, conversationExecutionMode, setAppMode, subscriptionTier]);

  const handleOpenCloudSignIn = useCallback(() => {
    router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleModelSelect = useCallback(
    (newModelId: string) => {
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
    },
    [
      conversationExecutionMode,
      conversationMessages.length,
      id,
      resolveAppMode,
      setAppMode,
      setConversationModel,
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
          'Camera permission is required to take photos. Please enable it in Settings.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        allowsEditing: false,
        exif: false,
      });
      if (!result.canceled && result.assets.length > 0) {
        const attachments: import('@/src/features/chat/components/AttachmentPreview').Attachment[] =
          result.assets.map((asset) => ({
            id: `cam-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            uri: asset.uri,
            mimeType: asset.mimeType ?? 'image/jpeg',
            fileName: asset.fileName ?? 'photo.jpg',
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
          }));
        chatInputAttachRef.current?.addAttachments(attachments);
      }
    } catch {
      Alert.alert('Camera', 'Could not open the camera. Please try again.');
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
    } catch {
      Alert.alert('Photos', 'Could not open Photos. Please try again.');
    }
  }, []);

  const handleSheetFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [...PICKABLE_DOCUMENT_MIME_TYPES],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const attachments: import('@/src/features/chat/components/AttachmentPreview').Attachment[] =
          result.assets.map((asset) => ({
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
  }, []);

  const handleAttachFromLibrary = useCallback(
    (attachment: import('@/src/features/chat/components/AttachmentPreview').Attachment) => {
      chatInputAttachRef.current?.addAttachments([attachment]);
    },
    [],
  );

  const [refreshing, setRefreshing] = useState(false);
  const [voiceIntroVisible, setVoiceIntroVisible] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [voiceInlineVisible, setVoiceInlineVisible] = useState(false);
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const handleTapCloudMode = useCallback(() => {
    if (!DEFAULT_CLOUD_MODEL_ID) {
      setAppMode('local');
      return;
    }
    if (!cloudUnlocked) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    setAppMode('cloud');
    useModelStore
      .getState()
      .setModel(getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID);
    if (conversationExecutionMode === 'cloud') {
      handleOpenModelPicker('cloud');
      return;
    }
    router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
  }, [
    cloudUnlocked,
    conversationExecutionMode,
    handleOpenModelPicker,
    router,
    setAppMode,
    subscriptionTier,
  ]);

  const handleTapLocalMode = useCallback(() => {
    setAppMode('local');
    useModelStore.getState().setModel(DEFAULT_LOCAL_MODEL_ID);
    router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
  }, [router, setAppMode]);

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

  const handleOpenVoiceMode = useCallback(() => {
    Keyboard.dismiss();
    if (!useSettingsStore.getState().voiceOnboardingSeen) {
      setVoiceIntroVisible(true);
      return;
    }
    setVoiceInlineVisible(true);
  }, []);

  const handleVoiceIntroContinue = useCallback(() => {
    setVoiceIntroVisible(false);
    setVoicePickerVisible(true);
  }, []);

  const handleVoiceIntroDismiss = useCallback(() => {
    setVoiceIntroVisible(false);
  }, []);

  const handleVoicePickerStart = useCallback(() => {
    setVoicePickerVisible(false);
    setVoiceInlineVisible(true);
  }, []);

  const handleVoicePickerDismiss = useCallback(() => {
    setVoicePickerVisible(false);
  }, []);

  const handleExitInlineVoice = useCallback(() => {
    setVoiceInlineVisible(false);
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
      const accepted = await handleSend(text, undefined, undefined, { awaitCompletion: true });
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
        const previous = useChatCloudMessageStore.getState().messages[id];
        useChatCloudMessageStore.getState().deleteCloudMessage(id, messageId);
        deleteCloudMessagesRemote(id, [messageId]).catch(() => {
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
      setMessageReaction(id, messageId, reaction);
    },
    [id, setMessageReaction],
  );

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      if (!id) return;
      stopSpeaking();
      const messageIndex = conversationMessages.findIndex((message) => message.id === messageId);
      const target = messageIndex >= 0 ? conversationMessages[messageIndex] : undefined;
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
      retryMessage(id, messageId);
    },
    [conversationMessages, handleSend, id, retryMessage, stopSpeaking],
  );

  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!id) return;
      stopSpeaking();
      editMessage(id, messageId, newContent);
    },
    [id, editMessage, stopSpeaking],
  );

  const handleResolveToolApproval = useCallback(
    (messageId: string, toolCallId: string, decision: 'approved' | 'rejected') => {
      if (!id) return;
      void resolveToolApproval(id, messageId, toolCallId, decision);
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

  const closeRenameModal = useCallback(() => {
    renameScopeRef.current = null;
    setRenameModalVisible(false);
    setRenameText('');
  }, []);

  const handleMenuPress = useCallback(() => {
    const actionScope = captureConversationAction();
    if (!actionScope || !isConversationActionCurrent(actionScope)) return;
    const options = ['Share', 'Rename', 'Delete', 'Cancel'];
    const destructiveIndex = 2;
    const cancelIndex = 3;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: cancelIndex,
          destructiveButtonIndex: destructiveIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) {
            if (!isConversationActionCurrent(actionScope)) return;
            setExportSheetVisible(true);
          } else if (buttonIndex === 1 && id) {
            if (!isConversationActionCurrent(actionScope)) return;
            Alert.prompt(
              'Rename Conversation',
              'Enter a new title:',
              (newTitle) => {
                if (newTitle?.trim() && isConversationActionCurrent(actionScope)) {
                  renameConversation(id, newTitle.trim());
                }
              },
              'plain-text',
              title,
            );
          } else if (buttonIndex === 2 && id) {
            if (!isConversationActionCurrent(actionScope)) return;
            Alert.alert('Delete Conversation', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  if (!isConversationActionCurrent(actionScope)) return;
                  deleteConversation(id);
                  handleBack();
                },
              },
            ]);
          }
        },
      );
    } else {
      Alert.alert('Conversation', undefined, [
        {
          text: 'Share',
          onPress: () => {
            if (!isConversationActionCurrent(actionScope)) return;
            setExportSheetVisible(true);
          },
        },
        {
          text: 'Rename',
          onPress: () => {
            if (!isConversationActionCurrent(actionScope)) return;
            renameScopeRef.current = actionScope;
            setRenameText(title);
            setRenameModalVisible(true);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!id || !isConversationActionCurrent(actionScope)) return;
            deleteConversation(id);
            handleBack();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [
    captureConversationAction,
    deleteConversation,
    handleBack,
    id,
    isConversationActionCurrent,
    renameConversation,
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
    speak: (text, callbacks) => TTS.speak(text, { ...callbacks }),
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
        style={{ backgroundColor: colors.surfaceBase }}
      >
        <Text style={{ color: colors.textMuted }}>No conversation selected</Text>
      </SafeAreaView>
    );
  }

  const currentAppMode = conversationExecutionMode;

  return (
    <SafeAreaView
      className="flex-1"
      style={{ backgroundColor: colors.surfaceBase }}
      edges={['top']}
    >
      {/* Android: adjustResize (Expo default softwareKeyboardLayoutMode) already
          resizes the window; stacking behavior="height" on top double-handles
          the keyboard and causes resize jumps. iOS keeps "padding". */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {/* Chat header: circular hamburger left, ModeToggle center, circular
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
          {/* Hamburger — opens drawer */}
          <Pressable
            onPress={handleOpenDrawer}
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

          {/* Active project chip — tappable, navigates to project detail */}
          {conversationExecutionMode === 'local' && activeProjectId && activeProject ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(app)/projects/[id]' as const,
                  params: { id: activeProjectId },
                })
              }
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
                style={{ fontSize: 12, color: colors.teal, fontWeight: '500' }}
              >
                {activeProject.name}
              </Text>
            </Pressable>
          ) : null}

          {/* ModeToggle — flex:1 ensures true center regardless of left/right widths */}
          <View style={{ flex: 1, alignItems: 'center' }}>
            <ModeToggle
              mode={currentAppMode}
              cloudJoined={waitlistJoined}
              cloudUnlocked={cloudUnlocked}
              waitlistRank={waitlistRank}
              compact
              onTapLocal={conversationExecutionMode === 'cloud' ? handleTapLocalMode : undefined}
              onTapCloud={handleTapCloudMode}
            />
          </View>

          {/* Right side: new-chat + conversation menu */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable
              onPress={handleNewChat}
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

        {/* Offline banner */}
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
            <Text style={{ fontSize: 12, color: colors.agentError }}>
              You're offline — viewing cached conversations
            </Text>
          </View>
        )}

        {/* Temporary chat explainer — shown once per app session */}
        <TemporaryChatBanner />

        {/* Messages */}
        {isLoadingMessages && conversationMessages.length === 0 ? (
          <MessageSkeleton />
        ) : (
          <MessageList
            messages={conversationMessages}
            onApprove={approveRequest}
            onReject={rejectRequest}
            onDeleteMessage={handleDeleteMessage}
            onReaction={handleReaction}
            onRetryMessage={handleRetryMessage}
            onEditMessage={handleEditMessage}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            onQuoteReply={handleQuoteReply}
            onResolveToolApproval={handleResolveToolApproval}
          />
        )}

        {/* Quoted reply bar */}
        {quotedMessage && <QuotedReplyBar message={quotedMessage} onDismiss={handleDismissQuote} />}

        {/* Context-budget warning. The component computes its own threshold and
            renders null below it, so it is mounted unconditionally — it appears
            only once the thread crosses ~70% of the model's context window. */}
        <ContextWarningChip
          modelId={selectedModel}
          messages={conversationMessages}
          onStartFreshChat={handleNewChat}
        />

        {/* Model-tier warning — shown when Opus-class model selected on free tier */}
        <ModelTierWarningBanner />

        {/* Send/stream failure banner with retry — surfaces store.error (was silent) */}
        <SendErrorBanner
          error={sendError}
          onRetry={
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

        {/* Composer — shows TaskChips when conversation is empty.
            Hidden in inline voice mode: VoiceInlineBar IS the composer there,
            and rendering both stacked two input rows on screen at once, which
            is neither reference-03 nor what VoiceInlineBar's own docstring
            promises ("the only thing that changes is the composer"). */}
        {voiceInlineVisible ? null : (
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
            showChips={conversationMessages.length === 0}
            initialText={initialPrompt || undefined}
            draftKey={id}
            draftProvenance={
              conversationExecutionMode === 'local'
                ? { scope: 'local' }
                : clerkUserId
                  ? { scope: 'cloud', ownerId: clerkUserId }
                  : undefined
            }
          />
        )}

        {/* Add to Chat bottom sheet */}
        <AddToChatSheet
          ref={addToChatRef}
          onCamera={handleSheetCamera}
          onPhotos={handleSheetPhotos}
          onFile={handleSheetFile}
          onOpenCloudAccess={handleOpenCloudSignIn}
          onOpenStyleSelector={handleOpenStyleSelector}
          onOpenModelPicker={handleSheetModelPicker}
          onOpenProjectPicker={handleSheetProjectPicker}
          onAttachFromLibrary={handleAttachFromLibrary}
        />

        <StyleSelector openSignal={styleSelectorOpenSignal} />

        {/* Picker modal only -- the trigger lives in the "+" sheet. */}
        <ProjectSelectorBar openSignal={projectPickerOpenSignal} />

        {/* Model picker bottom sheet — conversationId scopes the reasoning-effort
            selector to this conversation (agentControlStore override). */}
        <ModelPickerSheet
          sheetRef={modelPickerRef}
          openSignal={modelPickerOpenSignal}
          modelScope={modelPickerScope}
          conversationId={id}
          onSelect={handleModelSelect}
          onOpenCloudAccess={handleOpenCloudSignIn}
        />

        {/* First-run intro carrying the recording disclosure, then the voice
            picker, then the inline bar. The thread above stays visible for the
            inline mode — references-2 voice-03. */}
        <VoiceOnboardingSheet
          visible={voiceIntroVisible}
          onContinue={handleVoiceIntroContinue}
          onDismiss={handleVoiceIntroDismiss}
        />

        <VoicePickerSheet
          visible={voicePickerVisible}
          onStart={handleVoicePickerStart}
          onDismiss={handleVoicePickerDismiss}
        />

        {/* The only voice presentation — identical to the new-chat tab's. */}
        <VoiceInlineBar
          visible={voiceInlineVisible}
          phase={inlineVoicePhase}
          audioLevel={inlineVoiceLevel}
          muted={inlineVoiceMuted}
          onAttach={handleVoiceAttach}
          onOpenKeyboard={handleExitInlineVoice}
          onToggleMic={inlineToggleMute}
          onExit={handleExitInlineVoice}
        />

        {/* Conversation export bottom sheet */}
        <ConversationExportSheet
          visible={exportSheetVisible}
          onClose={() => setExportSheetVisible(false)}
          messages={conversationMessages}
          title={title}
        />

        {/* Billing recovery sheet — preserves upgrade/subscribe/inactive semantics. */}
        <PaywallBottomSheet
          ref={paywallSheetRef}
          feature={paywallError?.feature ?? 'token_cap'}
          requiredTier={paywallError?.requiredTier ?? 'basic'}
          reason={paywallError?.reason}
          recoveryAction={paywallError?.recoveryAction}
          onDismiss={clearPaywallError}
        />

        {/* Mid-conversation mode-switch confirmation */}
        <ModeSwitchModal
          visible={modeSwitchState.visible}
          fromMode={modeSwitchState.fromMode}
          toMode={modeSwitchState.toMode}
          onConfirm={handleModeSwitchConfirm}
          onCancel={handleModeSwitchCancel}
        />

        {/* Rename modal (Android — Alert.prompt is iOS-only) */}
        <Modal
          visible={renameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeRenameModal}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: colors.scrim,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
            onPress={closeRenameModal}
          >
            <Pressable
              style={{
                width: '100%',
                backgroundColor: colors.surfaceElevated,
                borderRadius: 14,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
              }}
              onPress={() => undefined}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: colors.textPrimary,
                  marginBottom: 12,
                }}
              >
                Rename Conversation
              </Text>
              <TextInput
                style={{
                  backgroundColor: colors.inputSurface,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 15,
                  color: colors.textPrimary,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 16,
                }}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
                placeholder="Enter a new title"
                placeholderTextColor={colors.textMuted}
                selectTextOnFocus
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }}>
                <Pressable
                  style={{ padding: 8 }}
                  onPress={closeRenameModal}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={{ padding: 8 }}
                  onPress={() => {
                    const actionScope = renameScopeRef.current;
                    if (!isConversationActionCurrent(actionScope)) {
                      closeRenameModal();
                      return;
                    }
                    const trimmed = renameText.trim();
                    if (trimmed && id) {
                      renameConversation(id, trimmed);
                    }
                    closeRenameModal();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Submit rename"
                >
                  <Text style={{ color: colors.teal, fontSize: 15, fontWeight: '600' }}>
                    Rename
                  </Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
