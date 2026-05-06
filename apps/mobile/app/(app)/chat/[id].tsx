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
import { ChevronLeft, MoreHorizontal, WifiOff } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { QuotedReplyBar } from '@/components/chat/QuotedReplyBar';
import { AddToChatSheet } from '@/components/chat/AddToChatSheet';
import { ConversationExportSheet } from '@/components/chat/ConversationExportSheet';
import { ThinkingBottomSheet } from '@/components/chat/ThinkingBottomSheet';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { VoiceConversationScreen } from '@/components/voice/VoiceConversationScreen';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { useAgentStore } from '@/stores/agentStore';
import { useVoicePlayback } from '@/hooks/useVoicePlayback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { generateImage } from '@/services/imagegen';
import { colors } from '@/lib/theme';
import type { ChatMessage } from '@/types/chat';

/**
 * Chat conversation screen.
 * Loads messages for the given conversation ID, renders MessageList + ChatInput.
 */
export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  // useLocalSearchParams can return string | string[] -- narrow to string
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const modelPickerRef = useRef<BottomSheet>(null);
  const exportSheetRef = useRef<BottomSheet>(null);
  const addToChatRef = useRef<BottomSheet>(null);
  const chatInputAttachRef = useRef<{
    addAttachments: (items: import('@/components/chat/AttachmentPreview').Attachment[]) => void;
  } | null>(null);
  const [quotedMessage, setQuotedMessage] = useState<ChatMessage | null>(null);
  const [thinkingSheetIndex, setThinkingSheetIndex] = useState(-1);
  const [thinkingContent, setThinkingContent] = useState('');
  const { isOnline } = useNetworkStatus();

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

    return () => {
      setCurrentConversationId(null);
    };
  }, [id, setCurrentConversationId, loadMessages]);

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

  const handleSend = useCallback(
    (text: string, attachments?: import('@/components/chat/AttachmentPreview').Attachment[]) => {
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

      // Handle /image command — generate an image and add result to conversation
      if (finalText.startsWith('/image ')) {
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
    [id, selectedModel, sendMessage, stopSpeaking, quotedMessage],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  const handleOpenModelPicker = useCallback(() => {
    modelPickerRef.current?.snapToIndex(0);
  }, []);

  const handleOpenAddToChat = useCallback(() => {
    addToChatRef.current?.snapToIndex(0);
  }, []);

  const handleOpenConnectors = useCallback(() => {
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
      const attachments: import('@/components/chat/AttachmentPreview').Attachment[] =
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
      const attachments: import('@/components/chat/AttachmentPreview').Attachment[] =
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
        const attachments: import('@/components/chat/AttachmentPreview').Attachment[] =
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

  const handleOpenThinking = useCallback((content: string) => {
    setThinkingContent(content);
    setThinkingSheetIndex(0);
  }, []);

  const handleCloseThinking = useCallback(() => {
    setThinkingSheetIndex(-1);
  }, []);

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
        {/* Minimal header: back + spacer + menu dots */}
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
          {/* Back button */}
          <Pressable
            onPress={handleBack}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ChevronLeft size={22} color={colors.textSecondary} />
          </Pressable>

          {/* Menu dots */}
          <Pressable
            onPress={handleMenuPress}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Conversation menu"
            accessibilityRole="button"
          >
            <MoreHorizontal size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

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
            onOpenThinking={handleOpenThinking}
          />
        )}

        {/* Quoted reply bar */}
        {quotedMessage && <QuotedReplyBar message={quotedMessage} onDismiss={handleDismissQuote} />}

        {/* Input — disabled when offline */}
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={handleStop}
          onOpenModelPicker={handleOpenModelPicker}
          onOpenVoiceMode={handleOpenVoiceMode}
          onOpenAddToChat={handleOpenAddToChat}
          onOpenConnectors={handleOpenConnectors}
          disabled={!isOnline}
          attachRef={chatInputAttachRef}
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
        <ModelPickerSheet sheetRef={modelPickerRef} />

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

        {/* Shared thinking bottom sheet — one instance for all messages */}
        <ThinkingBottomSheet
          thinkingText={thinkingContent}
          sheetIndex={thinkingSheetIndex}
          onClose={handleCloseThinking}
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
