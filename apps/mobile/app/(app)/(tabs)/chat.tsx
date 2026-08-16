import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Alert, Keyboard, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { PressableBox as Pressable } from '@/components/ui/pressable-box';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Download } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import {
  summarizeSendPreview,
  type ProviderMode,
  type SendPreviewInput,
} from '@agiworkforce/types';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import { TemporaryChatToggle } from '@/src/features/chat/components/TemporaryChatToggle';
import { AgiMark } from '@/components/ui/AgiMark';
import {
  TaskChips,
  TASK_CHIP_SEND_CONTEXT,
  type TaskChipType,
  type TaskSuggestionType,
} from '@/src/features/chat/components/TaskChips';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { ProjectSelectorBar } from '@/src/features/chat/components/ProjectSelectorBar';
import { StyleSelector } from '@/src/features/chat/components/StyleSelector';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { VoiceOnboardingSheet } from '@/src/features/voice/components/VoiceOnboardingSheet';
import { VoicePickerSheet } from '@/src/features/voice/components/VoicePickerSheet';
import { VoiceInlineBar } from '@/src/features/voice/components/VoiceInlineBar';
import {
  useVoiceConversation,
  voiceCaptureErrorMessage,
} from '@/src/features/voice/hooks/useVoiceConversation';
import * as TTS from '@/src/features/voice/services/tts';
import { useSettingsStore } from '@/stores/settingsStore';
import { findNewAssistantResponse } from '@/src/features/voice/utils/assistantResponse';
import { Text } from '@/components/ui/text';
import { paywallErrorStateFromApiError, useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
  getSelectableModelById,
  getShortDisplayName,
} from '@/src/features/model-picker/service';
import { executionModeForSelection } from '@/src/features/chat/utils/conversationMode';
import {
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '@/src/features/media/photo-picker';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { DrawerButton } from '@/src/shared/components/DrawerButton';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';
import { runImageGenerationTurn } from '@/src/features/chat/actions/runImageGenerationTurn';
import { runVideoGenerationTurn } from '@/src/features/chat/actions/runVideoGenerationTurn';
import { resolveMobileVideoGenerationRequest } from '@/src/features/chat/actions/resolveMobileVideoGenerationRequest';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useAuthStore } from '@/src/features/auth/store';
import { resolveMobileImageGenerationRequest } from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';
import { WorkModeSourceNotice } from '@/src/features/chat/components/WorkModeSourceNotice';
import { PICKABLE_DOCUMENT_MIME_TYPES } from '@/services/docParser';
import { useMobileSkillSelectionStore } from '@/src/features/skills/selectionStore';
import { beginCloudPostAuthIntent } from '@/src/features/auth/services/postAuthIntent';

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'How can I help you this morning?';
  if (hour < 17) return 'How can I help you this afternoon?';
  if (hour < 21) return 'How can I help you this evening?';
  return 'How can I help you tonight?';
}

const STYLE_SHEET_HANDOFF_DELAY_MS = 450;

