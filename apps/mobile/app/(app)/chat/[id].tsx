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
import { DrawerActions } from '@react-navigation/native';
import { MoreHorizontal, WifiOff, SquarePen, Menu, Cpu } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { MessageList } from '@/src/features/chat/components/MessageList';
import { Composer } from '@/src/features/chat/components/Composer/Composer';
import { QuotedReplyBar } from '@/src/features/chat/components/QuotedReplyBar';
import { ModeSwitchModal, type AppMode } from '@/src/features/chat/components/ModeSwitchModal';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { ConversationExportSheet } from '@/src/features/chat/components/ConversationExportSheet';
import { PaywallBottomSheet } from '@/src/features/chat/components/PaywallBottomSheet';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { VoiceConversationScreen } from '@/src/features/voice/components/VoiceConversationScreen';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useAgentStore } from '@/stores/agentStore';
import { useWaitlistStore } from '@/src/features/waitlist';
import { InviteCodeModal } from '@/src/features/cloud-bridge';
import { ModelTierWarningBanner } from '@/src/features/chat/components/ModelTierWarningBanner';
import { getModelById, isAutoMode } from '@/src/features/model-picker/service';
import { useVoicePlayback } from '@/src/features/voice/hooks/useVoicePlayback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { offlineQueue } from '@/services/offlineQueue';
import { generateImage } from '@/src/features/image/services/imagegen';
import { useThemeColors } from '@/src/ui/theme';
import { useProjectStore } from '@/src/features/projects/store';
import type { ChatMessage } from '@/types/chat';

/**
 * Chat conversation screen.
 * Loads messages for the given conversation ID, renders MessageList + ChatInput.
 */
