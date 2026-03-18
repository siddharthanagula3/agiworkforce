import { useEffect, useCallback, useRef, useState } from 'react';
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { VoiceConversationScreen } from '@/components/voice/VoiceConversationScreen';
import { NetworkBadge } from '@/components/ui/NetworkBadge';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { useAgentStore } from '@/stores/agentStore';
import { useVoicePlayback } from '@/hooks/useVoicePlayback';
import { colors } from '@/lib/theme';

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

  const conversationMessages = useChatStore((s) => (id ? (s.messages[id] ?? []) : []));
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const conversations = useChatStore((s) => s.conversations);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setCurrentConversationId = useChatStore((s) => s.setCurrentConversationId);
  const deleteMessage = useChatStore((s) => s.deleteMessage);

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
      stopSpeaking();
      sendMessage(id, text, selectedModel, attachments);
    },
    [id, selectedModel, sendMessage, stopSpeaking],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  const handleOpenModelPicker = useCallback(() => {
    modelPickerRef.current?.snapToIndex(0);
  }, []);

  const [refreshing, setRefreshing] = useState(false);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);

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

  const handleBack = useCallback(() => {
    stopSpeaking();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)' as Parameters<typeof router.replace>[0]);
    }
  }, [router, stopSpeaking]);

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
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            height: 48,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            gap: 8,
          }}
        >
          {/* Back button */}
          <Pressable
            onPress={handleBack}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <ArrowLeft size={20} color={colors.textSecondary} />
          </Pressable>

          {/* Title */}
          <Text className="flex-1 text-[15px] font-semibold text-white" numberOfLines={1}>
            {title}
          </Text>

          {/* Network badge */}
          <NetworkBadge />
        </View>

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
            onRefresh={handleRefresh}
            refreshing={refreshing}
          />
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={handleStop}
          onOpenModelPicker={handleOpenModelPicker}
          onOpenVoiceMode={handleOpenVoiceMode}
        />

        {/* Model picker bottom sheet */}
        <ModelPickerSheet sheetRef={modelPickerRef} />

        {/* Voice conversation full-screen overlay */}
        <VoiceConversationScreen
          visible={voiceModeVisible}
          onClose={handleCloseVoiceMode}
          onSendMessage={handleVoiceSendMessage}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
