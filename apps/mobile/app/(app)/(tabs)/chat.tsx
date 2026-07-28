import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Pressable, Alert, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Download, Menu } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import type BottomSheet from '@gorhom/bottom-sheet';
import { summarizeSendPreview, type ProviderMode } from '@agiworkforce/types';
import { ChatInput } from '@/src/features/chat/components/ChatInput';
import { ModeToggle } from '@/src/features/chat/components/ModeToggle';
import { TemporaryChatToggle } from '@/src/features/chat/components/TemporaryChatToggle';
import { AgiMark } from '@/components/ui/AgiMark';
import {
  TASK_CHIP_SEND_CONTEXT,
  type TaskChipType,
} from '@/src/features/chat/components/TaskChips';
import { AddToChatSheet } from '@/src/features/chat/components/AddToChatSheet';
import { ProjectSelectorBar } from '@/src/features/chat/components/ProjectSelectorBar';
import { StyleSelector } from '@/src/features/chat/components/StyleSelector';
import { ModelPickerSheet } from '@/src/features/model-picker/components/ModelPickerSheet';
import { VoiceConversationScreen } from '@/src/features/voice/components/VoiceConversationScreen';
import { VoiceOnboardingSheet } from '@/src/features/voice/components/VoiceOnboardingSheet';
import { VoicePickerSheet } from '@/src/features/voice/components/VoicePickerSheet';
import { useSettingsStore } from '@/stores/settingsStore';
import { findNewAssistantResponse } from '@/src/features/voice/utils/assistantResponse';
import { Text } from '@/components/ui/text';
import { useChatStore } from '@/stores/chatStore';
import { useModelStore } from '@/src/features/model-picker/store';
import {
  DEFAULT_CLOUD_MODEL_ID,
  DEFAULT_LOCAL_MODEL_ID,
  getDefaultCloudModelIdForTier,
  getShortDisplayName,
} from '@/src/features/model-picker/service';
import { executionModeForSelection } from '@/src/features/chat/utils/conversationMode';
import {
  imageAssetsToChatAttachments,
  pickImageAssetsFromLibrary,
} from '@/src/features/media/photo-picker';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import { useTierStore } from '@/src/features/billing/store';
import { useThemeColors } from '@/src/ui/theme';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { openNearestDrawer } from '@/src/navigation/openNearestDrawer';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';
import { runImageGenerationTurn } from '@/src/features/chat/actions/runImageGenerationTurn';
import { useAuthStore } from '@/src/features/auth/store';
import { resolveMobileImageGenerationRequest } from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';

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
  const [voiceIntroVisible, setVoiceIntroVisible] = useState(false);
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  const [modelPickerOpenSignal, setModelPickerOpenSignal] = useState(0);
  const [styleSelectorOpenSignal, setStyleSelectorOpenSignal] = useState(0);
  const [modelPickerScope, setModelPickerScope] = useState<'local' | 'cloud'>('local');

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const beginImageGeneration = useChatStore((s) => s.beginImageGeneration);
  const completeImageGeneration = useChatStore((s) => s.completeImageGeneration);
  const failImageGeneration = useChatStore((s) => s.failImageGeneration);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const setPaywallError = useChatStore((s) => s.setPaywallError);
  const clearError = useChatStore((s) => s.clearError);
  const setSendError = useChatStore((s) => s.setSendError);
  const imageGenerationEnabled = useChatStore((s) => s.features.imageGen);

  // Error state lives in the shared chat store, not scoped per-conversation --
  // without this, a stale error banner from a previous conversation (e.g. "no
  // on-device model ready" from a Local-mode chat) leaks into this empty-state
  // screen whenever it regains focus (tab switch, back-nav). Previously this
  // only cleared when the now-removed header "new chat" button was tapped.
  useFocusEffect(
    useCallback(() => {
      clearError();
    }, [clearError]),
  );
  const { isOnline } = useNetworkStatus();
  const selectedModel = useModelStore((s) => s.selectedModel);
  const setModel = useModelStore((s) => s.setModel);
  const appMode = useChatAppModeStore((s) => s.appMode);
  const setAppMode = useChatAppModeStore((s) => s.setAppMode);
  const cloudUnlocked = useWaitlistStore((s) => s.cloudUnlocked);
  const clerkUserId = useAuthStore((s) => s.clerkUserId);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const waitlistJoined = useWaitlistStore((s) => s.joined);
  const waitlistRank = useWaitlistStore((s) => s.rank);
  const subscriptionTier = useTierStore((s) => s.tier);
  const grantedCapabilities = useTierStore((s) => s.grantedCapabilities);
  const installedModelIds = useModelInstallStore((s) => s.installedModelIds);
  const readySystemModelIds = useModelInstallStore((s) => s.readySystemModelIds);
  const activeMode = appMode;
  const hasReadyLocalModel = installedModelIds.length > 0 || readySystemModelIds.length > 0;
  const cloudChatAvailable = FEATURES.cloudChat && Boolean(DEFAULT_CLOUD_MODEL_ID);
  const modeDescription =
    activeMode === 'cloud'
      ? 'Continue with AGI Cloud. Use the sidebar for recents and projects.'
      : 'Start privately on this device. Use the sidebar for recents and projects.';

  // SendPreview disclosure data: Mobile supports Local and sign-in-gated AGI Cloud.
  const sendPreviewPresentation = useMemo(() => {
    const providerMode: ProviderMode = activeMode === 'cloud' ? 'ManagedGateway' : 'Local';
    return summarizeSendPreview({
      providerMode,
      modelLabel: selectedModel,
      modelId: selectedModel,
    });
  }, [activeMode, selectedModel]);

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
      if (executionModeForSelection(selectedModel, appMode) !== 'cloud') {
        setModel(getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID);
      }
      return;
    }

    if (executionModeForSelection(selectedModel, appMode) !== 'local') {
      setModel(DEFAULT_LOCAL_MODEL_ID);
    }
  }, [
    appMode,
    cloudChatAvailable,
    cloudUnlocked,
    selectedModel,
    setAppMode,
    setModel,
    subscriptionTier,
  ]);

  const handleOpenDrawer = useCallback(() => {
    openNearestDrawer(navigation);
  }, [navigation]);

  const handleSend = useCallback(
    async (
      text: string,
      attachments?: import('@/src/features/chat/components/AttachmentPreview').Attachment[],
      mode?: TaskChipType,
      dispatchOptions?: { awaitCompletion?: boolean },
    ): Promise<boolean> => {
      // Returns false when a pre-flight gate blocks the send so the composer
      // keeps the user's draft; resolves true once the message is committed.
      try {
        if (activeMode === 'cloud' && !FEATURES.cloudChat) {
          Alert.alert(
            'AGI Cloud is not ready on mobile',
            'Local Mode is ready now. Cloud chat will be enabled when the mobile Cloud release is active.',
          );
          return false;
        }
        const modelForSend =
          activeMode === 'cloud'
            ? executionModeForSelection(selectedModel, activeMode) === 'cloud'
              ? selectedModel
              : (getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID)
            : executionModeForSelection(selectedModel, activeMode) === 'local'
              ? selectedModel
              : DEFAULT_LOCAL_MODEL_ID;
        if (!modelForSend) return false;
        const trimmed = text.trim();
        const imageRequest = resolveMobileImageGenerationRequest({
          executionMode: activeMode,
          text: trimmed,
          selection: modelForSend,
          subscriptionTier,
          hasAttachments: Boolean(attachments?.length),
          globalImageGenerationEnabled: FEATURES.imageGen,
          imageGenerationEnabled,
          isClerkSignedIn,
          ownerId: clerkUserId,
          grantedCapabilities,
          isOnline,
        });

        // Image output is a specialist media route, not a chat-completions
        // response. The canonical classifier handles both /image and natural
        // language; Local remains isolated and never reaches this resolver.
        if (imageRequest.status === 'blocked') {
          Alert.alert(imageRequest.alert.title, imageRequest.alert.message);
          return false;
        }
        if (imageRequest.status === 'ready') {
          const title =
            imageRequest.prompt.length > 40
              ? imageRequest.prompt.slice(0, 40).trim() + '...'
              : imageRequest.prompt;
          const conversationId = await createConversation(title);
          router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);

          const imageTurn = runImageGenerationTurn({
            conversationId,
            displayText: trimmed,
            prompt: imageRequest.prompt,
            model: imageRequest.model,
            ownerId: imageRequest.ownerId,
            begin: beginImageGeneration,
            complete: completeImageGeneration,
            fail: failImageGeneration,
            remove: deleteMessage,
            onPaywall: (error) => {
              setPaywallError({
                feature: error.feature,
                requiredTier: error.requiredTier,
                reason: error.reason,
              });
            },
            onUnexpectedError: (error) => {
              console.warn('[ChatTabScreen] Image generation failed:', error);
            },
          });
          if (dispatchOptions?.awaitCompletion) await imageTurn;
          else void imageTurn;
          return true;
        }

        const fallbackTitle = attachments?.[0]?.fileName ?? 'New chat';
        const titleSource = trimmed || fallbackTitle;
        const title =
          titleSource.length > 40 ? titleSource.slice(0, 40).trim() + '...' : titleSource;
        const conversationId = await createConversation(title);
        router.push(`/(app)/chat/${conversationId}` as Parameters<typeof router.push>[0]);
        const sendOptions = mode ? TASK_CHIP_SEND_CONTEXT[mode] : undefined;
        // Resolve true the moment the store commits the user message so the
        // home composer clears its "new-chat" draft on acceptance — a send
        // blocked by a pre-flight gate keeps the text for when the user
        // returns to this screen.
        if (dispatchOptions?.awaitCompletion) {
          return await sendMessage(conversationId, trimmed, modelForSend, attachments, sendOptions);
        }
        return resolveOnAcceptedSend(
          (onAccepted) =>
            sendMessage(conversationId, trimmed, modelForSend, attachments, {
              ...(sendOptions ?? {}),
              onAccepted,
            }),
          (err) => {
            // The user has already been routed to the conversation screen —
            // surface the failure in its SendErrorBanner, never silently.
            console.warn('[ChatTabScreen] sendMessage rejected:', err);
            setSendError('Message could not be sent. Please try again.');
          },
        );
      } catch (err) {
        // Conversation creation failed — tell the user and keep the draft so
        // they can retry (the home tab has no error banner, so Alert here).
        console.warn('[ChatTabScreen] createConversation failed:', err);
        Alert.alert('Could not start the chat', 'Something went wrong. Please try again.');
        return false;
      }
    },
    [
      activeMode,
      createConversation,
      sendMessage,
      selectedModel,
      subscriptionTier,
      grantedCapabilities,
      imageGenerationEnabled,
      isClerkSignedIn,
      clerkUserId,
      router,
      isOnline,
      beginImageGeneration,
      completeImageGeneration,
      failImageGeneration,
      deleteMessage,
      setPaywallError,
      setSendError,
    ],
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

  // PUBLIC ALPHA (founder 2026-06-27, PA-2): managed cloud is open by default —
  // signing in IS the entitlement (no invite, no waitlist). Every cloud-gated entry
  // point routes a signed-out user to Clerk sign-in; ClerkTokenBridge flips
  // cloudUnlocked on success. Local stays the free, account-less default.
  const handleOpenCloudAccess = useCallback(() => {
    router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
  }, [router]);

  const handleTapLocalMode = useCallback(() => {
    setAppMode('local');
    setModel(DEFAULT_LOCAL_MODEL_ID);
  }, [setAppMode, setModel]);

  const handleTapCloudMode = useCallback(() => {
    // Fail closed: if managed cloud chat isn't wired (feature off / no cloud model),
    // stay in Local rather than dangling a dead toggle.
    if (!cloudChatAvailable || !DEFAULT_CLOUD_MODEL_ID) {
      setAppMode('local');
      return;
    }
    // PUBLIC ALPHA (founder 2026-06-27, PA-2): managed cloud is open by default —
    // the signed-in entitlement IS the gate. No invite code, no waitlist. A not-yet-
    // unlocked (signed-out) user is routed to Clerk sign-in; signing in flips
    // cloudUnlocked via ClerkTokenBridge and Cloud becomes usable. Local stays the
    // free, account-less default.
    if (!cloudUnlocked) {
      router.push('/(auth)/login' as Parameters<typeof router.push>[0]);
      return;
    }
    // The toggle ONLY switches modes — model selection belongs to the
    // composer's model chip. (It previously re-opened the model picker when
    // already in Cloud, blurring the two responsibilities.)
    if (activeMode !== 'cloud') {
      setAppMode('cloud');
      setModel(getDefaultCloudModelIdForTier(subscriptionTier) ?? DEFAULT_CLOUD_MODEL_ID);
    }
  }, [
    activeMode,
    cloudChatAvailable,
    cloudUnlocked,
    router,
    setAppMode,
    setModel,
    subscriptionTier,
  ]);

  const handleOpenConnectors = useCallback(() => {
    if (!FEATURES.connectors) {
      // Connectors are a managed-cloud feature; gate behind sign-in (public alpha).
      handleOpenCloudAccess();
      return;
    }
    router.push('/(app)/connectors' as Parameters<typeof router.push>[0]);
  }, [handleOpenCloudAccess, router]);

  const handleSheetCamera = useCallback(async () => {
    try {
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
    } catch {
      Alert.alert('Camera', 'Could not open the camera. Please try again.');
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
    // The intro carries the recording disclosure, so it has to land BEFORE the
    // conversation screen opens a live microphone — not alongside it.
    if (!useSettingsStore.getState().voiceOnboardingSeen) {
      setVoiceIntroVisible(true);
      return;
    }
    setVoiceModeVisible(true);
  }, []);

  // Intro -> pick a voice -> conversation. The picker only fronts the FIRST
  // run; afterwards the saved preset is used and the mic opens directly, so a
  // returning user is not asked to re-choose every time.
  const handleVoiceIntroContinue = useCallback(() => {
    setVoiceIntroVisible(false);
    setVoicePickerVisible(true);
  }, []);

  const handleVoicePickerStart = useCallback(() => {
    setVoicePickerVisible(false);
    setVoiceModeVisible(true);
  }, []);

  const handleVoicePickerDismiss = useCallback(() => {
    setVoicePickerVisible(false);
  }, []);

  // Dismissing without acknowledging must not start voice, and must not mark
  // the disclosure as seen — the sheet returns next time.
  const handleVoiceIntroDismiss = useCallback(() => {
    setVoiceIntroVisible(false);
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
        // Reuse the composer dispatch path so voice receives the same boundary,
        // Auto, media specialist, network, and paywall behavior as typed input.
        const accepted = await handleSend(text, undefined, undefined, { awaitCompletion: true });
        if (!accepted) {
          throw new Error(useChatStore.getState().error ?? 'Message was not sent.');
        }
        const conversationId = useChatStore.getState().currentConversationId;
        if (!conversationId) return '';
        return (
          findNewAssistantResponse(
            useChatStore.getState().messages[conversationId] ?? [],
            new Set(),
          ) ?? ''
        );
      } catch {
        throw new Error('Failed to send voice message');
      }
    },
    [handleSend],
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.surfaceBase }} edges={['top']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 h-12">
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleOpenDrawer}
            className="w-8 h-8 rounded-full items-center justify-center"
            style={({ pressed }) => ({ backgroundColor: pressed ? c.surfaceHover : c.transparent })}
            accessibilityLabel="Open navigation drawer"
            accessibilityRole="button"
          >
            <Menu size={18} color={c.textSecondary} />
          </Pressable>
          {/* The header owns ONLY the execution-mode toggle (Local | Cloud).
              Model selection lives exclusively in the composer's model chip —
              the old model pill here duplicated it and confusingly read
              "AGI Cloud" like the toggle's Cloud segment. */}
          <ModeToggle
            mode={activeMode}
            cloudJoined={waitlistJoined}
            cloudUnlocked={cloudUnlocked}
            waitlistRank={waitlistRank}
            onTapLocal={handleTapLocalMode}
            onTapCloud={handleTapCloudMode}
            compact
          />
        </View>
        {/* Already in the empty new-chat state -- a "new chat" action here would
            be a no-op, so this slot is the temporary-chat toggle instead. */}
        <TemporaryChatToggle />
      </View>

      {/* Android: adjustResize already resizes the window; stacking
          behavior="height" double-handles the keyboard and causes resize
          jumps. iOS keeps "padding". */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            // Bottom-anchor the greeting block just above the composer (ChatGPT mobile
            // new-chat: composer-focused, greeting sits low, NO suggestion cards — founder
            // decision 2026-07-19) rather than floating it in the vertical center.
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 16,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          accessibilityLabel={activeMode === 'cloud' ? 'New AGI Cloud chat' : 'New local chat'}
        >
          {/* Brand mark above the greeting — the empty-state visual anchor. Sits low
              (bottom-anchored) above the composer, ChatGPT-mobile style. */}
          <View style={{ marginBottom: 14 }}>
            <AgiMark size={44} />
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
              {!hasReadyLocalModel && (
                <DownloadModelBanner
                  onPress={() => router.push('/(app)/models' as Parameters<typeof router.push>[0])}
                />
              )}
            </View>
          )}
        </ScrollView>

        {/* Mode-aware: shows local projects in Local, cloud projects in Cloud. */}
        <ProjectSelectorBar />

        <ChatInput
          onSend={handleSend}
          onOpenModelPicker={handleOpenModelPicker}
          onOpenVoiceMode={handleOpenVoiceMode}
          onOpenCompare={handleOpenCompare}
          onOpenAddToChat={handleOpenAddToChat}
          onOpenConnectors={FEATURES.connectors ? handleOpenConnectors : undefined}
          attachRef={chatInputAttachRef}
          attachmentPrivacyShortLabel={sendPreviewPresentation.privacyShortLabel}
          draftKey="new-chat"
          draftProvenance={
            activeMode === 'local'
              ? { scope: 'local' }
              : clerkUserId
                ? { scope: 'cloud', ownerId: clerkUserId }
                : undefined
          }
        />
      </KeyboardAvoidingView>

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
        onSelect={setModel}
        onOpenCloudAccess={handleOpenCloudAccess}
      />

      {/* First-run voice intro + recording disclosure, gating the overlay below */}
      <VoiceOnboardingSheet
        visible={voiceIntroVisible}
        onContinue={handleVoiceIntroContinue}
        onDismiss={handleVoiceIntroDismiss}
      />

      {/* First-run voice picker, between the intro and the live conversation */}
      <VoicePickerSheet
        visible={voicePickerVisible}
        onStart={handleVoicePickerStart}
        onDismiss={handleVoicePickerDismiss}
      />

      {/* Voice conversation full-screen overlay */}
      <VoiceConversationScreen
        visible={voiceModeVisible}
        onClose={handleCloseVoiceMode}
        onSendMessage={handleVoiceSendMessage}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// DownloadModelBanner — shown in local mode when no model is installed yet.
// ---------------------------------------------------------------------------

interface DownloadModelBannerProps {
  onPress: () => void;
}

function DownloadModelBanner({ onPress }: DownloadModelBannerProps) {
  const c = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Download a model to chat"
      accessibilityHint="Opens the model library to download a local AI model"
      testID="download-model-banner"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: pressed ? c.surfaceHover : c.accentSurface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.accentBorder,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 16,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          backgroundColor: c.accentSurface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Download size={16} color={c.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: c.textPrimary }}>
          Download a model to chat
        </Text>
        <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>
          Run AI privately on this device — no account needed.
        </Text>
      </View>
    </Pressable>
  );
}
