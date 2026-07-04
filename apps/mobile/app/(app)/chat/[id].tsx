import { useEffect, useCallback, useRef, useState } from 'react';
import {
  View,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ActionSheetIOS,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
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
import { ModeSwitchModal, type AppMode } from '@/src/features/chat/components/ModeSwitchModal';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { StyleSelector } from '@/src/features/chat/components/StyleSelector';
import { ConversationExportSheet } from '@/src/features/chat/components/ConversationExportSheet';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { VoiceConversationScreen } from '@/src/features/voice/components/VoiceConversationScreen';
import {
  createMessageIdSet,
  findNewAssistantResponse,
} from '@/src/features/voice/utils/assistantResponse';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { ApiPaywallError } from '@/services/api';
import { useModelStore } from '@/src/features/model-picker/store';
import { useAgentStore } from '@/stores/agentStore';
import { useWaitlistStore } from '@/src/features/waitlist';
import { ModelTierWarningBanner } from '@/src/features/chat/components/ModelTierWarningBanner';
import { TemporaryChatBanner } from '@/src/features/chat/components/TemporaryChatBanner';
import { SendErrorBanner } from '@/src/features/chat/components/SendErrorBanner';
import { MessageSkeleton } from '@/src/features/chat/components/MessageSkeleton';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  isAutoMode,
} from '@/src/features/model-picker/service';
import {
  executionModeForConversation,
  executionModeForModel,
} from '@/src/features/chat/utils/conversationMode';
import {
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '@/src/features/media/photo-picker';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '@/stores/chat/chatCloudMessageStore';
import { api } from '@/services/api';
import { useVoicePlayback } from '@/src/features/voice/hooks/useVoicePlayback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useSettingsStore } from '@/stores/settingsStore';
import { offlineQueue } from '@/services/offlineQueue';
import { generateImage, getGeneratedImageUri } from '@/src/features/image/services/imagegen';
import { useThemeColors } from '@/src/ui/theme';
import { useProjectStore } from '@/src/features/projects/store';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import type { ChatMessage } from '@/types/chat';

const STYLE_SHEET_HANDOFF_DELAY_MS = 450;
const EMPTY_CHAT_MESSAGES: ChatMessage[] = [];

/**
 * Chat conversation screen.
 * Loads messages for the given conversation ID, renders MessageList + ChatInput.
 */
export default function ChatScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id: string; prompt?: string }>();
  // useLocalSearchParams can return string | string[] -- narrow to string
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  // Prompt pre-fill from ConversationStarters or deep link
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
  const chatInputAttachRef = useRef<{
    addAttachments: (
      items: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
    ) => void;
  } | null>(null);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
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
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const conversations = useChatStore((s) => s.conversations);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setCurrentConversationId = useChatStore((s) => s.setCurrentConversationId);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const retryMessage = useChatStore((s) => s.retryMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const renameConversation = useChatStore((s) => s.renameConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const paywallError = useChatStore((s) => s.paywallError);
  const clearPaywallError = useChatStore((s) => s.clearPaywallError);
  const setPaywallError = useChatStore((s) => s.setPaywallError);
  const sendError = useChatStore((s) => s.error);
  const clearError = useChatStore((s) => s.clearError);
  const enqueueOfflineMessage = useChatStore((s) => s.enqueueOfflineMessage);
  const beginImageGeneration = useChatStore((s) => s.beginImageGeneration);
  const completeImageGeneration = useChatStore((s) => s.completeImageGeneration);
  const failImageGeneration = useChatStore((s) => s.failImageGeneration);
  const markConversationRead = useChatStore((s) => s.markConversationRead);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const approveRequest = useAgentStore((s) => s.approveRequest);
  const rejectRequest = useAgentStore((s) => s.rejectRequest);

  // Find current conversation title
  const conversation = conversations.find((c) => c.id === id);
  const title = conversation?.title ?? 'Chat';
  const conversationExecutionMode = conversation
    ? executionModeForConversation(conversation)
    : executionModeForModel(selectedModel);

  // Set current conversation and load messages on mount
  useEffect(() => {
    if (!id) return;
    setCurrentConversationId(id);
    loadMessages(id);
    markConversationRead(id);

    return () => {
      setCurrentConversationId(null);
    };
  }, [id, setCurrentConversationId, loadMessages, markConversationRead]);

  // ---------------------------------------------------------------------------
  // Voice playback -- speak completed assistant messages aloud.
  // Declared early so handleSend / handleBack can reference stopSpeaking.
  // ---------------------------------------------------------------------------
  const { speak, stop: stopSpeaking } = useVoicePlayback();
  const voiceEnabled = useSettingsStore((s) => s.voiceEnabled);

  /**
   * Track the ID of the last assistant message we started speaking so we
   * don't re-trigger TTS on every re-render or when unrelated state changes.
   */
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastMsg = conversationMessages[conversationMessages.length - 1];

    // Only speak completed (non-streaming) assistant messages with content,
    // and only when the user has voice playback enabled in Voice Settings.
    if (
      voiceEnabled &&
      lastMsg &&
      lastMsg.role === 'assistant' &&
      !lastMsg.isStreaming &&
      lastMsg.content.trim() &&
      lastMsg.id !== lastSpokenIdRef.current
    ) {
      lastSpokenIdRef.current = lastMsg.id;
      speak(lastMsg.content);
    }
  }, [conversationMessages, speak, voiceEnabled]);

  // Stop any ongoing speech when the user navigates away from this screen.
  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, [stopSpeaking]);

  // Open the paywall bottom sheet whenever the chat store captures a paywall error.
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
    ) => {
      if (!id) return;
      stopSpeaking?.();
      if (conversationExecutionMode === 'cloud' && !FEATURES.cloudChat) {
        Alert.alert(
          'AGI Cloud is not ready on mobile',
          'Local Mode is ready now. Cloud chat will be enabled when the mobile Cloud release is active.',
        );
        return;
      }

      // Prepend quoted context if replying to a message
      let finalText = text;
      if (quotedMessage) {
        const quoteLabel =
          quotedMessage.role === 'user' ? 'You' : (quotedMessage.model ?? 'Assistant');
        const quotePreview =
          quotedMessage.content.length > 150
            ? quotedMessage.content.slice(0, 150).trim() + '...'
            : quotedMessage.content;
        finalText = `> ${quoteLabel}: ${quotePreview}\n\n${text}`;
        setQuotedMessage(null);
      }

      // Handle /image command — generate an image and add result to conversation
      if (finalText.trimStart().startsWith('/image')) {
        const prompt = finalText.trimStart().slice('/image'.length).trim();
        if (!prompt) {
          Alert.alert('Add an image prompt', 'Type what you want AGI to create after /image.');
          return;
        }
        if (conversationExecutionMode !== 'cloud') {
          Alert.alert(
            'Image generation uses AGI Cloud',
            'Start an AGI Cloud chat to generate images. Local Mode can attach and inspect images without uploading them.',
          );
          return;
        }
        if (!FEATURES.imageGen) {
          Alert.alert(
            'Image generation uses AGI Cloud',
            'You can attach and inspect local images now. Image generation is available with Cloud access.',
          );
          return;
        }
        if (!isOnline) {
          Alert.alert(
            'Network connection required',
            'Image generation needs AGI Cloud. Connect to the internet and try again.',
          );
          return;
        }

        const assistantMessageId = beginImageGeneration(id, finalText, prompt, selectedModel);
        generateImage({ prompt })
          .then((result) => {
            const image = result.images?.[0];
            const imageUrl = getGeneratedImageUri(image);
            if (result.success === false || !imageUrl) {
              failImageGeneration(
                id,
                assistantMessageId,
                result.error ?? 'AGI Cloud did not return an image.',
              );
              return;
            }
            completeImageGeneration(id, assistantMessageId, {
              imageUrl,
              revisedPrompt: image?.revisedPrompt,
              model: result.model,
            });
          })
          .catch((err) => {
            if (err instanceof ApiPaywallError) {
              // Paywall/tier-limit block — remove the "generating" placeholder
              // and surface the upgrade sheet instead of a generic failure.
              deleteMessage(id, assistantMessageId);
              setPaywallError({
                feature: err.feature,
                requiredTier: err.requiredTier,
                reason: err.reason,
              });
              return;
            }
            const message = err instanceof Error ? err.message : String(err);
            console.warn('[ChatScreen] Image generation failed:', err);
            failImageGeneration(id, assistantMessageId, message);
          });
        return;
      }

      // When offline, enqueue and show an optimistic queued message bubble
      if (!isOnline) {
        const entry = offlineQueue.enqueue({
          conversationId: id,
          content: finalText,
          model: selectedModel,
        });
        enqueueOfflineMessage(id, finalText, selectedModel, entry.id);
        return;
      }

      const sendOptions = mode ? TASK_CHIP_SEND_CONTEXT[mode] : undefined;

      sendMessage(id, finalText, selectedModel, attachments, sendOptions);
    },
    [
      id,
      conversationExecutionMode,
      selectedModel,
      sendMessage,
      beginImageGeneration,
      completeImageGeneration,
      failImageGeneration,
      stopSpeaking,
      quotedMessage,
      isOnline,
      enqueueOfflineMessage,
    ],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  const resolveAppMode = useCallback((modelId: string): AppMode => {
    // Auto-routing modes run in Local mode.
    if (isAutoMode(modelId)) return 'local';
    // Use the canonical classifier, which consults the FULL managed-cloud catalog
    // (cloudModelSourceMap). The old path used getModelById, whose map only holds
    // local models + ONE "preview" cloud model per provider — so every non-preview
    // cloud model (e.g. Claude Opus 4.8, GPT-5.5, Grok 4.3) fell through to 'local'
    // and wrongly triggered a "Switch from AGI Cloud to Local Mode" prompt when
    // selected inside a Cloud chat. executionModeForModel classifies them as 'cloud'.
    return executionModeForModel(modelId) === 'cloud' ? 'cloud' : 'local';
  }, []);

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
        ? conversation.model && executionModeForModel(conversation.model) === 'cloud'
          ? conversation.model
          : DEFAULT_CLOUD_MODEL_ID
        : conversation.model && executionModeForModel(conversation.model) === 'local'
          ? conversation.model
          : DEFAULT_LOCAL_MODEL_ID;

    if (!preferredModel) return;
    if (conversationExecutionMode === 'cloud' && !cloudUnlocked) return;
    if (useModelStore.getState().selectedModel !== preferredModel) {
      useModelStore.getState().setModel(preferredModel);
    }
  }, [cloudUnlocked, conversation, conversationExecutionMode, setAppMode]);

  // PUBLIC ALPHA (founder 2026-06-27, PA-2): managed cloud is open by default —
  // signing in IS the entitlement (no invite, no waitlist). Every cloud-gated
  // entry point (mode toggle, locked cloud model in the picker, connectors) routes
  // a signed-out user to Clerk sign-in; ClerkTokenBridge flips cloudUnlocked on
  // success. Local stays the free, account-less default.
  const handleOpenCloudSignIn = useCallback(() => {
    router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleModelSelect = useCallback(
    (newModelId: string) => {
      const hasMessages = conversationMessages.length > 0;
      if (!hasMessages) {
        setAppMode(resolveAppMode(newModelId) === 'cloud' ? 'cloud' : 'local');
        useModelStore.getState().setModel(newModelId);
        modelPickerRef.current?.close();
        return;
      }

      const currentMode = conversationExecutionMode;
      const nextMode = resolveAppMode(newModelId);

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

      useModelStore.getState().setModel(newModelId);
      modelPickerRef.current?.close();
    },
    [conversationExecutionMode, conversationMessages.length, resolveAppMode, setAppMode],
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

  const handleOpenConnectors = useCallback(() => {
    if (!FEATURES.connectors) {
      handleOpenCloudSignIn();
      return;
    }
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [handleOpenCloudSignIn, router]);

  // Attachment handlers lifted from AttachmentButton for AddToChatSheet
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
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/csv',
        ],
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

  const [refreshing, setRefreshing] = useState(false);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameText, setRenameText] = useState('');
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const handleTapCloudMode = useCallback(() => {
    // Fail closed: no cloud model wired → stay Local rather than dangle a dead toggle.
    if (!DEFAULT_CLOUD_MODEL_ID) {
      setAppMode('local');
      return;
    }
    // PUBLIC ALPHA (founder 2026-06-27, PA-2): managed cloud is open by default —
    // signing in IS the entitlement (no invite, no waitlist). Route a signed-out user
    // to Clerk sign-in; ClerkTokenBridge flips cloudUnlocked on success.
    if (!cloudUnlocked) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    setAppMode('cloud');
    useModelStore.getState().setModel(DEFAULT_CLOUD_MODEL_ID);
    if (conversationExecutionMode === 'cloud') {
      handleOpenModelPicker('cloud');
      return;
    }
    router.push('/(app)/(tabs)/chat' as Parameters<typeof router.push>[0]);
  }, [cloudUnlocked, conversationExecutionMode, handleOpenModelPicker, router, setAppMode]);

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

  const handleQuoteReply = useCallback((message: ChatMessage) => {
    setQuotedMessage(message);
  }, []);

  const handleDismissQuote = useCallback(() => {
    setQuotedMessage(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!id) return;
    setRefreshing(true);
    await loadMessages(id);
    setRefreshing(false);
  }, [id, loadMessages]);

  const handleOpenVoiceMode = useCallback(() => {
    setVoiceModeVisible(true);
  }, []);

  const handleOpenCompare = useCallback(() => {
    router.push('/(app)/compare' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleOpenExport = useCallback(() => {
    setExportSheetVisible(true);
  }, []);

  const handleCloseVoiceMode = useCallback(() => {
    setVoiceModeVisible(false);
  }, []);

  /**
   * Voice conversation send: sends text to the current conversation and returns
   * the assistant reply text for TTS once streaming completes.
   */
  const handleVoiceSendMessage = useCallback(
    async (text: string): Promise<string> => {
      if (!id) throw new Error('No conversation');
      stopSpeaking();
      const previousMessageIds = createMessageIdSet(useChatStore.getState().messages[id] ?? []);
      await sendMessage(id, text, selectedModel);
      return (
        findNewAssistantResponse(useChatStore.getState().messages[id] ?? [], previousMessageIds) ??
        ''
      );
    },
    [id, sendMessage, selectedModel, stopSpeaking],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!id) return;
      if (conversationExecutionMode === 'cloud') {
        // Cloud messages render from useChatCloudMessageStore (merged into
        // useChatStore.messages), not the local chatMessageStore that
        // deleteMessage() mutates — deleting there alone is a silent no-op for
        // Cloud conversations. Optimistically remove from the cloud cache and
        // persist the delete server-side so a resync doesn't bring it back.
        const previous = useChatCloudMessageStore.getState().messages[id];
        useChatCloudMessageStore.getState().deleteCloudMessage(id, messageId);
        api
          .delete(
            `/api/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(messageId)}`,
          )
          .catch(() => {
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

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      if (!id) return;
      stopSpeaking();
      retryMessage(id, messageId);
    },
    [id, retryMessage, stopSpeaking],
  );

  const handleEditMessage = useCallback(
    (messageId: string, newContent: string) => {
      if (!id) return;
      stopSpeaking();
      editMessage(id, messageId, newContent);
    },
    [id, editMessage, stopSpeaking],
  );

  const handleBack = useCallback(() => {
    stopSpeaking();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    }
  }, [router, stopSpeaking]);

  const handleMenuPress = useCallback(() => {
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
            setExportSheetVisible(true);
          } else if (buttonIndex === 1 && id) {
            Alert.prompt(
              'Rename Conversation',
              'Enter a new title:',
              (newTitle) => {
                if (newTitle?.trim()) {
                  renameConversation(id, newTitle.trim());
                }
              },
              'plain-text',
              title,
            );
          } else if (buttonIndex === 2 && id) {
            Alert.alert('Delete Conversation', 'This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
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
        { text: 'Share', onPress: () => setExportSheetVisible(true) },
        {
          text: 'Rename',
          onPress: () => {
            setRenameText(title);
            setRenameModalVisible(true);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (!id) return;
            deleteConversation(id);
            handleBack();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [id, title, renameConversation, deleteConversation, handleBack]);

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
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Chat header: hamburger left, ModeToggle center, new-chat + menu right */}
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
            style={{ padding: 8, borderRadius: 8 }}
            accessibilityLabel="Open menu"
            accessibilityRole="button"
          >
            <Menu size={22} color={colors.textSecondary} />
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
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: colors.accentSurface,
                borderWidth: 1,
                borderColor: colors.accentBorder,
                maxWidth: 120,
              }}
              accessibilityLabel={`Active project: ${activeProject.name}. Tap to view details.`}
              accessibilityRole="button"
            >
              <Text
                numberOfLines={1}
                style={{ fontSize: 11, color: colors.teal, fontWeight: '500' }}
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
              style={{ padding: 8, borderRadius: 8 }}
              accessibilityLabel="New chat"
              accessibilityRole="button"
            >
              <SquarePen size={20} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={handleMenuPress}
              style={{ padding: 8, borderRadius: 8 }}
              accessibilityLabel="Conversation menu"
              accessibilityRole="button"
            >
              <MoreHorizontal size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* Offline banner */}
        {!isOnline && (
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
            onRetryMessage={handleRetryMessage}
            onEditMessage={handleEditMessage}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            onQuoteReply={handleQuoteReply}
          />
        )}

        {/* Quoted reply bar */}
        {quotedMessage && <QuotedReplyBar message={quotedMessage} onDismiss={handleDismissQuote} />}

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

        {/* Composer — shows TaskChips when conversation is empty */}
        <Composer
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={handleStop}
          onOpenModelPicker={handleOpenModelPicker}
          onOpenVoiceMode={handleOpenVoiceMode}
          onOpenCompare={handleOpenCompare}
          onOpenExport={handleOpenExport}
          onOpenAddToChat={handleOpenAddToChat}
          onOpenConnectors={FEATURES.connectors ? handleOpenConnectors : undefined}
          isOnline={isOnline}
          queueSize={queueSize}
          attachRef={chatInputAttachRef}
          showChips={conversationMessages.length === 0}
          initialText={initialPrompt || undefined}
          draftKey={id}
        />

        {/* Add to Chat bottom sheet */}
        <AddToChatSheet
          ref={addToChatRef}
          onCamera={handleSheetCamera}
          onPhotos={handleSheetPhotos}
          onFile={handleSheetFile}
          onOpenCloudAccess={handleOpenCloudSignIn}
          onOpenStyleSelector={handleOpenStyleSelector}
        />

        <StyleSelector openSignal={styleSelectorOpenSignal} />

        {/* Model picker bottom sheet */}
        <ModelPickerSheet
          sheetRef={modelPickerRef}
          openSignal={modelPickerOpenSignal}
          modelScope={modelPickerScope}
          onSelect={handleModelSelect}
          onOpenCloudAccess={handleOpenCloudSignIn}
        />

        {/* Voice conversation full-screen overlay */}
        <VoiceConversationScreen
          visible={voiceModeVisible}
          onClose={handleCloseVoiceMode}
          onSendMessage={handleVoiceSendMessage}
        />

        {/* Conversation export bottom sheet */}
        <ConversationExportSheet
          visible={exportSheetVisible}
          onClose={() => setExportSheetVisible(false)}
          messages={conversationMessages}
          title={title}
        />

        {/* Paywall bottom sheet — shown when the API returns a tier-cap 429. */}
        <PaywallBottomSheet
          ref={paywallSheetRef}
          feature={paywallError?.feature ?? 'token_cap'}
          requiredTier={paywallError?.requiredTier ?? 'hobby'}
          reason={paywallError?.reason}
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
          onRequestClose={() => setRenameModalVisible(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: colors.scrim,
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
            onPress={() => setRenameModalVisible(false)}
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
                  onPress={() => setRenameModalVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={{ padding: 8 }}
                  onPress={() => {
                    const trimmed = renameText.trim();
                    if (trimmed && id) {
                      renameConversation(id, trimmed);
                    }
                    setRenameModalVisible(false);
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
