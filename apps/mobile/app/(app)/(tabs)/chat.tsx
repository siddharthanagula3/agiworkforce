import { useCallback, useRef, useState, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { ChatInput } from '@/components/chat/ChatInput';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { VoiceConversationScreen } from '@/components/voice/VoiceConversationScreen';
import { ConversationList } from '@/components/sidebar/ConversationList';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { colors } from '@/lib/theme';

/**
 * Chat tab -- shows conversation list with a new-chat input bar.
 * Tapping a conversation navigates to the full chat screen.
 * The input bar at bottom creates a new conversation on send.
 */
export default function ChatTabScreen() {
  const router = useRouter();
  const modelPickerRef = useRef<BottomSheet>(null);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);
  const [searchQuery] = useState('');

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSend = useCallback(
    async (text: string) => {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '...' : text;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
        sendMessage(conversationId, text, selectedModel);
      } catch (error) {
        console.warn('Failed to create conversation:', error);
      }
    },
    [createConversation, sendMessage, selectedModel, router],
  );

  const handleOpenModelPicker = useCallback(() => {
    modelPickerRef.current?.snapToIndex(0);
  }, []);

  const handleOpenVoiceMode = useCallback(() => {
    setVoiceModeVisible(true);
  }, []);

  const handleCloseVoiceMode = useCallback(() => {
    setVoiceModeVisible(false);
  }, []);

  const handleVoiceSendMessage = useCallback(
    async (text: string): Promise<string> => {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '...' : text;
        const conversationId = await createConversation(title);
        sendMessage(conversationId, text, selectedModel);
        return `I received your message: "${text}". Processing now.`;
      } catch {
        throw new Error('Failed to send voice message');
      }
    },
    [createConversation, sendMessage, selectedModel],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-12">
        <Text variant="subheading" className="text-white">
          Chats
        </Text>
        <Pressable
          onPress={() => handleSend('')}
          className="w-8 h-8 rounded-lg bg-teal-500/20 items-center justify-center active:bg-teal-500/30"
          accessibilityLabel="New chat"
          accessibilityRole="button"
        >
          <Plus size={18} color={colors.teal} />
        </Pressable>
      </View>

      {/* Conversation list */}
      <View className="flex-1">
        <ConversationList searchQuery={searchQuery} />
      </View>

      {/* Chat input at bottom */}
      <ChatInput
        onSend={handleSend}
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
    </SafeAreaView>
  );
}
