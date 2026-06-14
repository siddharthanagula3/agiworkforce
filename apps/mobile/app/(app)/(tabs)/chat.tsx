import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Pressable, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { Menu, SquarePen } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { summarizeSendPreview, type ProviderMode } from '@agiworkforce/types';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { ConversationStarters } from '@/src/features/chat/components/ConversationStarters';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import {
  TASK_CHIP_SEND_CONTEXT,
  type TaskChipType,
} from '@/src/features/chat/components/TaskChips';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { ProjectSelectorBar } from '@/src/features/chat/components/ProjectSelectorBar';
import { StyleSelector } from '@/src/features/chat/components/StyleSelector';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { VoiceConversationScreen } from '@/src/features/voice/components/VoiceConversationScreen';
import {
  createMessageIdSet,
  findNewAssistantResponse,
} from '@/src/features/voice/utils/assistantResponse';
import { InviteCodeModal } from '@/src/features/cloud-bridge';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
} from '@/src/features/model-picker/service';
import { executionModeForModel } from '@/src/features/chat/utils/conversationMode';
import {
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '@/src/features/media/photo-picker';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useWaitlistStore } from '@/src/features/waitlist/store';

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'How can I help you this morning?';
  if (hour < 17) return 'How can I help you this afternoon?';
  if (hour < 21) return 'How can I help you this evening?';
  return 'How can I help you tonight?';
}

const STYLE_SHEET_HANDOFF_DELAY_MS = 450;

