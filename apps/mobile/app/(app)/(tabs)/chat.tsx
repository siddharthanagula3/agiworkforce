import { useCallback, useRef, useState, useEffect } from 'react';
import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Menu } from 'lucide-react-native';
import type BottomSheet from '@gorhom/bottom-sheet';
import BottomSheetImpl, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { ChatInput } from '@/components/chat/ChatInput';
import { ProjectSelectorBar } from '@/components/chat/ProjectSelectorBar';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { VoiceConversationScreen } from '@/components/voice/VoiceConversationScreen';
import { ConversationList } from '@/components/sidebar/ConversationList';
import { SidebarContent } from '@/components/sidebar/SidebarContent';
import { SearchBar } from '@/components/sidebar/SearchBar';
import { TagFilter } from '@/components/sidebar/TagFilter';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { useProjectStore } from '@/stores/projectStore';
import { colors } from '@/lib/theme';
import type { ConversationTag } from '@/services/autotag';

/**
 * Chat tab -- shows conversation list with a new-chat input bar.
 * Tapping a conversation navigates to the full chat screen.
 * The input bar at bottom creates a new conversation on send.
 */
export default function ChatTabScreen() {
  const router = useRouter();
  const modelPickerRef = useRef<BottomSheet>(null);
  const sidebarSheetRef = useRef<BottomSheetImpl>(null);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<ConversationTag | null>(null);

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const searchConversations = useChatStore((s) => s.searchConversations);
  const searchResults = useChatStore((s) => s.searchResults);
  const storeSearchQuery = useChatStore((s) => s.searchQuery);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleSend = useCallback(
    async (
      text: string,
      attachments?: import('@/components/chat/AttachmentPreview').Attachment[],
    ) => {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '...' : text;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
        sendMessage(conversationId, text, selectedModel, attachments);
      } catch {
        // Conversation creation failed — no-op (user can retry)
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

  const handleNewChat = useCallback(async () => {
    try {
      const conversationId = await createConversation('New conversation');
      router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
    } catch {
      // Conversation creation failed — no-op (user can retry)
    }
  }, [createConversation, router]);

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      searchConversations(text);
    },
    [searchConversations],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface-base" edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-12">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => sidebarSheetRef.current?.snapToIndex(0)}
            className="w-8 h-8 rounded-lg items-center justify-center active:bg-white/5"
            accessibilityLabel="Open sidebar"
            accessibilityRole="button"
          >
            <Menu size={18} color={colors.textSecondary} />
          </Pressable>
          <Text variant="subheading" className="text-white">
            Chats
          </Text>
        </View>
        <Pressable
          onPress={handleNewChat}
          className="w-8 h-8 rounded-lg bg-teal-500/20 items-center justify-center active:bg-teal-500/30"
          accessibilityLabel="New chat"
          accessibilityRole="button"
        >
          <Plus size={18} color={colors.teal} />
        </Pressable>
      </View>

      {/* Search bar */}
      <SearchBar value={searchQuery} onChangeText={handleSearchChange} />

      {/* Project selector */}
      <ProjectSelectorBar />

      {/* Tag filter chips */}
      <View style={{ paddingVertical: 8 }}>
        <TagFilter selectedTag={selectedTag} onSelectTag={setSelectedTag} />
      </View>

      {/* Conversation list — filtered by active project when one is set */}
      <View className="flex-1">
        <ConversationList
          searchQuery={searchQuery}
          searchResults={storeSearchQuery ? searchResults : undefined}
          filterProjectId={activeProjectId}
        />
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

      {/* Sidebar drawer as bottom sheet */}
      <BottomSheetImpl
        ref={sidebarSheetRef}
        index={-1}
        snapPoints={['85%']}
        enablePanDownToClose
        enableDynamicSizing={false}
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
            opacity={0.6}
            pressBehavior="close"
          />
        )}
        backgroundStyle={{ backgroundColor: colors.background }}
        handleIndicatorStyle={{ backgroundColor: 'rgba(255,255,255,0.3)', width: 36 }}
      >
        <SidebarContent />
      </BottomSheetImpl>
    </SafeAreaView>
  );
}
