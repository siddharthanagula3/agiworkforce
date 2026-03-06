import { useCallback, useRef } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Menu } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { ChatInput } from '@/components/chat/ChatInput';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
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
      <ChatInput onSend={handleSend} onOpenModelPicker={handleOpenModelPicker} />

      {/* Model picker bottom sheet */}
      <ModelPickerSheet sheetRef={modelPickerRef} />
    </SafeAreaView>
  );
}