/**
 * Chat tab -- composer-first new chat surface.
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
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const [styleSelectorOpenSignal, setStyleSelectorOpenSignal] = useState(0);
  const [modelPickerScope, setModelPickerScope] = useState<'local' | 'cloud'>('local');
  const [cloudAccessVisible, setCloudAccessVisible] = useState(false);
  const [cloudAccessDefaultTab, setCloudAccessDefaultTab] = useState<'invite' | 'waitlist'>(
    'waitlist',
  );

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const selectedModel = useModelStore((s) => s.selectedModel);
  const selectedProvider = useModelStore((s) => s.selectedProvider);
  const setModel = useModelStore((s) => s.setModel);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const waitlistJoined = useWaitlistStore((s) => s.joined);
  const waitlistRank = useWaitlistStore((s) => s.rank);
  const activeMode = appMode;
  const cloudChatAvailable = FEATURES.cloudChat && Boolean(DEFAULT_CLOUD_MODEL_ID);
  const modeDescription =
    activeMode === 'cloud'
      ? 'Continue with AGI Cloud. Use the sidebar for recents and projects.'
      : 'Start privately on this device. Use the sidebar for recents and projects.';

  // SendPreview disclosure data: Mobile supports Local and invite-gated AGI Cloud.
  const sendPreviewPresentation = useMemo(() => {
    const providerMode: ProviderMode =
      selectedProvider === 'cloud_managed' ? 'ManagedGateway' : 'Local';
    return summarizeSendPreview({
      providerMode,
      modelLabel: selectedModel,
      modelId: selectedModel,
    });
  }, [selectedModel, selectedProvider]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (appMode === 'cloud') {
      if (!cloudChatAvailable || !cloudUnlocked || !DEFAULT_CLOUD_MODEL_ID) {
        setAppMode('local');
        setModel(DEFAULT_LOCAL_MODEL_ID);
        return;
      }
      if (executionModeForModel(selectedModel) !== 'cloud') setModel(DEFAULT_CLOUD_MODEL_ID);
      return;
    }

    if (executionModeForModel(selectedModel) !== 'local') setModel(DEFAULT_LOCAL_MODEL_ID);
  }, [appMode, cloudChatAvailable, cloudUnlocked, selectedModel, setAppMode, setModel]);

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const handleSend = useCallback(
    async (
      text: string,
      attachments?: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
      mode?: TaskChipType,
    ) => {
      try {
        if (activeMode === 'cloud' && !FEATURES.cloudChat) {
          Alert.alert(
            'AGI Cloud is not ready on mobile',
            'Local Mode is ready now. Cloud chat will be enabled when the mobile Cloud release is active.',
          );
          return;
        }
        const modelForSend =
          activeMode === 'cloud'
            ? executionModeForModel(selectedModel) === 'cloud'
              ? selectedModel
              : DEFAULT_CLOUD_MODEL_ID
            : executionModeForModel(selectedModel) === 'local'
              ? selectedModel
              : DEFAULT_LOCAL_MODEL_ID;
        if (!modelForSend) return;
        const trimmed = text.trim();
        const fallbackTitle = attachments?.[0]?.fileName ?? 'New chat';
        const titleSource = trimmed || fallbackTitle;
        const title =
          titleSource.length > 40 ? titleSource.slice(0, 40).trim() + '...' : titleSource;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
        const sendOptions = mode ? TASK_CHIP_SEND_CONTEXT[mode] : undefined;
        sendMessage(conversationId, trimmed, modelForSend, attachments, sendOptions).catch(() => {
          // Message send failed — conversation was created, user can retry from chat screen
        });
      } catch {
        // Conversation creation failed — no-op (user can retry)
      }
    },
    [activeMode, createConversation, sendMessage, selectedModel, router],
  );

  const handleOpenModelPicker = useCallback(
    (scope?: 'local' | 'cloud') => {
      setModelPickerScope(scope ?? activeMode);
      setModelPickerOpenSignal((value) => value + 1);
      modelPickerRef.current?.snapToIndex(0);
    },
    [activeMode],
  );

  const handleOpenAddToChat = useCallback(() => {
    addToChatRef.current?.snapToIndex(0);
  }, []);

  const handleOpenStyleSelector = useCallback(() => {
    addToChatRef.current?.close();
    setTimeout(() => {
      setStyleSelectorOpenSignal((value) => value + 1);
    }, STYLE_SHEET_HANDOFF_DELAY_MS);
  }, []);

  const handleOpenCloudAccess = useCallback((defaultTab: 'invite' | 'waitlist' = 'waitlist') => {
    setCloudAccessDefaultTab(defaultTab);
    setCloudAccessVisible(true);
  }, []);

  const handleTapLocalMode = useCallback(() => {
    setAppMode('local');
    setModel(DEFAULT_LOCAL_MODEL_ID);
  }, [setAppMode, setModel]);

  const handleTapCloudMode = useCallback(() => {
    if (!cloudChatAvailable || !cloudUnlocked || !DEFAULT_CLOUD_MODEL_ID) {
      handleOpenCloudAccess('invite');
      return;
    }
    setAppMode('cloud');
    if (activeMode === 'cloud') {
      handleOpenModelPicker('cloud');
      return;
    }
    setModel(DEFAULT_CLOUD_MODEL_ID);
  }, [
    activeMode,
    cloudChatAvailable,
    cloudUnlocked,
    handleOpenCloudAccess,
    handleOpenModelPicker,
    setAppMode,
    setModel,
  ]);

  const handleOpenConnectors = useCallback(() => {
    if (!FEATURES.connectors) {
      handleOpenCloudAccess('invite');
      return;
    }
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [handleOpenCloudAccess, router]);

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
    try {
      const assets = await pickImageAssetsFromLibrary({
        allowsMultipleSelection: true,
        selectionLimit: 5,
        orderedSelection: true,
      });
      if (assets.length > 0) {
        const attachments = imageAssetsToChatAttachments(assets);
        chatInputAttachRef.current?.addAttachments(attachments);
      }
    } catch {
      Alert.alert('Photos', 'Could not open Photos. Please try again.');
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

  const handleOpenCompare = useCallback(() => {
    router.push('/(app)/compare' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleCloseVoiceMode = useCallback(() => {
    setVoiceModeVisible(false);
  }, []);

  const handleVoiceSendMessage = useCallback(
    async (text: string): Promise<string> => {
      try {
        const title = text.length > 40 ? text.slice(0, 40).trim() + '...' : text;
        const conversationId = await createConversation(title);
        const previousMessageIds = createMessageIdSet(
          useChatStore.getState().messages[conversationId] ?? [],
        );
        await sendMessage(conversationId, text, selectedModel);
        return (
          findNewAssistantResponse(
            useChatStore.getState().messages[conversationId] ?? [],
            previousMessageIds,
          ) ?? ''
        );
      } catch {
        throw new Error('Failed to send voice message');
      }
    },
    [createConversation, sendMessage, selectedModel],
  );

  const handleNewChat = useCallback(() => {
    router.replace('/(app)/(tabs)/chat' as Parameters<typeof router.replace>[0]);
  }, [router]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-12">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleOpenDrawer}
            className="w-8 h-8 rounded-lg items-center justify-center"
            style={({ pressed }) => ({ backgroundColor: pressed ? c.surfaceHover : c.transparent })}
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
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: c.accentSurface }}
          accessibilityLabel="New chat"
          accessibilityRole="button"
        >
          <SquarePen size={18} color={c.teal} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingTop: 40,
          paddingBottom: 16,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        accessibilityLabel={activeMode === 'cloud' ? 'New AGI Cloud chat' : 'New local chat'}
      >
        <View style={{ marginBottom: 18 }}>
          <ModeToggle
            mode={activeMode}
            cloudJoined={waitlistJoined}
            cloudUnlocked={cloudUnlocked}
            waitlistRank={waitlistRank}
            onTapLocal={handleTapLocalMode}
            onTapCloud={handleTapCloudMode}
          />
        </View>
        <Text
          style={{
            fontSize: 28,
            lineHeight: 34,
            fontWeight: '500',
            color: c.textPrimary,
            textAlign: 'center',
            marginBottom: 10,
          }}
        >
          {getTimeOfDayGreeting()}
        </Text>
        {activeMode === 'cloud' ? (
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: c.textMuted,
              textAlign: 'center',
              maxWidth: 300,
            }}
          >
            {modeDescription}
          </Text>
        ) : (
          <View style={{ width: '100%', marginTop: 8 }}>
            <ConversationStarters />
          </View>
        )}
      </ScrollView>

      {activeMode === 'local' ? <ProjectSelectorBar /> : null}

      <ChatInput
        onSend={handleSend}
        onOpenModelPicker={handleOpenModelPicker}
        onOpenVoiceMode={handleOpenVoiceMode}
        onOpenCompare={handleOpenCompare}
        onOpenAddToChat={handleOpenAddToChat}
        onOpenConnectors={FEATURES.connectors ? handleOpenConnectors : undefined}
        attachRef={chatInputAttachRef}
        attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
      />

      {/* Add to Chat bottom sheet */}
      <AddToChatSheet
        ref={addToChatRef}
        onCamera={handleSheetCamera}
        onPhotos={handleSheetPhotos}
        onFile={handleSheetFile}
        onOpenCloudAccess={handleOpenCloudAccess}
        onOpenStyleSelector={handleOpenStyleSelector}
      />

      <StyleSelector openSignal={styleSelectorOpenSignal} />

      {/* Model picker bottom sheet */}
      <ModelPickerSheet
        sheetRef={modelPickerRef}
        openSignal={modelPickerOpenSignal}
        modelScope={modelPickerScope}
        onOpenCloudAccess={handleOpenCloudAccess}
      />

      {/* Voice conversation full-screen overlay */}
      <VoiceConversationScreen
        visible={voiceModeVisible}
        onClose={handleCloseVoiceMode}
        onSendMessage={handleVoiceSendMessage}
      />

      <InviteCodeModal
        open={cloudAccessVisible}
        onClose={() => setCloudAccessVisible(false)}
        source="other"
        defaultTab={cloudAccessDefaultTab}
      />
    </SafeAreaView>
  );
}
