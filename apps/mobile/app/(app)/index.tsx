import { useCallback, useRef, useState } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Menu } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { ChatInput } from '@/components/chat/ChatInput';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { VoiceConversationScreen } from '@/components/voice/VoiceConversationScreen';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { colors } from '@/lib/theme';

/**
 * Home screen -- intentionally blank with just the input bar.
 * Matches desktop's empty-state design: no suggestions, no recent chats.
 *
 * On send: creates a new conversation, navigates to chat/[id], and sends the message.
 */
export default function HomeScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const modelPickerRef = useRef<BottomSheet>(null);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);

  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);

  const handleSend = useCallback(
    async (text: string) => {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '...' : text;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}`);
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

  /**
   * Voice conversation send: creates a conversation, sends the user message,
   * and returns the streaming response text for TTS.
   */
  const handleVoiceSendMessage = useCallback(
    async (text: string): Promise<string> => {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '...' : text;
        const conversationId = await createConversation(title);
        // We fire-and-forget here; the store updates messages asynchronously.
        sendMessage(conversationId, text, selectedModel);
        // Return a placeholder — VoiceConversationScreen will speak whatever we return.
        return `I received your message: "${text}". Processing now.`;
      } catch {
        throw new Error('Failed to send voice message');
      }
    },
    [createConversation, sendMessage, selectedModel],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      {/* Minimal header with hamburger */}
      <View className="flex-row items-center px-4 h-12">
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
          className="p-2 -ml-2 rounded-lg active:bg-white/5"
          accessibilityLabel="Open sidebar"
          accessibilityRole="button"
        >
          <Menu size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Empty space -- intentionally blank */}
      <View className="flex-1" />

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