export default function ChatScreen() {
  const colors = useThemeColors();
  const params = useLocalSearchParams<{ id: string }>();
  // useLocalSearchParams can return string | string[] -- narrow to string
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const activeProject = useProjectStore((s) =>
    s.activeProjectId ? s.projects.find((p) => p.id === s.activeProjectId) : undefined,
  );
  const router = useRouter();
  const navigation = useNavigation();
  const modelPickerRef = useRef<BottomSheet>(null);
  const exportSheetRef = useRef<BottomSheet>(null);
  const addToChatRef = useRef<BottomSheet>(null);
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

  const conversationMessages = useChatStore((s) => (id ? (s.messages[id] ?? []) : []));
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
  const enqueueOfflineMessage = useChatStore((s) => s.enqueueOfflineMessage);
  const markConversationRead = useChatStore((s) => s.markConversationRead);

  const selectedModel = useModelStore((s) => s.selectedModel);
  const approveRequest = useAgentStore((s) => s.approveRequest);
  const rejectRequest = useAgentStore((s) => s.rejectRequest);

  // Find current conversation title
  const conversation = conversations.find((c) => c.id === id);
  const title = conversation?.title ?? 'Chat';

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

  /**
   * Track the ID of the last assistant message we started speaking so we
   * don't re-trigger TTS on every re-render or when unrelated state changes.
   */
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastMsg = conversationMessages[conversationMessages.length - 1];

    // Only speak completed (non-streaming) assistant messages with content.
    if (
      lastMsg &&
      lastMsg.role === 'assistant' &&
      !lastMsg.isStreaming &&
      lastMsg.content.trim() &&
      lastMsg.id !== lastSpokenIdRef.current
    ) {
      lastSpokenIdRef.current = lastMsg.id;
      speak(lastMsg.content);
    }
  }, [conversationMessages, speak]);

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
    ) => {
      if (!id) return;
      stopSpeaking?.();

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

      // Handle /image command — generate an image and add result to conversation
      if (finalText.startsWith('/image ')) {
        if (!FEATURES.imageGen) {
          Alert.alert(
            'Image generation requires Cloud Managed',
            'Mobile v1 can attach and inspect local images, but generation uses hosted compute and is waitlist-gated.',
          );
          return;
        }
        const prompt = finalText.slice(7).trim();
        if (prompt) {
          // Add user message immediately, then kick off generation
          sendMessage(id, finalText, selectedModel, attachments);
          generateImage({ prompt }).catch((err) => {
            console.warn('[ChatScreen] Image generation failed:', err);
          });
          return;
        }
      }

      sendMessage(id, finalText, selectedModel, attachments);
    },
    [id, selectedModel, sendMessage, stopSpeaking, quotedMessage, isOnline, enqueueOfflineMessage],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  const handleOpenModelPicker = useCallback(() => {
    modelPickerRef.current?.snapToIndex(0);
  }, []);

  const resolveAppMode = useCallback((modelId: string): AppMode => {
    if (isAutoMode(modelId)) return 'local';
    const def = getModelById(modelId);
    if (!def) return 'local';
    return def.surface === 'local' ? 'local' : 'cloud';
  }, []);

  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);

  const handleModelSelect = useCallback(
    (newModelId: string) => {
      const hasMessages = conversationMessages.length > 0;
      if (!hasMessages) {
        useModelStore.getState().setModel(newModelId);
        modelPickerRef.current?.close();
        return;
      }

      const currentMode = resolveAppMode(selectedModel);
      const nextMode = resolveAppMode(newModelId);

      if (nextMode === 'cloud' && !FEATURES.cloudChat && !cloudUnlocked) {
        modelPickerRef.current?.close();
        setWaitlistSheetVisible(true);
        return;
      }

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
    [conversationMessages.length, selectedModel, resolveAppMode, cloudUnlocked],
  );

  const handleModeSwitchConfirm = useCallback(async () => {
    const nextModelId = modeSwitchState.pendingModelId;
    if (!nextModelId) return;

    if (modeSwitchState.toMode === 'cloud' && !FEATURES.cloudChat && !cloudUnlocked) {
      setModeSwitchState((s) => ({ ...s, visible: false }));
      setWaitlistSheetVisible(true);
      return;
    }

    useModelStore.getState().setModel(nextModelId);
    setModeSwitchState((s) => ({ ...s, visible: false }));
  }, [modeSwitchState.pendingModelId, modeSwitchState.toMode, cloudUnlocked]);

  const handleModeSwitchCancel = useCallback(() => {
    setModeSwitchState((s) => ({ ...s, visible: false }));
  }, []);

  const handleOpenAddToChat = useCallback(() => {
    addToChatRef.current?.snapToIndex(0);
  }, []);

  const handleOpenConnectors = useCallback(() => {
    if (!FEATURES.connectorsCloudOnly) {
      Alert.alert(
        'Connectors require Cloud Managed',
        'Mobile v1 keeps chat local. Connector OAuth and remote tools open through Desktop handoff or the Cloud Managed waitlist.',
      );
      return;
    }
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [router]);

  // Attachment handlers lifted from AttachmentButton for AddToChatSheet
  const handleSheetCamera = useCallback(async () => {
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
  }, []);

  const handleSheetPhotos = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo Library Access',
        'Photo library permission is required. Please enable it in Settings.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 5,
      orderedSelection: true,
      exif: false,
    });
    if (!result.canceled && result.assets.length > 0) {
      const attachments: import('@/src/features/chat/components/AttachmentPreview').Attachment[] =
        result.assets.map((asset) => ({
          id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          uri: asset.uri,
          mimeType: asset.mimeType ?? 'image/jpeg',
          fileName: asset.fileName ?? 'image.jpg',
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        }));
      chatInputAttachRef.current?.addAttachments(attachments);
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
  const [waitlistSheetVisible, setWaitlistSheetVisible] = useState(false);

  const waitlistJoined = useWaitlistStore((s) => s.joined);
  const waitlistRank = useWaitlistStore((s) => s.rank);

  const handleOpenWaitlist = useCallback(() => {
    setWaitlistSheetVisible(true);
  }, []);

  const handleNewChat = useCallback(() => {
    router.push('/(app)' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleOpenDrawer = useCallback(() => {
    navigation.dispatch(DrawerActions.openDrawer());
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
      sendMessage(id, text, selectedModel);
      // Return the user text as acknowledgement -- streaming response will be
      // spoken separately by VoiceConversationScreen via the TTS onDone callback
      // once the next assistant message arrives in the store.
      return `Got it. Processing: "${text}"`;
    },
    [id, sendMessage, selectedModel, stopSpeaking],
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!id) return;
      deleteMessage(id, messageId);
    },
    [id, deleteMessage],
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
            exportSheetRef.current?.snapToIndex(0);
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
        { text: 'Share', onPress: () => exportSheetRef.current?.snapToIndex(0) },
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
      <SafeAreaView className="flex-1 bg-surface-base items-center justify-center">
        <Text className="text-white/50">No conversation selected</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
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
          {activeProjectId && activeProject ? (
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
                backgroundColor: `${colors.teal}18`,
                borderWidth: 1,
                borderColor: `${colors.teal}35`,
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
              mode="local"
              cloudJoined={waitlistJoined}
              waitlistRank={waitlistRank}
              onTapCloud={handleOpenWaitlist}
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

        {/* On-device shield badge — shown when conversation is empty */}
        {conversationMessages.length === 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 20,
              backgroundColor: `${colors.teal}1F`,
              marginTop: 10,
            }}
            accessibilityLabel="On-device mode active"
          >
            <Cpu size={12} color={colors.teal} strokeWidth={1.8} />
            <Text style={{ fontSize: 12, color: colors.teal, fontWeight: '500' }}>
              On-device · Private · Works offline
            </Text>
          </View>
        )}

        {/* Offline banner */}
        {!isOnline && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(239, 68, 68, 0.2)',
            }}
          >
            <WifiOff size={12} color="#ef4444" />
            <Text style={{ fontSize: 12, color: '#ef4444' }}>
              You're offline — viewing cached conversations
            </Text>
          </View>
        )}

        {/* Messages */}
        {isLoadingMessages && conversationMessages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.teal} size="small" />
            <Text className="text-xs text-white/30 mt-2">Loading messages...</Text>
          </View>
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

        {/* Composer — shows TaskChips when conversation is empty */}
        <Composer
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={handleStop}
          onOpenModelPicker={handleOpenModelPicker}
          onOpenVoiceMode={handleOpenVoiceMode}
          onOpenAddToChat={handleOpenAddToChat}
          onOpenConnectors={handleOpenConnectors}
          isOnline={isOnline}
          queueSize={queueSize}
          attachRef={chatInputAttachRef}
          showChips={conversationMessages.length === 0}
        />

        {/* Add to Chat bottom sheet */}
        <AddToChatSheet
          ref={addToChatRef}
          onCamera={handleSheetCamera}
          onPhotos={handleSheetPhotos}
          onFile={handleSheetFile}
          conversationId={id}
        />

        {/* Model picker bottom sheet */}
        <ModelPickerSheet sheetRef={modelPickerRef} onSelect={handleModelSelect} />

        {/* Voice conversation full-screen overlay */}
        <VoiceConversationScreen
          visible={voiceModeVisible}
          onClose={handleCloseVoiceMode}
          onSendMessage={handleVoiceSendMessage}
        />

        {/* Conversation export bottom sheet */}
        <ConversationExportSheet
          sheetRef={exportSheetRef}
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

        {/* Cloud gate modal — shown when user taps locked Cloud in ModeToggle */}
        <InviteCodeModal
          open={waitlistSheetVisible}
          onClose={() => setWaitlistSheetVisible(false)}
          source="other"
          defaultTab="waitlist"
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
              backgroundColor: 'rgba(0,0,0,0.6)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
            onPress={() => setRenameModalVisible(false)}
          >
            <Pressable
              style={{
                width: '100%',
                backgroundColor: '#1e2025',
                borderRadius: 14,
                padding: 20,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
              onPress={() => undefined}
            >
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 }}>
                Rename Conversation
              </Text>
              <TextInput
                style={{
                  backgroundColor: 'rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 15,
                  color: '#fff',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.1)',
                  marginBottom: 16,
                }}
                value={renameText}
                onChangeText={setRenameText}
                autoFocus
                placeholder="Enter a new title"
                placeholderTextColor="rgba(255,255,255,0.3)"
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
