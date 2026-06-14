import { clearBiometricFlag } from '@/lib/biometricFlagStore';
import { clearDeviceId } from '@/lib/deviceId';
import {
  buildMarkedTranscript,
  type DsarMessage,
  type DsarSupplementalLocalData,
} from '@/services/dsarExport';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  executionModeForConversation,
  providerForExecutionMode,
  type ConversationExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
import { useMemoryStore } from '@/src/features/memory/store';
import { DEFAULT_LOCAL_MODEL_ID } from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import { useProjectStore } from '@/src/features/projects/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ChatMessage, ConversationSummary } from '@/types/chat';

function valueToIso(value: string | number | undefined, fallback = Date.now()): string {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return new Date(fallback).toISOString();
}

function mapMobileMessage(
  conv: ConversationSummary,
  message: ChatMessage,
  mode: ConversationExecutionMode,
): DsarMessage {
  const model = message.model ?? conv.model ?? null;
  return {
    id: message.id,
    role: message.role,
    content: message.content ?? '',
    mode,
    provider: conv.provider ?? providerForExecutionMode(mode),
    model,
    tokens_in: null,
    tokens_out: null,
    duration_ms: null,
    created_at: valueToIso(message.createdAt, Date.parse(conv.updatedAt) || Date.now()),
  };
}

export function buildLocalDataExportSnapshot(): DsarSupplementalLocalData {
  const chatMessages = useChatMessageStore.getState();
  const projects = useProjectStore.getState().projects;
  const settings = useSettingsStore.getState();
  const chatView = useChatViewStore.getState();
  const model = useModelStore.getState();

  const conversations = chatMessages.conversations.map((conv) => {
    const mode = executionModeForConversation(conv);
    const messages = chatMessages.messages[conv.id] ?? [];
    const dsarMessages = messages.map((message) => mapMobileMessage(conv, message, mode));

    return {
      id: conv.id,
      title: conv.title,
      default_mode: mode,
      default_provider: conv.provider ?? providerForExecutionMode(mode),
      default_model: conv.model ?? null,
      created_at: valueToIso(conv.createdAt),
      updated_at: valueToIso(conv.updatedAt),
      archived_at: null,
      pinned: conv.pinned,
      messages: dsarMessages,
      marked_transcript: buildMarkedTranscript(dsarMessages),
    };
  });

  return {
    conversations,
    local_projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      created_at: valueToIso(project.createdAt),
      updated_at: valueToIso(project.updatedAt),
      sources: (project.sources ?? []).map((source) => ({
        id: source.id,
        name: source.name,
        mime_type: source.mimeType,
        size_bytes: source.size,
        added_at: valueToIso(source.addedAt),
      })),
    })),
    mobile_settings: {
      app_mode: useChatAppModeStore.getState().appMode,
      selected_model: model.selectedModel,
      selected_provider: model.selectedProvider,
      theme_mode: settings.themeMode,
      accent_color: settings.accentColor,
      font_preference: settings.fontPreference,
      haptics_enabled: settings.hapticsEnabled,
      notifications_enabled: settings.notificationsEnabled,
      voice_enabled: settings.voiceEnabled,
      background_fetch_enabled: settings.backgroundFetchEnabled,
      temporary_chat_enabled: settings.isTemporaryChat,
      personalization: {
        full_name: settings.personalization.fullName,
        nickname: settings.personalization.nickname,
        occupation: settings.personalization.occupation,
        instructions: settings.personalization.instructions,
        warmth: settings.personalization.warmth,
        enthusiasm: settings.personalization.enthusiasm,
        headers_lists: settings.personalization.headersLists,
        emoji: settings.personalization.emoji,
      },
      capabilities: { ...settings.capabilities },
      chat_preferences: {
        mode: chatView.chatMode,
        style: chatView.chatStyle,
        tool_access: chatView.toolAccess,
        features: { ...chatView.features },
      },
    },
    local_artifacts: useArtifactStore.getState().artifacts,
  };
}

export async function resetLocalInMemoryState(): Promise<void> {
  await Promise.all([clearBiometricFlag(), clearDeviceId(), useAuthStore.getState().signOut()]);

  useChatMessageStore.setState({
    conversations: [],
    currentConversationId: null,
    messages: {},
    isLoadingConversations: false,
    isLoadingMessages: false,
  });
  useProjectStore.setState({ projects: [], activeProjectId: null });
  useMemoryStore.setState({
    entries: [],
    filteredEntries: [],
    loading: false,
    error: null,
    searchQuery: '',
    syncing: false,
    lastSyncAt: null,
  });
  useArtifactStore.setState({ artifacts: [] });
  useChatAppModeStore.setState({ appMode: 'local' });
  useModelStore.setState({
    selectedModel: DEFAULT_LOCAL_MODEL_ID,
    selectedProvider: 'local',
    favorites: [],
    recentModels: [],
    thinkingModeEnabled: false,
    thinkingEnabledPerModel: {},
  });
  useWaitlistStore.getState().clear();
  useChatViewStore.setState({
    searchQuery: '',
    searchResults: [],
    isSearching: false,
    chatMode: 'chat',
    chatStyle: 'normal',
    toolAccess: 'auto',
    features: { webSearch: true, imageGen: true, health: false },
  });
  useSettingsStore.setState({
    autoApproveMode: 'ask',
    hapticsEnabled: true,
    notificationsEnabled: true,
    voiceEnabled: true,
    backgroundFetchEnabled: true,
    themeMode: 'system',
    accentColor: 'neutral',
    fontPreference: 'default',
    selectedVoiceId: null,
    speechRate: 1,
    speechPitch: 1,
    selectedPresetId: null,
    ttsProvider: 'system',
    speechLanguage: 'en',
    autoListenEnabled: true,
    isTemporaryChat: false,
    personalization: {
      fullName: '',
      nickname: '',
      occupation: '',
      instructions: '',
      warmth: 50,
      enthusiasm: 50,
      headersLists: 50,
      emoji: 50,
    },
    capabilities: {
      webSearch: true,
      imageGen: true,
      memory: true,
      desktopControl: true,
      artifacts: true,
      codeExecution: true,
      voice: true,
      camera: true,
    },
  });
}