export default function ChatTabScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const c = useThemeColors();
  const modelPickerRef = useRef<BottomSheet>(null);
  const addToChatRef = useRef<BottomSheet>(null);
  const chatInputAttachRef = useRef<
    import('@/src/features/chat/components/ChatInput').ChatInputHandle | null
  >(null);
  const [voiceIntroVisible, setVoiceIntroVisible] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [voiceInlineVisible, setVoiceInlineVisible] = useState(false);
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const [styleSelectorOpenSignal, setStyleSelectorOpenSignal] = useState(0);
  const [projectPickerOpenSignal, setProjectPickerOpenSignal] = useState(0);
  const [modelPickerScope, setModelPickerScope] = useState<'local' | 'cloud'>('local');

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const beginImageGeneration = useChatStore((s) => s.beginImageGeneration);
  const completeImageGeneration = useChatStore((s) => s.completeImageGeneration);
  const failImageGeneration = useChatStore((s) => s.failImageGeneration);
  const beginVideoGeneration = useChatStore((s) => s.beginVideoGeneration);
  const updateVideoGenerationProgress = useChatStore((s) => s.updateVideoGenerationProgress);
  const completeVideoGeneration = useChatStore((s) => s.completeVideoGeneration);
  const failVideoGeneration = useChatStore((s) => s.failVideoGeneration);
  const mediaMode = useChatViewStore((s) => s.mediaMode);
  const setMediaMode = useChatViewStore((s) => s.setMediaMode);
  const videoAspectRatio = useChatViewStore((s) => s.videoAspectRatio);
  const videoResolution = useChatViewStore((s) => s.videoResolution);
  const imageAspectRatio = useChatViewStore((s) => s.imageAspectRatio);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setPaywallError = useChatStore((s) => s.setPaywallError);
  const clearError = useChatStore((s) => s.clearError);
  const setSendError = useChatStore((s) => s.setSendError);
  const imageGenerationEnabled = useChatStore((s) => s.features.imageGen);
  const workMode = useChatStore((s) => s.workMode);

  useFocusEffect(
    useCallback(() => {
      clearError();
    }, [clearError]),
  );
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
  const waitlistJoined = useWaitlistStore((s) => s.joined);
  const waitlistRank = useWaitlistStore((s) => s.rank);
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const installedModelIds = useModelInstallStore((s) => s.installedModelIds);
  const readySystemModelIds = useModelInstallStore((s) => s.readySystemModelIds);
  const activeMode = appMode;
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
  const cloudChatAvailable = FEATURES.cloudChat && Boolean(DEFAULT_CLOUD_MODEL_ID);
  const modeDescription =
    activeMode === 'cloud'
      ? 'Continue with AGI Cloud. Use Chats for full history and global search.'
      : 'Start privately on this device. Use Chats for full history and global search.';

  const modelForSend = useMemo(() => {
    if (activeMode === 'cloud') {
      return executionModeForSelection(selectedModel, activeMode) === 'cloud'
        ? selectedModel
        : (getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID);
    }
    return executionModeForSelection(selectedModel, activeMode) === 'local'
      ? selectedModel
      : DEFAULT_LOCAL_MODEL_ID;
  }, [activeMode, selectedModel, subscriptionTier]);

  const sendPreviewInput = useMemo<SendPreviewInput>(
    () => ({
      providerMode: (activeMode === 'cloud' ? 'ManagedGateway' : 'Local') satisfies ProviderMode,
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
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (appMode === 'cloud') {
      if (!cloudChatAvailable || !DEFAULT_CLOUD_MODEL_ID) {
        setAppMode('local');
        setModel(DEFAULT_LOCAL_MODEL_ID);
        return;
      }
      if (!isClerkLoaded) return;
      if (!isClerkSignedIn) {
        setAppMode('local');
        setModel(DEFAULT_LOCAL_MODEL_ID);
        return;
      }
      if (!cloudUnlocked) return;
      if (executionModeForSelection(selectedModel, appMode) !== 'cloud') {
        setModel(getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID);
      }
      return;
    }

    if (executionModeForSelection(selectedModel, appMode) !== 'local') {
      setModel(DEFAULT_LOCAL_MODEL_ID);
    }
  }, [
    appMode,
    cloudChatAvailable,
    cloudUnlocked,
    isClerkLoaded,
    isClerkSignedIn,
    selectedModel,
    setAppMode,
    setModel,
    subscriptionTier,
  ]);

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const handleSend = useCallback(
    async (
      text: string,
      attachments?: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
      mode?: TaskChipType,
      dispatchOptions?: { awaitCompletion?: boolean },
    ): Promise<boolean> => {
      try {
        if (activeMode === 'cloud' && !FEATURES.cloudChat) {
          Alert.alert(
            'AGI Cloud is unavailable in this build',
            'This build has Cloud chat turned off. Local Mode remains available and stays on this device.',
          );
          return false;
        }
        if (!modelForSend) return false;
        const trimmed = text.trim();
        const skillNameForTurn = activeMode === 'cloud' ? selectedSkillName : undefined;

        const videoRequest = skillNameForTurn
          ? ({ status: 'not_requested' } as const)
          : resolveMobileVideoGenerationRequest({
              executionMode: activeMode,
              text: trimmed,
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
          const title =
            videoRequest.prompt.length > 40
              ? videoRequest.prompt.slice(0, 40).trim() + '...'
              : videoRequest.prompt;
          const conversationId = await createConversation(title);
          router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);

          const videoTurn = runVideoGenerationTurn({
            conversationId,
            displayText: trimmed,
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
              selection: modelForSend,
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
          const title =
            imageRequest.prompt.length > 40
              ? imageRequest.prompt.slice(0, 40).trim() + '...'
              : imageRequest.prompt;
          const conversationId = await createConversation(title);
          router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);

          const imageTurn = runImageGenerationTurn({
            conversationId,
            displayText: trimmed,
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
              console.warn('[ChatTabScreen] Image generation failed:', error);
            },
          });
          if (dispatchOptions?.awaitCompletion) await imageTurn;
          else void imageTurn;
          return true;
        }

        const fallbackTitle = attachments?.[0]?.fileName ?? 'New chat';
        const titleSource = trimmed || fallbackTitle;
        const title =
          titleSource.length > 40 ? titleSource.slice(0, 40).trim() + '...' : titleSource;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
        const sendOptions = {
          ...(mode ? TASK_CHIP_SEND_CONTEXT[mode] : {}),
          ...(skillNameForTurn ? { skillName: skillNameForTurn } : {}),
        };
        if (dispatchOptions?.awaitCompletion) {
          const accepted = await sendMessage(
            conversationId,
            trimmed,
            modelForSend,
            attachments,
            sendOptions,
          );
          if (accepted && skillNameForTurn) clearSelectedSkill();
          return accepted;
        }
        const accepted = await resolveOnAcceptedSend(
          (onAccepted) =>
            sendMessage(conversationId, trimmed, modelForSend, attachments, {
              ...sendOptions,
              onAccepted,
            }),
          (err) => {
            console.warn('[ChatTabScreen] sendMessage rejected:', err);
            setSendError('Message could not be sent. Please try again.');
          },
        );
        if (accepted && skillNameForTurn) clearSelectedSkill();
        return accepted;
      } catch (err) {
        console.warn('[ChatTabScreen] createConversation failed:', err);
        Alert.alert('Could not start the chat', 'Something went wrong. Please try again.');
        return false;
      }
    },
    [
      activeMode,
      createConversation,
      sendMessage,
      modelForSend,
      subscriptionTier,
      grantedCapabilities,
      imageGenerationEnabled,
      isClerkSignedIn,
      clerkUserId,
      router,
      isOnline,
      beginImageGeneration,
      completeImageGeneration,
      failImageGeneration,
      beginVideoGeneration,
      updateVideoGenerationProgress,
      completeVideoGeneration,
      failVideoGeneration,
      mediaMode,
      videoAspectRatio,
      videoResolution,
      imageAspectRatio,
      deleteMessage,
      setPaywallError,
      setSendError,
      selectedSkillName,
      clearSelectedSkill,
    ],
  );

  const [activeTaskChip, setActiveTaskChip] = useState<TaskChipType | null>(null);
  const handleTaskSuggestion = useCallback(
    (suggestion: TaskSuggestionType) => {
      if (suggestion === 'image') {
        setActiveTaskChip(null);
        setMediaMode('image');
      } else {
        setMediaMode('text');
        setActiveTaskChip((current) => (current === suggestion ? null : suggestion));
      }
      chatInputAttachRef.current?.focus?.();
    },
    [setMediaMode],
  );
  const handleComposerSend = useCallback(
    async (
      text: string,
      attachments?: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
    ): Promise<boolean> => {
      const accepted = await handleSend(text, attachments, activeTaskChip ?? undefined);
      if (accepted) setActiveTaskChip(null);
      return accepted;
    },
    [activeTaskChip, handleSend],
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

  const handleOpenCloudAccess = useCallback(() => {
    router.push(beginCloudPostAuthIntent());
  }, [router]);

  const handleTapLocalMode = useCallback(() => {
    setAppMode('local');
    setModel(DEFAULT_LOCAL_MODEL_ID);
  }, [setAppMode, setModel]);

  const handleTapCloudMode = useCallback(() => {
    if (!cloudChatAvailable || !DEFAULT_CLOUD_MODEL_ID) {
      setAppMode('local');
      return;
    }
    if (!cloudUnlocked) {
      router.push(beginCloudPostAuthIntent());
      return;
    }
    if (activeMode !== 'cloud') {
      setAppMode('cloud');
      setModel(getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID);
    }
  }, [
    activeMode,
    cloudChatAvailable,
    cloudUnlocked,
    router,
    setAppMode,
    setModel,
    subscriptionTier,
  ]);

  const handleOpenConnectors = useCallback(() => {
    if (!FEATURES.connectors) {
      handleOpenCloudAccess();
      return;
    }
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [handleOpenCloudAccess, router]);

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

  const handleVoiceIntroDismiss = useCallback(() => {
    setVoiceIntroVisible(false);
  }, []);

  const handleOpenCompare = useCallback(() => {
    router.push('/(app)/compare' as Parameters<typeof router.push>[0]);
  }, [router]);
  const compareAction = activeMode === 'cloud' ? handleOpenCompare : undefined;

  const handleVoiceSendMessage = useCallback(
    async (text: string): Promise<string> => {
      try {
        const accepted = await handleSend(text, undefined, undefined, { awaitCompletion: true });
        if (!accepted) {
          throw new Error(useChatStore.getState().error ?? 'Message was not sent.');
        }
        const conversationId = useChatStore.getState().currentConversationId;
        if (!conversationId) return '';
        return (
          findNewAssistantResponse(
            useChatStore.getState().messages[conversationId] ?? [],
            new Set(),
          ) ?? ''
        );
      } catch {
        throw new Error('Failed to send voice message');
      }
    },
    [handleSend],
  );

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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-12">
        <View className="flex-row items-center gap-2">
          <DrawerButton onPress={handleOpenDrawer} />
          {/* The header owns ONLY the execution-mode toggle (Local | Cloud).
              Model selection lives on the composer's control row, in the model
              chip beside the attach and voice controls (ChatInput) — the old
              model pill here duplicated it and confusingly read "AGI Cloud"
              like the toggle's Cloud segment. */}
          <ModeToggle
            mode={activeMode}
            cloudJoined={waitlistJoined}
            cloudUnlocked={cloudUnlocked}
            waitlistRank={waitlistRank}
            onTapLocal={handleTapLocalMode}
            onTapCloud={handleTapCloudMode}
            compact
          />
        </View>
        {/* Already in the empty new-chat state -- a "new chat" action here would
            be a no-op, so this slot is the temporary-chat toggle instead. */}
        <TemporaryChatToggle />
      </View>

      {/* Android: adjustResize already resizes the window; stacking
          behavior="height" double-handles the keyboard and causes resize
          jumps. iOS keeps "padding". */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
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
          {/* Brand LOCKUP, not the bare mark. The mark is a twelve-spoke
              starburst, which is indistinguishable from a loading spinner —
              shown alone and static above a greeting it reads as a stalled
              loader ("users are thinking its still loading"). The wordmark
              disambiguates it instantly. The bare mark stays reserved for
              genuine busy states, where it spins. */}
          <View style={{ marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AgiMark size={30} />
            <Text
              style={{
                fontSize: 26,
                lineHeight: 30,
                fontFamily: 'Newsreader_600SemiBold',
                letterSpacing: 0.5,
                color: c.textPrimary,
              }}
            >
              AGI
            </Text>
          </View>
          <Text
            style={{
              fontSize: 28,
              lineHeight: 34,
              fontWeight: '500',
              color: c.textPrimary,
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            {getTimeOfDayGreeting()}
          </Text>
          {activeMode === 'cloud' ? (
            <>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: c.textMuted,
                  textAlign: 'center',
                  maxWidth: 300,
                }}
              >
                {modeDescription}
              </Text>
              {workMode === 'agiwork' ? (
                <WorkModeSourceNotice onOpenConnectors={handleOpenConnectors} />
              ) : null}
            </>
          ) : (
            <View style={{ width: '100%', marginTop: 8 }}>
              {!hasReadyLocalModel && (
                <DownloadModelBanner
                  onPress={() => router.push('/(app)/models' as Parameters<typeof router.push>[0])}
                />
              )}
            </View>
          )}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
          <TaskChips
            activeChip={activeTaskChip}
            onChipPress={handleTaskSuggestion}
            showCloudSuggestions={activeMode === 'cloud'}
          />
        </View>

        {/* Mode-aware: shows local projects in Local, cloud projects in Cloud.
            Trigger lives in the "+" sheet; this renders the picker modal only. */}
        <ProjectSelectorBar openSignal={projectPickerOpenSignal} />

        {voiceInlineVisible ? null : (
          <ChatInput
            onSend={handleComposerSend}
            onOpenModelPicker={handleOpenModelPicker}
            onOpenVoiceMode={handleOpenVoiceMode}
            onOpenCompare={compareAction}
            onOpenAddToChat={handleOpenAddToChat}
            attachRef={chatInputAttachRef}
            attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
            sendPreview={sendPreviewInput}
            draftKey="new-chat"
            draftProvenance={
              activeMode === 'local'
                ? { scope: 'local' }
                : clerkUserId
                  ? { scope: 'cloud', ownerId: clerkUserId }
                  : undefined
            }
            selectedSkillName={selectedSkillName}
            onClearSelectedSkill={clearSelectedSkill}
          />
        )}
      </KeyboardAvoidingView>

      {/* Add to Chat bottom sheet */}
      <AddToChatSheet
        ref={addToChatRef}
        onCamera={handleSheetCamera}
        onPhotos={handleSheetPhotos}
        onFile={handleSheetFile}
        onOpenCloudAccess={handleOpenCloudAccess}
        onOpenStyleSelector={handleOpenStyleSelector}
        onOpenModelPicker={handleSheetModelPicker}
        onOpenProjectPicker={handleSheetProjectPicker}
        onAttachFromLibrary={handleAttachFromLibrary}
      />

      <StyleSelector openSignal={styleSelectorOpenSignal} />

      {/* Model picker bottom sheet */}
      <ModelPickerSheet
        sheetRef={modelPickerRef}
        openSignal={modelPickerOpenSignal}
        modelScope={modelPickerScope}
        onSelect={setModel}
        onOpenCloudAccess={handleOpenCloudAccess}
      />

      {/* First-run voice intro + recording disclosure, gating the overlay below */}
      <VoiceOnboardingSheet
        visible={voiceIntroVisible}
        onContinue={handleVoiceIntroContinue}
        onDismiss={handleVoiceIntroDismiss}
      />

      {/* Inline voice: the thread stays visible, only the composer changes.
          This is the only voice presentation — every entry point lands here. */}
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

      {/* First-run voice picker, between the intro and the live conversation */}
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
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.textPrimary }}>
          Download a model to chat
        </Text>
        <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
          Run AI privately on this device — no account needed.
        </Text>
      </View>
    </Pressable>
  );
}
