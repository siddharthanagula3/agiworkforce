import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { DrawerActions } from '@react-navigation/native';
import { Cpu, Plus, Menu } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { summarizeSendPreview, type ProviderMode } from '@agiworkforce/types';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { ProjectSelectorBar } from '@/src/features/chat/components/ProjectSelectorBar';
import { SendPreview } from '@/src/features/chat/components/SendPreview';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { VoiceConversationScreen } from '@/src/features/voice/components/VoiceConversationScreen';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';

/**
 * Chat tab -- Claude-style composer-first new chat surface.
 * Recents live in the drawer; this screen stays focused on starting work.
 * The hamburger menu opens the app-level drawer navigator.
 */
export default function ChatTabScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const c = useThemeColors();
  const modelPickerRef = useRef<BottomSheet>(null);
  const addToChatRef = useRef<BottomSheet>(null);
  const chatInputAttachRef = useRef<{
    addAttachments: (
      items: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
    ) => void;
  } | null>(null);
  const [voiceModeVisible, setVoiceModeVisible] = useState(false);

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const selectedProvider = useModelStore((s) => s.selectedProvider);

  // SendPreview disclosure — Mobile is local-only in v1 (per locks), so the
  // typical render is the "Stays on this device" Local banner. The mapping
  // still respects future BYOK/Managed unlocking via `selectedProvider`.
  const sendPreviewPresentation = useMemo(() => {
    const providerMode: ProviderMode =
      selectedProvider === 'local' || !selectedProvider
        ? 'Local'
        : selectedProvider === 'managed_cloud'
          ? 'ManagedGateway'
          : 'DirectByok';
    return summarizeSendPreview({
      providerMode,
      modelLabel: selectedModel,
      modelId: selectedModel,
    });
  }, [selectedModel, selectedProvider]);

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
      attachments?: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
    ) => {
      try {
        const trimmed = text.trim();
        const fallbackTitle = attachments?.[0]?.fileName ?? 'New chat';
        const titleSource = trimmed || fallbackTitle;
        const title =
          titleSource.length > 40 ? titleSource.slice(0, 40).trim() + '...' : titleSource;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
        sendMessage(conversationId, trimmed, selectedModel, attachments).catch(() => {
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
    if (!FEATURES.connectorsCloudOnly) {
      Alert.alert(
        'Connectors require Cloud Managed',
        'Mobile v1 keeps chat local. Connector OAuth and remote tools open through Desktop handoff or the Cloud Managed waitlist.',
      );
      return;
    }
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
            AGI
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

      <View className="flex-1 items-center justify-center px-6" accessibilityLabel="New local chat">
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 11,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: `${c.teal}18`,
            borderWidth: 1,
            borderColor: `${c.teal}30`,
            marginBottom: 18,
          }}
        >
          <Cpu size={13} color={c.teal} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: c.teal }}>
            Local Mode + Local LLMs
          </Text>
        </View>
        <Text
          style={{
            fontSize: 30,
            lineHeight: 36,
            fontWeight: '500',
            color: c.textPrimary,
            textAlign: 'center',
          }}
        >
          What can I help with?
        </Text>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: c.textMuted,
            textAlign: 'center',
            marginTop: 10,
            maxWidth: 300,
          }}
        >
          Start privately on this device. Use the sidebar for recents, projects, artifacts, and code
          sessions.
        </Text>
      </View>

      <ProjectSelectorBar />

      <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
        <SendPreview presentation={sendPreviewPresentation} />
      </View>

      <ChatInput
        onSend={handleSend}
        onOpenModelPicker={handleOpenModelPicker}
        onOpenVoiceMode={handleOpenVoiceMode}
        onOpenAddToChat={handleOpenAddToChat}
        onOpenConnectors={handleOpenConnectors}
        attachRef={chatInputAttachRef}
        attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
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
