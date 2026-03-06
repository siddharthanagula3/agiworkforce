import { useEffect, useCallback, useRef } from 'react';
import { View, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useNavigation, DrawerActions } from '@react-navigation/native';
import { ArrowLeft, Menu } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { useAgentStore } from '@/stores/agentStore';
import { colors } from '@/lib/theme';

/**
 * Chat conversation screen.
 * Loads messages for the given conversation ID, renders MessageList + ChatInput.
 */
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const modelPickerRef = useRef<BottomSheet>(null);

  const conversationMessages = useChatStore((s) => (id ? (s.messages[id] ?? []) : []));
  const isStreaming = useChatStore((s) => s.isStreaming);
  const isLoadingMessages = useChatStore((s) => s.isLoadingMessages);
  const conversations = useChatStore((s) => s.conversations);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStreaming = useChatStore((s) => s.stopStreaming);
  const setCurrentConversationId = useChatStore((s) => s.setCurrentConversationId);

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

  const handleSend = useCallback(
    (text: string) => {
      if (!id) return;
      sendMessage(id, text, selectedModel);
    },
    [id, selectedModel, sendMessage],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
  }, [stopStreaming]);

  const handleOpenModelPicker = useCallback(() => {
    modelPickerRef.current?.snapToIndex(0);
  }, []);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)');
    }
  }, [router]);

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

          {/* Drawer toggle */}
          <Pressable
            onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel="Open menu"
            accessibilityRole="button"
          >
            <Menu size={20} color={colors.textSecondary} />
          </Pressable>
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
          />
        )}

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onStop={handleStop}
          onOpenModelPicker={handleOpenModelPicker}
        />

        {/* Model picker bottom sheet */}
        <ModelPickerSheet sheetRef={modelPickerRef} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
