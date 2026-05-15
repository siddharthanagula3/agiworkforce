import { useCallback, useRef, useState, useEffect } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { Plus, Menu } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { ChatInput } from '@/components/chat/ChatInput';
import { AddToChatSheet } from '@/components/chat/AddToChatSheet';
import { ProjectSelectorBar } from '@/components/chat/ProjectSelectorBar';
import { ModelPickerSheet } from '@/components/model-picker/ModelPickerSheet';
import { VoiceConversationScreen } from '@/components/voice/VoiceConversationScreen';
import { ConversationList } from '@/components/sidebar/ConversationList';
import { SearchBar } from '@/components/sidebar/SearchBar';
import { TagFilter } from '@/components/sidebar/TagFilter';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/stores/modelStore';
import { useProjectStore } from '@/stores/projectStore';
import { useThemeColors } from '@/hooks/useTheme';
import type { ConversationTag } from '@/services/autotag';

/**
 * Chat tab -- shows conversation list with a new-chat input bar.
 * Tapping a conversation navigates to the full chat screen.
 * The input bar at bottom creates a new conversation on send.
 * The hamburger menu opens the app-level drawer navigator.
 */
export default function ChatTabScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const c = useThemeColors();
  const modelPickerRef = useRef<BottomSheet>(null);
  const addToChatRef = useRef<BottomSheet>(null);
  const chatInputAttachRef = useRef<{
    addAttachments: (items: import('@/components/chat/AttachmentPreview').Attachment[]) => void;
  } | null>(null);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<ConversationTag | null>(null);

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const searchConversations = useChatStore((s) => s.searchConversations);
  const searchResults = useChatStore((s) => s.searchResults);
  const storeSearchQuery = useChatStore((s) => s.searchQuery);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const handleOpenDrawer = useCallback(() => {
    // Walk up to the drawer navigator (parent of the tab navigator)
    const parent = navigation.getParent();
    if (parent) {
      parent.dispatch(DrawerActions.openDrawer());
    }
  }, [navigation]);

  const handleSend = useCallback(
    async (
      text: string,
      attachments?: import('@/components/chat/AttachmentPreview').Attachment[],
    ) => {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '...' : text;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
        sendMessage(conversationId, text, selectedModel, attachments).catch(() => {
          // Message send failed — conversation was created, user can retry from chat screen
        });
      } catch {
        // Conversation creation failed — no-op (user can retry)
      }
    },
    [createConversation, sendMessage, selectedModel, router],
  );

  const handleOpenModelPicker = useCallback(() => {
    modelPickerRef.current?.snapToIndex(0);
  }, []);

  const handleOpenAddToChat = useCallback(() => {
    addToChatRef.current?.snapToIndex(0);
  }, []);

  const handleOpenConnectors = useCallback(() => {
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [router]);

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
      await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/csv',
        ],
        copyToCacheDirectory: true,
      });
    } catch {
      Alert.alert('Error', 'Failed to pick document. Please try again.');
    }
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-12">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleOpenDrawer}
            className="w-8 h-8 rounded-lg items-center justify-center active:bg-white/5"
            accessibilityLabel="Open navigation drawer"
            accessibilityRole="button"
          >
            <Menu size={18} color={c.textSecondary} />
          </Pressable>
          <Text variant="subheading" style={{ color: c.textPrimary }}>
            Chats
          </Text>
        </View>
        <Pressable
          onPress={handleNewChat}
          className="w-8 h-8 rounded-lg bg-teal-500/20 items-center justify-center active:bg-teal-500/30"
          accessibilityLabel="New chat"
          accessibilityRole="button"
        >
          <Plus size={18} color={c.teal} />
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
        onOpenAddToChat={handleOpenAddToChat}
        onOpenConnectors={handleOpenConnectors}
        attachRef={chatInputAttachRef}
      />

      {/* Add to Chat bottom sheet */}
      <AddToChatSheet
        ref={addToChatRef}
        onCamera={handleSheetCamera}
        onPhotos={handleSheetPhotos}
        onFile={handleSheetFile}
        conversationId={currentConversationId}
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
