import { View, useWindowDimensions, Alert, Modal, Platform } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { readConnectorConnectRequest, type ConnectorConnectRequest } from '@agiworkforce/types';
import { ConnectorConnectCard } from './ConnectorConnectCard';
import { useRouter } from 'expo-router';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import {
  Check,
  Clock,
  FileText,
  Download,
  AlertCircle,
  RefreshCw,
  Copy,
  TriangleAlert,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  Share2,
  Square,
  ShieldAlert,
  Quote,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { TapGestureHandler, State } from 'react-native-gesture-handler';
import type { TapGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { StreamingIndicator } from './StreamingIndicator';
import { ThinkingChip } from './ThinkingChip';
import { InlineArtifactCard } from './InlineArtifactCard';
import * as voiceOutput from '@/src/features/voice/services/voiceOutput';
import { useArtifactStore } from '@/src/features/artifacts/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  useChatToolAllowanceStore,
  useToolsAllowedForChat,
} from '@/src/features/chat/store/chatToolAllowanceStore';
import { ArtifactFullScreen } from './ArtifactFullScreen';
import { ToolCallDetailsSheet, ToolCallTimeline } from './ToolCallTimeline';
import { InteractiveCardBlock } from './InteractiveCardBlock';
import { API_URL } from '@/lib/constants';
import { AgentActivityTimeline } from './AgentActivityTimeline';
import {
  explainAutoRouteReason,
  getToolDisplayLabel,
  isTerminalToolStatus,
  summarizeToolTimeline,
} from '@agiworkforce/types';
import { ApprovalCard } from './ApprovalCard';
import { StatusStep as StatusStepComponent } from './StatusStep';
import { GeneratedImage } from './GeneratedImage';
import { ImageGenProgress } from './ImageGenProgress';
import { GeneratedVideo } from './GeneratedVideo';
import { VideoGenProgress } from './VideoGenProgress';
import { ImageFullScreen } from './ImageFullScreen';
import { FileExportButton } from './FileExportButton';
import { CitationChip } from './CitationChip';
import { StreamingArtifactCard } from './StreamingArtifactCard';
import { CollapsibleSources } from './CollapsibleSources';
import { ResearchRunCard, type ResearchPlanDecision } from './research/ResearchRunCard';
import { AgiWorkPlanReview } from './AgiWorkPlanReview';
import {
  readAgiWorkPlanReview,
  readAgiWorkPlanSteps,
  type AgiWorkPlanDecision,
} from '@/src/features/chat/utils/agiWorkPlan';
import { ResearchSourcesAppendix } from './research/ResearchSourcesAppendix';
import { ResearchReportSections } from './research/ResearchReportSections';
import { readResearchRunState } from '@/src/features/chat/utils/researchRunState';
import { MessageEditModal } from './MessageEditModal';
import { SelectTextSheet } from './SelectTextSheet';
import { renderMarkdownContent } from './MessageContentRenderer';
import { parseAssistantThinking } from '@/stores/chat/chatExecutionStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { ProvenanceFooter } from './ProvenanceFooter';
import { PerformanceChip } from './PerformanceChip';
import { ReportFlagButton } from './ReportFlagButton';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { storage } from '@/lib/mmkv';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors, radii } from '@/src/ui/theme';
import { motion, typeScale } from '@/src/ui/theme/tokens';
import { getDisplayName, getModelById, isAutoMode } from '@/src/features/model-picker/service';
import {
  hasMessageStreamError,
  getMessageStreamErrorCode,
  streamFailureNoticeText,
} from '@/src/features/chat/utils/messageStreamError';
import { offersModelSwitch } from '@/services/apiErrors';
import { isApprovalTurnLive, useChatExecutionStore } from '@/stores/chat/chatExecutionStore';
import type { ChatMessage, Artifact, ToolCall, ToolSearchResult } from '@/types/chat';
import { useConversationArtifacts } from '@/src/features/chat/hooks/useConversationArtifacts';
import { readAgentActivityState } from '@/src/features/chat/utils/agentActivityState';
import {
  ManagedCloudAgentRunReferenceSchema,
  describeAttachmentTruncation,
  readPersistedInteractiveCards,
  type VariantInfo,
} from '@agiworkforce/cloud-contracts';
import type { InteractiveCardResponsePayload } from '@agiworkforce/types';
import type { ManagedCloudAgentRunInputAnswer } from '@agiworkforce/cloud-contracts';
import { CloudRunInputForm } from '@/src/features/tasks/components/CloudRunInputForm';
import {
  generatedFileArtifactsFromMetadata,
  mergeDerivedAndGeneratedFileArtifacts,
} from '@/src/features/chat/utils/generatedFileArtifacts';
import type { ImageAreaEdit } from '@/src/features/image/components/ImageAreaEditor';

type ReactionType = 'thumbsUp' | 'thumbsDown' | null;

interface MessageAction {
  key: string;
  label: string;
  destructive?: boolean;
  run: () => void;
}

function MessageActionSheet({
  visible,
  actions,
  onSelect,
  onClose,
  onDismissed,
}: {
  visible: boolean;
  actions: MessageAction[];
  onSelect: (action: MessageAction) => void;
  onClose: () => void;
  onDismissed: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismissed}
      accessibilityViewIsModal
    >
      <PressableBox
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}
        onPress={onClose}
        accessibilityLabel="Dismiss message actions"
        accessibilityRole="button"
        accessible={false}
      >
        <SafeAreaView edges={['bottom']} style={{ width: '100%' }}>
          <PressableBox
            style={{
              backgroundColor: colors.surfaceElevated,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingBottom: 8,
            }}
            onPress={() => undefined}
            accessible={false}
          >
            {actions.map((action, index) => (
              <PressableBox
                key={action.key}
                testID={`message-action-${action.key}`}
                onPress={() => onSelect(action)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={{
                  minHeight: 52,
                  justifyContent: 'center',
                  paddingHorizontal: 20,
                  borderBottomWidth: index < actions.length - 1 ? 1 : 0,
                  borderBottomColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: typeScale.callout,
                    color: action.destructive ? colors.agentError : colors.textPrimary,
                  }}
                >
                  {action.label}
                </Text>
              </PressableBox>
            ))}
            <PressableBox
              testID="message-action-cancel"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={{
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: 20,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: typeScale.callout,
                  fontWeight: '600',
                  color: colors.textSecondary,
                }}
              >
                Cancel
              </Text>
            </PressableBox>
          </PressableBox>
        </SafeAreaView>
      </PressableBox>
    </Modal>
  );
}

function TurnNotice({
  icon: Icon,
  message,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
  secondaryLabel,
  secondaryAccessibilityLabel,
  onSecondary,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  message: string;
  actionLabel?: string;
  actionAccessibilityLabel: string;
  onAction?: () => void;
  secondaryLabel?: string;
  secondaryAccessibilityLabel?: string;
  onSecondary?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        paddingLeft: 10,
        borderRadius: radii.md,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.neutralSurface,
      }}
    >
      <Icon size={14} color={colors.textSecondary} />
      <Text
        style={{
          flex: 1,
          fontSize: typeScale.footnote,
          lineHeight: 18,
          color: colors.textSecondary,
          paddingVertical: 8,
        }}
        accessibilityLiveRegion="polite"
      >
        {message}
      </Text>
      {actionLabel && onAction ? (
        <PressableBox
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionAccessibilityLabel}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
        >
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.textPrimary }}
          >
            {actionLabel}
          </Text>
        </PressableBox>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <PressableBox
          onPress={onSecondary}
          accessibilityRole="button"
          accessibilityLabel={secondaryAccessibilityLabel ?? secondaryLabel}
          style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
        >
          <Text
            style={{ fontSize: typeScale.footnote, fontWeight: '600', color: colors.textPrimary }}
          >
            {secondaryLabel}
          </Text>
        </PressableBox>
      ) : null}
    </View>
  );
}

const PERF_CHIP_SHOW_KEY = 'perf-show-chip-v1';
const NEW_MESSAGE_ENTRY_WINDOW_MS = 5_000;
const REFUSAL_FINISH_REASONS = new Set(['refusal', 'content_filter']);

function splitQuotedReply(content: string): { quote: string; body: string } | null {
  if (!content.startsWith('> ')) return null;
  const end = content.indexOf('\n\n');
  if (end < 0) return null;
  const quote = content.slice(2, end).trim();
  const body = content.slice(end + 2);
  return quote && body.trim() ? { quote, body } : null;
}

function sentSkillName(metadata: ChatMessage['metadata']): string | null {
  const replay = metadata?.sendReplay;
  if (!replay || typeof replay !== 'object') return null;
  const name = (replay as { skillName?: unknown }).skillName;
  return typeof name === 'string' && name ? name : null;
}

function VariantPager({
  variant,
  noun,
  onSelect,
}: {
  variant: VariantInfo;
  noun: 'response' | 'version';
  onSelect: (messageId: string) => void;
}) {
  const colors = useThemeColors();
  const previousId = variant.previousId;
  const nextId = variant.nextId;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center' }}
      accessibilityLabel={`${noun === 'response' ? 'Response' : 'Version'} ${variant.index + 1} of ${variant.total}`}
    >
      <PressableBox
        onPress={previousId ? () => onSelect(previousId) : undefined}
        disabled={!previousId}
        accessibilityRole="button"
        accessibilityLabel={`Previous ${noun}`}
        style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronLeft size={16} color={previousId ? colors.textSecondary : colors.textMuted} />
      </PressableBox>
      <Text style={{ fontSize: typeScale.caption, color: colors.textSecondary }}>
        {variant.index + 1} / {variant.total}
      </Text>
      <PressableBox
        onPress={nextId ? () => onSelect(nextId) : undefined}
        disabled={!nextId}
        accessibilityRole="button"
        accessibilityLabel={`Next ${noun}`}
        style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronRight size={16} color={nextId ? colors.textSecondary : colors.textMuted} />
      </PressableBox>
    </View>
  );
}

const USAGE_NUMBER = new Intl.NumberFormat();

function answerUsageLine(metadata: ChatMessage['metadata']): string | null {
  const read = (key: string) => {
    const value = metadata?.[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const input = read('inputTokens');
  const output = read('outputTokens');
  const tokens =
    read('tokensUsed') ??
    (input !== undefined && output !== undefined ? input + output : undefined);
  const durationMs = read('totalDurationMs');
  const parts = [
    tokens !== undefined ? `${USAGE_NUMBER.format(tokens)} tokens` : null,
    durationMs !== undefined ? `${(durationMs / 1000).toFixed(1)}s` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function SentContextChip({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
}) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        maxWidth: '85%',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radii.full,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 4,
      }}
    >
      <Icon size={12} color={colors.textMuted} />
      <Text
        numberOfLines={2}
        style={{ flexShrink: 1, fontSize: typeScale.caption, color: colors.textSecondary }}
      >
        {label}
      </Text>
    </View>
  );
}

function modelSupportsThinking(modelId?: string): boolean {
  if (!modelId || isAutoMode(modelId)) return true;
  const def = getModelById(modelId);
  return def?.supportsThinking !== false;
}

function getProvenance(model?: string): { provider?: string; model?: string } | null {
  if (!model) return null;
  if (isAutoMode(model)) {
    return { provider: 'Local Mode', model: 'Auto' };
  }

  const def = getModelById(model);
  if (!def) return null;

  if (def.surface === 'local') {
    return { provider: 'Local Mode', model: def.name };
  }

  return { provider: 'AGI Cloud' };
}

function autoRouteReceipt(metadata: ChatMessage['metadata']): string | null {
  const requestedModel = metadata?.requestedModel;
  const resolvedModel = metadata?.resolvedModel;
  if (typeof requestedModel !== 'string' || typeof resolvedModel !== 'string') return null;
  if (resolvedModel === requestedModel || isAutoMode(resolvedModel)) return null;
  const routingReason = metadata?.routingReason;
  const explanation = explainAutoRouteReason(
    typeof routingReason === 'string' ? routingReason : null,
  );
  if (!isAutoMode(requestedModel) && !explanation) return null;
  const choice = `Auto chose ${getDisplayName(resolvedModel)}`;
  return explanation ? `${choice}: ${explanation}` : choice;
}

interface MessageBubbleProps {
  message: ChatMessage;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string, reason?: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onRetryWithModel?: (messageId: string) => void;
  onEditImageArea?: (message: ChatMessage, edit: ImageAreaEdit) => void;
  onDeleteImageConversation?: () => void;
  variant?: VariantInfo;
  onSelectVariant?: (messageId: string) => void;
  onSwitchModel?: () => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onReaction?: (messageId: string, reaction: ReactionType) => void;
  onResolveToolApproval?: (
    messageId: string,
    toolCallId: string,
    decision: 'approved' | 'rejected',
    guidance?: string,
  ) => void;
  onResearchPlanDecision?: (messageId: string, decision: ResearchPlanDecision) => void;
  onRetryResearch?: (messageId: string) => void;
  onStopResearch?: () => void;
  onPauseResearch?: (messageId: string) => Promise<boolean>;
  isResumingResearch?: boolean;
  onQuoteSelection?: (message: ChatMessage, text: string) => void;
}

function MessageActionButton({
  label,
  icon: Icon,
  onPress,
  color,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  color: string;
}) {
  return (
    <PressableBox
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={{ padding: 6, borderRadius: 8 }}
    >
      <Icon size={16} color={color} />
    </PressableBox>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  onApprove,
  onReject,
  onDeleteMessage,
  onRetryMessage,
  onEditImageArea,
  onDeleteImageConversation,
  onRetryWithModel,
  variant,
  onSelectVariant,
  onSwitchModel,
  onEditMessage,
  onReaction,
  onResolveToolApproval,
  onResearchPlanDecision,
  onRetryResearch,
  onStopResearch,
  onPauseResearch,
  isResumingResearch = false,
  onQuoteSelection,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const research = isAssistant ? readResearchRunState(message.metadata?.research) : undefined;
  const router = useRouter();
  const [arrivedNow] = useState(
    () =>
      Boolean(message.isStreaming) ||
      Date.now() - Date.parse(message.createdAt) < NEW_MESSAGE_ENTRY_WINDOW_MS,
  );
  const connectRequests = useMemo(() => {
    const seen = new Set<string>();
    const requests: ConnectorConnectRequest[] = [];
    for (const call of message.toolCalls ?? []) {
      if (call.status !== 'failed') continue;
      const request = readConnectorConnectRequest({
        qualifiedToolName: call.name,
        result: call.output,
        isError: true,
      });
      if (request && !seen.has(request.connectorId)) {
        seen.add(request.connectorId);
        requests.push(request);
      }
    }
    return requests;
  }, [message.toolCalls]);
  const researchSources = useMemo<ToolSearchResult[]>(() => {
    if (!research) return [];
    const seen = new Set<string>();
    const sources: ToolSearchResult[] = [];
    for (const source of [
      ...(message.citations ?? []).map((citation) => ({
        url: citation.url,
        title: citation.title ?? citation.url,
        ...(citation.snippet ? { snippet: citation.snippet } : {}),
      })),
      ...(research.sourcesForRetry ?? []),
    ]) {
      if (!source.url || seen.has(source.url)) continue;
      seen.add(source.url);
      sources.push(source);
    }
    return sources;
  }, [message.citations, research]);
  const canonicalActivity = isAssistant
    ? readAgentActivityState(message.metadata?.agentActivity)
    : undefined;
  const attachmentTruncationNotice = isUser
    ? describeAttachmentTruncation(
        Array.isArray(message.metadata?.truncatedAttachments)
          ? (message.metadata.truncatedAttachments as string[])
          : undefined,
      )
    : null;
  const steerRunId = useMemo(() => {
    const reference = ManagedCloudAgentRunReferenceSchema.safeParse(
      message.metadata?.cloudAgentRun,
    );
    return reference.success ? reference.data.runId : undefined;
  }, [message.metadata?.cloudAgentRun]);
  const assistantProvenance = isAssistant ? getProvenance(message.model) : null;
  const provenance = isAssistant && !message.isStreaming ? assistantProvenance : null;
  const routeReceipt =
    isAssistant && !message.isStreaming ? autoRouteReceipt(message.metadata) : null;
  const roleLabel = isUser ? 'You' : (assistantProvenance?.model ?? 'AGI');
  const parsedThinking = useMemo(
    () => (isAssistant ? parseAssistantThinking(message.content) : null),
    [isAssistant, message.content],
  );
  const displayContent = parsedThinking?.hasReasoning ? parsedThinking.content : message.content;
  const reasoningText =
    message.reasoning ?? (parsedThinking?.hasReasoning ? parsedThinking.reasoning : undefined);
  const hasReasoning =
    isAssistant &&
    reasoningText !== undefined &&
    (parsedThinking?.hasReasoning === true || modelSupportsThinking(message.model));
  const [expandedArtifact, setExpandedArtifact] = useRecyclingState<Artifact | null>(null, [
    message.id,
  ]);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useRecyclingState<string | null>(null, [
    message.id,
  ]);
  const [showExportSheet, setShowExportSheet] = useRecyclingState(false, [message.id]);
  const [accessibilityTool, setAccessibilityTool] = useRecyclingState<ToolCall | null>(null, [
    message.id,
  ]);
  const [editModalVisible, setEditModalVisible] = useRecyclingState(false, [message.id]);
  const [selectTextVisible, setSelectTextVisible] = useRecyclingState(false, [message.id]);
  const [editText, setEditText] = useRecyclingState('', [message.id]);
  const [reaction, setReaction] = useRecyclingState<ReactionType>(
    (message.metadata?.reaction as ReactionType) ?? null,
    [message.id],
  );
  useEffect(() => {
    setReaction((message.metadata?.reaction as ReactionType) ?? null);
  }, [message.metadata?.reaction, setReaction]);
  const { width } = useWindowDimensions();
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const reducedMotion = useReducedMotion();
  const themeColors = useThemeColors();
  const { status: copyStatus, copy } = useCopyAction();

  const appMode = useChatAppModeStore((s) => s.appMode);
  const handleStopImageGeneration = useCallback(() => {
    useChatMessageStore.getState().stopImageGeneration(message.conversationId, message.id);
  }, [message.conversationId, message.id]);

  const handleRetryGeneration = useCallback(() => {
    onRetryMessage?.(message.id);
  }, [onRetryMessage, message.id]);

  const handleStopVideoGeneration = useCallback(() => {
    void useChatMessageStore.getState().stopVideoGeneration(message.conversationId, message.id);
  }, [message.conversationId, message.id]);
  const storedArtifacts = useArtifactStore((s) => s.artifacts);
  const conversationArtifacts = useConversationArtifacts(message.conversationId, appMode);
  const inlineArtifacts = useMemo<Artifact[]>(() => {
    const scopedStoreArtifacts: Artifact[] = storedArtifacts
      .filter(
        (artifact) =>
          artifact.messageId === message.id && (artifact.provenance?.scope ?? 'local') === appMode,
      )
      .map((artifact) => ({
        id: artifact.id,
        type: artifact.kind,
        title: artifact.title,
        content: artifact.content,
        ...(artifact.language ? { language: artifact.language } : {}),
      }));

    const persistedFiles =
      appMode === 'cloud'
        ? generatedFileArtifactsFromMetadata(message.metadata?.generatedFiles, message.createdAt)
        : [];
    const byId = new Map<string, Artifact>();
    for (const artifact of [
      ...scopedStoreArtifacts,
      ...persistedFiles,
      ...(message.artifacts ?? []),
    ]) {
      byId.set(artifact.id, artifact);
    }
    const unique = [...byId.values()];
    return mergeDerivedAndGeneratedFileArtifacts(
      unique.filter((artifact) => !artifact.generatedFile),
      unique.filter((artifact) => artifact.generatedFile),
    );
  }, [
    appMode,
    storedArtifacts,
    message.id,
    message.createdAt,
    message.metadata,
    message.artifacts,
  ]);

  const interactiveCards = useMemo(
    () =>
      appMode === 'cloud'
        ? (message.interactiveCards ?? readPersistedInteractiveCards(message.metadata))
        : [],
    [appMode, message.interactiveCards, message.metadata],
  );

  const conversationStreaming = useChatExecutionStore((s) =>
    s.streamingConversationIds.includes(message.conversationId),
  );

  const handleRespondToCard = useCallback(
    (cardId: string, payload: InteractiveCardResponsePayload) =>
      useChatExecutionStore
        .getState()
        .respondToInteractiveCard(message.conversationId, message.id, cardId, payload),
    [message.conversationId, message.id],
  );

  const handleAnswerToolInput = useCallback(
    (answers: ManagedCloudAgentRunInputAnswer[]) =>
      void useChatExecutionStore
        .getState()
        .answerToolInput(message.conversationId, message.id, answers),
    [message.conversationId, message.id],
  );

  const agiWorkPlan = useMemo(
    () => (isAssistant ? readAgiWorkPlanSteps(message.metadata?.agiWorkPlan) : null),
    [isAssistant, message.metadata?.agiWorkPlan],
  );
  const agiWorkPlanReview = useMemo(
    () => (isAssistant ? readAgiWorkPlanReview(message.metadata?.agiWorkPlanReview) : null),
    [isAssistant, message.metadata?.agiWorkPlanReview],
  );
  const [agiWorkPlanBusy, setAgiWorkPlanBusy] = useRecyclingState(false, [message.id]);

  const handleAgiWorkPlanDecision = useCallback(
    (decision: AgiWorkPlanDecision) => {
      if (decision.kind !== 'cancel') setAgiWorkPlanBusy(true);
      void useChatExecutionStore
        .getState()
        .resolveAgiWorkPlan(message.conversationId, message.id, decision)
        .finally(() => setAgiWorkPlanBusy(false));
    },
    [message.conversationId, message.id, setAgiWorkPlanBusy],
  );

  const handleExpandArtifact = useCallback(
    (artifact: Artifact) => {
      setExpandedArtifact(artifact);
    },
    [setExpandedArtifact],
  );

  const handleCloseArtifact = useCallback(() => {
    setExpandedArtifact(null);
  }, [setExpandedArtifact]);

  const handleApprove = useCallback((id: string) => onApprove?.(id), [onApprove]);

  const handleReject = useCallback(
    (id: string, reason?: string) => onReject?.(id, reason),
    [onReject],
  );

  const handleResolveToolApproval = useCallback(
    (toolCallId: string, decision: 'approved' | 'rejected', guidance?: string) =>
      onResolveToolApproval?.(message.id, toolCallId, decision, guidance),
    [onResolveToolApproval, message.id],
  );

  const approvalTurnExpired = Boolean(onResolveToolApproval) && !isApprovalTurnLive(message.id);

  const toolsAllowedForChat = useToolsAllowedForChat(message.conversationId);
  const allowForChat = useChatToolAllowanceStore((state) => state.allowForChat);

  const handleAllowToolForChat = useCallback(
    (toolCallId: string, toolName: string, guidance?: string) => {
      allowForChat(message.conversationId, toolName);
      onResolveToolApproval?.(message.id, toolCallId, 'approved', guidance);
    },
    [allowForChat, message.conversationId, message.id, onResolveToolApproval],
  );

  const approvedForChatRef = useRef(new Set<string>());
  useEffect(() => {
    if (
      !onResolveToolApproval ||
      message.isStreaming ||
      approvalTurnExpired ||
      toolsAllowedForChat.length === 0
    ) {
      return;
    }
    const highRiskToolCallIds = new Set(
      (canonicalActivity?.entries ?? []).flatMap((entry) =>
        entry.kind === 'tool' && entry.approval?.riskLevel === 'high' ? [entry.toolCallId] : [],
      ),
    );
    for (const tool of message.toolCalls ?? []) {
      if (
        !tool.requiresApproval ||
        !tool.toolCallId ||
        tool.approvalDecision ||
        tool.approvalRiskLevel === 'high' ||
        highRiskToolCallIds.has(tool.toolCallId) ||
        isTerminalToolStatus(tool.status) ||
        !toolsAllowedForChat.includes(tool.name) ||
        approvedForChatRef.current.has(tool.toolCallId)
      ) {
        continue;
      }
      approvedForChatRef.current.add(tool.toolCallId);
      onResolveToolApproval(message.id, tool.toolCallId, 'approved');
    }
  }, [
    approvalTurnExpired,
    canonicalActivity,
    message.id,
    message.isStreaming,
    message.toolCalls,
    onResolveToolApproval,
    toolsAllowedForChat,
  ]);

  const handleImagePress = useCallback(
    (url: string) => {
      setFullScreenImageUrl(url);
    },
    [setFullScreenImageUrl],
  );

  const handleCloseFullScreenImage = useCallback(() => {
    setFullScreenImageUrl(null);
  }, [setFullScreenImageUrl]);

  const [actionsVisible, setActionsVisible] = useRecyclingState(false, [message.id]);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const [isSpeaking, setIsSpeaking] = useRecyclingState(false, [message.id]);

  const handleToggleReadAloud = useCallback(() => {
    if (isSpeaking) {
      void voiceOutput.stop();
      setIsSpeaking(false);
      return;
    }
    void voiceOutput.stop();
    setIsSpeaking(true);
    void voiceOutput
      .speak(message.content, {
        ...voiceOutput.speechOptionsFromSettings(),
        serverVoice: appMode === 'cloud',
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
      })
      .catch(() => setIsSpeaking(false));
  }, [appMode, isSpeaking, message.content, setIsSpeaking]);

  useEffect(() => {
    return () => {
      if (isSpeaking) void voiceOutput.stop();
    };
  }, [isSpeaking]);

  const handleShowExport = useCallback(() => {
    setShowExportSheet(true);
  }, [setShowExportSheet]);

  const handleCloseExport = useCallback(() => {
    setShowExportSheet(false);
  }, [setShowExportSheet]);

  const handleDoubleTap = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state === State.ACTIVE && isAssistant) {
        if (hapticsEnabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        const next: ReactionType =
          reaction === null ? 'thumbsUp' : reaction === 'thumbsUp' ? 'thumbsDown' : null;
        setReaction(next);
        onReaction?.(message.id, next);
      }
    },
    [isAssistant, hapticsEnabled, message.id, onReaction, reaction, setReaction],
  );

  const applyReaction = useCallback(
    (target: Exclude<ReactionType, null>) => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const next: ReactionType = reaction === target ? null : target;
      setReaction(next);
      onReaction?.(message.id, next);
    },
    [hapticsEnabled, message.id, onReaction, reaction, setReaction],
  );

  const handleOpenEditModal = useCallback(() => {
    setEditText(message.content);
    setEditModalVisible(true);
  }, [message.content, setEditModalVisible, setEditText]);

  const handleSubmitEdit = useCallback(() => {
    const trimmed = editText.trim();
    if (trimmed && onEditMessage) {
      onEditMessage(message.id, trimmed);
    }
    setEditModalVisible(false);
  }, [editText, message.id, onEditMessage, setEditModalVisible]);

  const confirmDeleteMessage = useCallback(() => {
    if (!onDeleteMessage) return;
    Alert.alert(
      'Delete message?',
      'This message is removed from this conversation. It cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDeleteMessage(message.id),
        },
      ],
    );
  }, [onDeleteMessage, message.id]);

  const messageActions = useMemo<MessageAction[]>(() => {
    const actions: MessageAction[] = [];
    if (isUser && onEditMessage) {
      actions.push({ key: 'edit', label: 'Edit Message', run: handleOpenEditModal });
    }
    if (isUser && onRetryMessage) {
      actions.push({ key: 'resend', label: 'Resend', run: () => onRetryMessage(message.id) });
    }
    if (!isUser && onRetryMessage) {
      actions.push({ key: 'retry', label: 'Retry', run: () => onRetryMessage(message.id) });
    }
    if (isAssistant && onRetryWithModel) {
      actions.push({
        key: 'retry-model',
        label: 'Retry with Another Model',
        run: () => onRetryWithModel(message.id),
      });
    }
    actions.push({
      key: 'copy',
      label: 'Copy Message',
      run: () => void copy(message.content),
    });
    if (displayContent.trim()) {
      actions.push({
        key: 'select-text',
        label: 'Select Text',
        run: () => setSelectTextVisible(true),
      });
    }
    if (isAssistant && message.content.trim()) {
      actions.push({ key: 'export', label: 'Export Message\u2026', run: handleShowExport });
    }
    if (onDeleteMessage) {
      actions.push({
        key: 'delete',
        label: 'Delete Message',
        destructive: true,
        run: confirmDeleteMessage,
      });
    }
    return actions;
  }, [
    isUser,
    isAssistant,
    message.id,
    message.content,
    displayContent,
    copy,
    onEditMessage,
    onRetryMessage,
    onRetryWithModel,
    onDeleteMessage,
    handleOpenEditModal,
    handleShowExport,
    confirmDeleteMessage,
    setSelectTextVisible,
  ]);

  const handleLongPress = useCallback(() => {
    if (messageActions.length === 0) return;
    setActionsVisible(true);
  }, [messageActions.length, setActionsVisible]);

  const handleCloseActions = useCallback(() => {
    setActionsVisible(false);
  }, [setActionsVisible]);

  const handleSelectAction = useCallback(
    (action: MessageAction) => {
      setActionsVisible(false);
      if (Platform.OS === 'ios') {
        pendingActionRef.current = action.run;
        return;
      }
      setTimeout(action.run, 0);
    },
    [setActionsVisible],
  );

  const handleActionsDismissed = useCallback(() => {
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    pending?.();
  }, []);

  const accessibilityActionsList = useMemo<AccessibilityActionInfo[]>(() => {
    const actions: AccessibilityActionInfo[] = [];
    if (isUser && onEditMessage) actions.push({ name: 'edit', label: 'Edit message' });
    if (isUser && onRetryMessage) actions.push({ name: 'resend', label: 'Resend message' });
    if (isAssistant && onRetryMessage) actions.push({ name: 'retry', label: 'Retry' });
    if (isAssistant && onRetryWithModel) {
      actions.push({ name: 'retry-model', label: 'Retry with another model' });
    }
    actions.push({ name: 'copy', label: 'Copy message' });
    if (displayContent.trim()) actions.push({ name: 'select-text', label: 'Select text' });
    if (isAssistant && message.content.trim()) {
      actions.push({ name: 'export', label: 'Export message' });
    }
    if (onDeleteMessage) actions.push({ name: 'delete', label: 'Delete message' });
    if (isAssistant && !canonicalActivity && message.toolCalls) {
      for (const tool of message.toolCalls) {
        actions.push({
          name: `tool-${tool.id}`,
          label: `View details: ${getToolDisplayLabel(tool.name).displayName}`,
        });
      }
    }
    return actions;
  }, [
    isUser,
    isAssistant,
    onEditMessage,
    onRetryMessage,
    onRetryWithModel,
    onDeleteMessage,
    message.content,
    message.toolCalls,
    canonicalActivity,
    displayContent,
  ]);

  const handleAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      const actionName = event.nativeEvent.actionName;
      if (actionName.startsWith('tool-')) {
        const toolId = actionName.slice('tool-'.length);
        const tool = message.toolCalls?.find((t) => t.id === toolId);
        if (tool) {
          setAccessibilityTool(tool);
        }
        return;
      }
      switch (actionName) {
        case 'copy':
          void copy(message.content);
          break;
        case 'retry':
        case 'resend':
          onRetryMessage?.(message.id);
          break;
        case 'select-text':
          setSelectTextVisible(true);
          break;
        case 'retry-model':
          onRetryWithModel?.(message.id);
          break;
        case 'edit':
          handleOpenEditModal();
          break;
        case 'delete':
          confirmDeleteMessage();
          break;
        case 'export':
          handleShowExport();
          break;
        default:
          break;
      }
    },
    [
      message.id,
      message.content,
      message.toolCalls,
      copy,
      setAccessibilityTool,
      onRetryMessage,
      onRetryWithModel,
      confirmDeleteMessage,
      handleOpenEditModal,
      handleShowExport,
      setSelectTextVisible,
    ],
  );

  const isStreamingRow = message.isStreaming === true;
  const reconnecting = useChatExecutionStore((state) =>
    state.reconnectingMessageIds.includes(message.id),
  );
  const stopping = useChatExecutionStore((state) => state.stoppingMessageIds.includes(message.id));
  const streamingLabel = stopping ? 'Stopping…' : reconnecting ? 'Reconnecting…' : undefined;
  const finishReason = isAssistant ? message.metadata?.finishReason : undefined;
  const stoppedByUser = !isStreamingRow && finishReason === 'stopped';
  const usageLine = isAssistant && !isStreamingRow ? answerUsageLine(message.metadata) : null;
  const refusedAnswer =
    !isStreamingRow && typeof finishReason === 'string' && REFUSAL_FINISH_REASONS.has(finishReason);
  const quotedReply = isUser ? splitQuotedReply(displayContent) : null;
  const skillUsed = isUser ? sentSkillName(message.metadata) : null;
  const bodyContent = quotedReply ? quotedReply.body : displayContent;
  const inlineCitations = research ? researchSources : message.citations;
  const contentElements = useMemo(
    () =>
      renderMarkdownContent(bodyContent, themeColors, {
        highlightCode: !isStreamingRow,
        ...(inlineCitations ? { citations: inlineCitations } : {}),
      }),
    [bodyContent, themeColors, isStreamingRow, inlineCitations],
  );

  const imageWidth = Math.min(width - 80, 320);

  const messageContent = (
    <Animated.View
      testID={isAssistant && message.isStreaming ? 'chat.message.assistant.streaming' : undefined}
      entering={
        reducedMotion || !arrivedNow ? undefined : FadeInDown.duration(motion.quick).springify()
      }
      className="px-4 py-4"
    >
      <PressableBox
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessible={!canonicalActivity}
        accessibilityLabel={`${isUser ? 'Your' : roleLabel} message: ${message.content?.slice(0, 100) || 'empty'}`}
        accessibilityHint="Double tap and hold for message actions"
        accessibilityRole="text"
        accessibilityActions={accessibilityActionsList}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
          {/* Offline queued badge (user messages only) */}
          {isUser && message.isQueued && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                backgroundColor: themeColors.warningSurface,
                paddingHorizontal: 5,
                paddingVertical: 2,
                borderRadius: 4,
                marginBottom: 4,
              }}
              accessibilityLabel="Message queued offline"
            >
              <Clock size={10} color={themeColors.agentWarning} />
              <Text style={{ fontSize: typeScale.caption, color: themeColors.agentWarning }}>
                queued
              </Text>
            </View>
          )}

          {quotedReply ? <SentContextChip icon={Quote} label={quotedReply.quote} /> : null}
          {skillUsed ? <SentContextChip icon={Sparkles} label={`Skill: ${skillUsed}`} /> : null}

          {/* Content column: user messages render as a right-aligned rounded
              bubble (ChatGPT-style pill); assistant messages render as plain
              text spanning the full width with no bubble background. */}
          <View
            className="gap-1"
            style={
              isUser
                ? {
                    maxWidth: '85%',
                    backgroundColor: themeColors.surfaceHover,
                    borderRadius: radii['2xl'],
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                  }
                : { width: '100%' }
            }
          >
            {/* User attachments: images and files sent with the message */}
            {isUser && message.attachments && message.attachments.length > 0 && (
              <View className="mt-1">
                {/* Image attachments */}
                <View className="flex-row flex-wrap gap-2">
                  {message.attachments
                    .filter((a) => a.mimeType.startsWith('image/'))
                    .map((attachment, idx) => (
                      <PressableBox
                        key={`att-${idx}`}
                        onPress={() => handleImagePress(attachment.url)}
                        className="rounded-lg overflow-hidden"
                        accessibilityLabel={`Attached image: ${attachment.fileName}`}
                        accessibilityRole="image"
                      >
                        <Image
                          source={{ uri: attachment.url }}
                          style={{
                            width: Math.min(imageWidth, 200),
                            height: Math.min(imageWidth, 200),
                            borderRadius: 8,
                          }}
                          contentFit="cover"
                          transition={200}
                        />
                      </PressableBox>
                    ))}
                </View>

                {/* File attachments (non-image) */}
                {message.attachments.filter((a) => !a.mimeType.startsWith('image/')).length > 0 && (
                  <View className="gap-1 mt-2">
                    {message.attachments
                      .filter((a) => !a.mimeType.startsWith('image/'))
                      .map((attachment, idx) => (
                        <View
                          key={`file-att-${idx}`}
                          className="flex-row items-center gap-2 px-3 py-2 rounded-lg"
                          style={{ backgroundColor: themeColors.accentSurface }}
                          accessible={true}
                          accessibilityLabel={`File attachment: ${attachment.fileName}`}
                          accessibilityRole="button"
                        >
                          <FileText size={16} color={themeColors.agentActive} />
                          <Text
                            className="flex-1 text-sm"
                            numberOfLines={1}
                            style={{ color: themeColors.textPrimary }}
                          >
                            {attachment.fileName}
                          </Text>
                        </View>
                      ))}
                  </View>
                )}
              </View>
            )}

            {attachmentTruncationNotice ? (
              <Text
                accessibilityRole="text"
                style={{ marginTop: 4, fontSize: typeScale.caption, color: themeColors.textMuted }}
              >
                {attachmentTruncationNotice}
              </Text>
            ) : null}

            {research ? (
              <ResearchRunCard
                research={research}
                isStreaming={message.isStreaming === true}
                isResuming={isResumingResearch}
                {...(onResearchPlanDecision
                  ? {
                      onPlanDecision: (decision: ResearchPlanDecision) =>
                        onResearchPlanDecision(message.id, decision),
                    }
                  : {})}
                {...(onStopResearch ? { onStop: onStopResearch } : {})}
                {...(onPauseResearch ? { onPause: () => onPauseResearch(message.id) } : {})}
                {...(onRetryResearch ? { onRetry: () => onRetryResearch(message.id) } : {})}
              />
            ) : null}

            {agiWorkPlan && agiWorkPlanReview && appMode === 'cloud' ? (
              <AgiWorkPlanReview
                steps={agiWorkPlan}
                awaitingApproval={agiWorkPlanReview.awaitingApproval}
                runFinished={!message.isStreaming}
                busy={agiWorkPlanBusy || message.isStreaming === true || conversationStreaming}
                onDecision={handleAgiWorkPlanDecision}
              />
            ) : null}

            {/* Inline thinking chip (before main content, assistant only) */}
            {canonicalActivity ? (
              <AgentActivityTimeline
                messageId={message.id}
                activity={canonicalActivity}
                onResolveApproval={handleResolveToolApproval}
                onAllowApprovalForChat={onResolveToolApproval ? handleAllowToolForChat : undefined}
                approvalExpired={approvalTurnExpired}
                onResendApproval={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
                steerRunId={message.isStreaming ? steerRunId : undefined}
                codeRunConversationId={message.conversationId}
              />
            ) : null}

            {hasReasoning ? (
              <ThinkingChip
                thinkingText={reasoningText ?? ''}
                isStreaming={message.isStreaming}
                duration={message.metadata?.thinkingDuration as number | undefined}
                startedAtMs={message.metadata?.thinkingStartedAt as number | undefined}
              />
            ) : null}

            {/* Status steps */}
            {isAssistant && !canonicalActivity && message.steps && message.steps.length > 0 ? (
              <View style={{ gap: 2 }}>
                {message.steps.map((step, index) => (
                  <StatusStepComponent
                    key={step.id}
                    step={step}
                    stepNumber={index + 1}
                    totalSteps={message.steps!.length}
                  />
                ))}
              </View>
            ) : null}

            {/* Tool calls, unified connected timeline (Claude-style inline tool use) */}
            {isAssistant &&
            !canonicalActivity &&
            message.toolCalls &&
            message.toolCalls.length > 0 ? (
              <ToolCallTimeline
                messageId={message.id}
                toolCalls={message.toolCalls}
                summary={summarizeToolTimeline(message.toolCalls)}
                onResolveApproval={handleResolveToolApproval}
                onAllowApprovalForChat={onResolveToolApproval ? handleAllowToolForChat : undefined}
                approvalExpired={approvalTurnExpired}
                onResendApproval={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
              />
            ) : null}
            {connectRequests.map((request) => (
              <ConnectorConnectCard
                key={request.connectorId}
                request={request}
                {...(onRetryMessage ? { onRetryTurn: () => onRetryMessage(message.id) } : {})}
              />
            ))}

            {/* Approval requests */}
            {isAssistant && message.approvalRequests && message.approvalRequests.length > 0 ? (
              <View style={{ gap: 4 }}>
                {message.approvalRequests.map((req) => (
                  <ApprovalCard
                    key={req.id}
                    approval={req}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
              </View>
            ) : null}

            {/* Main text content with inline markdown */}
            {contentElements.length > 0 ? (
              <View>
                {contentElements}
                {message.isStreaming && <StreamingIndicator label={streamingLabel} />}
              </View>
            ) : message.isStreaming && !message.isGeneratingImage && !message.isGeneratingVideo ? (
              <StreamingIndicator
                label={
                  streamingLabel ??
                  (canonicalActivity || hasReasoning || research || message.toolCalls?.length
                    ? undefined
                    : 'Preparing')
                }
              />
            ) : null}

            {/* Image generation progress indicator */}
            {isAssistant && (message.isGeneratingImage || message.imageGenStatus === 'failed') && (
              <ImageGenProgress
                prompt={message.imageGenPrompt ?? message.content ?? 'Generating image…'}
                progress={message.imageGenProgress}
                status={message.imageGenStatus ?? 'generating'}
                estimatedTime={message.imageGenEstimatedTime}
                errorMessage={message.imageGenError}
                onRetry={onRetryMessage ? handleRetryGeneration : undefined}
                onStop={message.isGeneratingImage ? handleStopImageGeneration : undefined}
              />
            )}

            {/* Generated image */}
            {isAssistant && (message.type === 'image' || message.imageUrl) && message.imageUrl && (
              <GeneratedImage
                imageUrl={message.imageUrl}
                revisedPrompt={message.revisedPrompt}
                width={imageWidth}
                allowEphemeral={message.imageGenPersisted === false}
                onPress={() => handleImagePress(message.imageUrl!)}
              />
            )}

            {/* Video generation progress */}
            {isAssistant &&
              (message.isGeneratingVideo ||
                message.videoGenStatus === 'failed' ||
                message.videoGenStatus === 'timeout') && (
                <VideoGenProgress
                  prompt={message.videoGenPrompt ?? message.content ?? 'Generating video…'}
                  progress={message.videoGenProgress}
                  status={message.videoGenStatus ?? 'processing'}
                  errorMessage={message.videoGenError}
                  onStop={message.videoTaskId ? handleStopVideoGeneration : undefined}
                  stopping={message.videoGenCancelRequested === true}
                  stopError={message.videoGenCancelError}
                />
              )}

            {isAssistant &&
            onRetryMessage &&
            !message.isGeneratingVideo &&
            (message.videoGenStatus === 'failed' || message.videoGenStatus === 'timeout') ? (
              <PressableBox
                onPress={handleRetryGeneration}
                accessibilityRole="button"
                accessibilityLabel="Retry video generation"
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 8,
                  minHeight: 32,
                  justifyContent: 'center',
                  paddingHorizontal: 12,
                  borderRadius: radii.full,
                  borderWidth: 1,
                  borderColor: themeColors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: typeScale.caption,
                    fontWeight: '600',
                    color: themeColors.textSecondary,
                  }}
                >
                  Retry
                </Text>
              </PressableBox>
            ) : null}

            {/* Generated video */}
            {isAssistant && (message.type === 'video' || message.videoUrl) && message.videoUrl && (
              <GeneratedVideo
                videoUrl={message.videoUrl}
                thumbnailUrl={message.videoThumbnailUrl}
                width={imageWidth}
                prompt={message.videoGenPrompt}
              />
            )}

            {isAssistant &&
            message.imageGenPersisted === false &&
            typeof message.imageGenError === 'string' ? (
              <PressableBox
                onPress={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
                disabled={!onRetryMessage}
                accessibilityRole={onRetryMessage ? 'button' : 'text'}
                accessibilityLabel={
                  onRetryMessage
                    ? 'Generated image was not saved. Retry image generation.'
                    : 'Generated image was not saved.'
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: themeColors.dangerSurface,
                  borderWidth: 1,
                  borderColor: themeColors.dangerBorder,
                  borderRadius: radii.md,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginTop: 4,
                }}
              >
                <AlertCircle size={13} color={themeColors.agentError} />
                <Text
                  style={{ flex: 1, fontSize: typeScale.caption, color: themeColors.textSecondary }}
                >
                  Image shown for this session only. It was not saved to your library.
                </Text>
                {onRetryMessage ? (
                  <>
                    <RefreshCw size={12} color={themeColors.agentError} />
                    <Text
                      style={{
                        fontSize: typeScale.caption,
                        fontWeight: '600',
                        color: themeColors.agentError,
                      }}
                    >
                      Retry
                    </Text>
                  </>
                ) : null}
              </PressableBox>
            ) : null}

            {/* Interactive cards (map search). Placed AFTER the prose that
                motivated them and before citations, matching where the model
                emitted them and mirroring the web transcript's ordering. */}
            {isAssistant && interactiveCards.length > 0 ? (
              <InteractiveCardBlock
                cards={interactiveCards}
                tileBaseUrl={API_URL}
                canLoadManagedCloudTiles={appMode === 'cloud'}
                canRespond={
                  appMode === 'cloud' && message.isStreaming !== true && !conversationStreaming
                }
                onRespond={handleRespondToCard}
              />
            ) : null}

            {isAssistant &&
            appMode === 'cloud' &&
            message.pendingToolInput &&
            message.isStreaming !== true ? (
              <View
                testID="chat.tool-input-request"
                style={{
                  marginTop: 8,
                  gap: 10,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: themeColors.borderLight,
                  padding: 12,
                }}
              >
                <Text
                  accessibilityRole="header"
                  style={{
                    fontSize: typeScale.subhead,
                    fontWeight: '600',
                    color: themeColors.textPrimary,
                  }}
                >
                  Needs your input
                </Text>
                <CloudRunInputForm
                  key={message.pendingToolInput.requestedAt}
                  pendingInput={message.pendingToolInput}
                  busy={conversationStreaming}
                  onSubmit={handleAnswerToolInput}
                />
              </View>
            ) : null}

            {research?.phase === 'complete' && !message.isStreaming ? (
              <ResearchReportSections content={message.content} />
            ) : null}

            {research && researchSources.length > 0 ? (
              <ResearchSourcesAppendix sources={researchSources} />
            ) : null}

            {/* Citations: chips for 1-3, collapsible card for 4+ */}
            {isAssistant && !research && message.citations && message.citations.length > 0 ? (
              message.citations.length <= 3 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {message.citations.map((cit, i) => (
                    <CitationChip
                      key={`cit-${i}`}
                      index={i + 1}
                      title={cit.title ?? cit.url}
                      url={cit.url}
                      snippet={cit.snippet}
                    />
                  ))}
                </View>
              ) : (
                <CollapsibleSources sources={message.citations} />
              )
            ) : null}

            {/* Inline artifacts */}
            {isAssistant && inlineArtifacts.length > 0 ? (
              <View style={{ gap: 4 }}>
                {inlineArtifacts.map((artifact) => (
                  <InlineArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    onExpand={handleExpandArtifact}
                  />
                ))}
              </View>
            ) : null}
            {isAssistant ? (
              <StreamingArtifactCard
                conversationId={message.conversationId}
                messageId={message.id}
                content={message.content}
                isStreaming={Boolean(message.isStreaming)}
                failed={hasMessageStreamError(message)}
                finalArtifacts={inlineArtifacts}
              />
            ) : null}

            {/* Mid-stream provider failure notice: metadata.streamError (additive
                x_stream_error delta) OR the retroactive metadata.finishReason
                ==='error' case (legacy-web has passed that literal through for
                a while, so historical turns can carry it with no marker at
                all, see hasMessageStreamError's doc comment) is the ONLY
                signal that this turn's answer may be cut off, the server
                still ends the stream cleanly, so without this the partial
                content renders as an ordinary completion with zero
                indication anything went wrong. The partial content itself is
                left exactly as it streamed; this only adds a visible notice
                below it. */}
            {isAssistant && !message.isStreaming && hasMessageStreamError(message) && (
              <PressableBox
                onPress={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
                disabled={!onRetryMessage}
                accessibilityRole={onRetryMessage ? 'button' : 'text'}
                accessibilityLabel={
                  onRetryMessage
                    ? `${streamFailureNoticeText(message)} Tap to try again.`
                    : streamFailureNoticeText(message)
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: themeColors.dangerSurface,
                  borderWidth: 1,
                  borderColor: themeColors.dangerBorder,
                  borderRadius: radii.md,
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  marginTop: 4,
                  alignSelf: 'flex-start',
                }}
              >
                <AlertCircle size={13} color={themeColors.agentError} />
                <Text style={{ fontSize: typeScale.caption, color: themeColors.textSecondary }}>
                  {streamFailureNoticeText(message)}
                </Text>
                {onRetryMessage && (
                  <>
                    <RefreshCw size={12} color={themeColors.agentError} />
                    <Text
                      style={{
                        fontSize: typeScale.caption,
                        fontWeight: '600',
                        color: themeColors.agentError,
                      }}
                    >
                      Retry
                    </Text>
                  </>
                )}
                {onSwitchModel && offersModelSwitch(getMessageStreamErrorCode(message)) && (
                  <PressableBox
                    onPress={onSwitchModel}
                    accessibilityRole="button"
                    accessibilityLabel="Switch model"
                    hitSlop={6}
                    testID="stream-error-switch-model"
                  >
                    <Text
                      style={{
                        fontSize: typeScale.caption,
                        fontWeight: '600',
                        color: themeColors.agentError,
                      }}
                    >
                      Switch model
                    </Text>
                  </PressableBox>
                )}
              </PressableBox>
            )}

            {stoppedByUser ? (
              <TurnNotice
                icon={Square}
                message="Response stopped."
                actionLabel={onRetryMessage ? 'Try again' : undefined}
                actionAccessibilityLabel="Regenerate this response"
                onAction={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
              />
            ) : null}

            {refusedAnswer ? (
              <TurnNotice
                icon={ShieldAlert}
                message="The model declined to finish this response for safety reasons. Rephrase your message, or try a different model."
                actionLabel={onSwitchModel ? 'Switch model' : undefined}
                actionAccessibilityLabel="Switch model"
                onAction={onSwitchModel}
                secondaryLabel="Report"
                secondaryAccessibilityLabel="Report this refusal as incorrect"
                onSecondary={() =>
                  router.push({
                    pathname: '/(app)/feedback',
                    params: {
                      appeal: 'safety_refusal',
                      conversationId: message.conversationId,
                      messageId: message.id,
                      ...(typeof finishReason === 'string' ? { finishReason } : {}),
                    },
                  })
                }
              />
            ) : null}

            {/* Provenance badge: local or cloud provider context */}
            {provenance && (
              <ProvenanceFooter provider={provenance.provider} model={provenance.model} />
            )}

            {usageLine ? (
              <Text
                style={{
                  marginTop: 2,
                  paddingHorizontal: 2,
                  fontSize: typeScale.caption,
                  color: themeColors.textMuted,
                }}
              >
                {usageLine}
              </Text>
            ) : null}

            {routeReceipt ? (
              <Text
                style={{
                  marginTop: 2,
                  paddingHorizontal: 2,
                  fontSize: typeScale.caption,
                  color: themeColors.textMuted,
                }}
              >
                {routeReceipt}
              </Text>
            ) : null}

            {/* Performance chip, on-device inference metadata.
                Regression: this previously also required message.runtimeTier,
                a field chatExecutionStore never sets (only tokensPerSecond is
                populated on local completions), so the chip, and the "Show
                performance chip in chat" settings toggle that promises it.
                was permanently dead. PerformanceChip itself only reads
                tokensPerSecond and no-ops when it's absent, so runtimeTier
                was never actually required. */}
            {isAssistant &&
              !message.isStreaming &&
              message.model &&
              storage.getString(PERF_CHIP_SHOW_KEY) !== 'false' && (
                <PerformanceChip
                  model={message.model}
                  tier={message.runtimeTier}
                  tokensPerSecond={message.tokensPerSecond}
                  firstTokenLatencyMs={message.firstTokenLatencyMs}
                />
              )}

            {/* Report/flag, Google Play GenAI policy: required on every assistant turn */}
            {isAssistant && !message.isStreaming && message.content.trim() && (
              <ReportFlagButton
                messageId={message.id}
                conversationId={(message.metadata?.conversationId as string) ?? message.id}
                contentExcerpt={message.content}
              />
            )}
          </View>
        </View>
      </PressableBox>

      {/* Assistant action row (ChatGPT-style, always visible). These actions were
          previously only reachable via a hidden 400ms long-press sheet (copy/retry/
          export/delete) or an undiscoverable double-tap (reactions); surface the core
          ones inline so a completed answer has visible affordances. Reuses the existing
          copyToClipboard / onRetryMessage / onReaction handlers, the active thumb also
          replaces the old standalone reaction badge. */}
      {isAssistant && !message.isStreaming && message.content.trim() ? (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 10 }}
          accessibilityLabel="Message actions"
        >
          {variant && onSelectVariant ? (
            <VariantPager variant={variant} noun="response" onSelect={onSelectVariant} />
          ) : null}
          <MessageActionButton
            label={copyControlLabel(copyStatus, 'Copy')}
            icon={copyStatus === 'copied' ? Check : copyStatus === 'failed' ? TriangleAlert : Copy}
            onPress={() => void copy(message.content)}
            color={
              copyStatus === 'copied'
                ? themeColors.agentSuccess
                : copyStatus === 'failed'
                  ? themeColors.agentError
                  : themeColors.textMuted
            }
          />
          {/* Read aloud, reuses the on-device TTS service the voice companion
              already uses. Toggles, so a long answer can be stopped without
              waiting it out. */}
          <MessageActionButton
            label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
            icon={isSpeaking ? Square : Volume2}
            onPress={handleToggleReadAloud}
            color={isSpeaking ? themeColors.teal : themeColors.textMuted}
          />
          {/* Share/export, the same sheet the long-press menu opens, surfaced
              inline to match the reference apps. */}
          <MessageActionButton
            label="Share message"
            icon={Share2}
            onPress={handleShowExport}
            color={themeColors.textMuted}
          />
          {onRetryMessage ? (
            <MessageActionButton
              label="Regenerate response"
              icon={RefreshCw}
              onPress={() => onRetryMessage(message.id)}
              color={themeColors.textMuted}
            />
          ) : null}
          {onReaction ? (
            <>
              <MessageActionButton
                label="Good response"
                icon={ThumbsUp}
                onPress={() => applyReaction('thumbsUp')}
                color={reaction === 'thumbsUp' ? themeColors.agentSuccess : themeColors.textMuted}
              />
              <MessageActionButton
                label="Bad response"
                icon={ThumbsDown}
                onPress={() => applyReaction('thumbsDown')}
                color={reaction === 'thumbsDown' ? themeColors.agentError : themeColors.textMuted}
              />
            </>
          ) : null}
        </View>
      ) : null}

      {isUser && variant && onSelectVariant ? (
        <View style={{ alignItems: 'flex-end', paddingRight: 10 }}>
          <VariantPager variant={variant} noun="version" onSelect={onSelectVariant} />
        </View>
      ) : null}

      {/* Artifact full-screen modal */}
      <ArtifactFullScreen
        artifact={expandedArtifact}
        switchable={conversationArtifacts}
        onSwitch={setExpandedArtifact}
        visible={expandedArtifact !== null}
        onClose={handleCloseArtifact}
        onRegenerate={onRetryMessage ? () => onRetryMessage(message.id) : undefined}
        conversationId={message.conversationId}
      />

      {/* Full-screen image viewer */}
      <ImageFullScreen
        imageUrl={fullScreenImageUrl}
        prompt={message.imageGenPrompt ?? message.revisedPrompt}
        model={message.model}
        aspectRatio={message.imageAspectRatio}
        visible={fullScreenImageUrl !== null}
        allowEphemeral={message.imageGenPersisted === false}
        onClose={handleCloseFullScreenImage}
        onEditArea={
          onEditImageArea
            ? (edit) => {
                handleCloseFullScreenImage();
                onEditImageArea(message, edit);
              }
            : undefined
        }
        onDelete={onDeleteImageConversation}
        deleteMessage="Deleting this image deletes the chat it was made in, with all of its messages."
      />

      {/* VoiceOver rotor actions cannot reach the nested timeline controls while
          the message wrapper owns the accessibility focus. Open the same
          structured sheet used by the visible timeline instead of exposing a
          raw provider/tool JSON alert. */}
      <ToolCallDetailsSheet tool={accessibilityTool} onClose={() => setAccessibilityTool(null)} />

      {/* File export bottom sheet (assistant messages only) */}
      {isAssistant && (
        <FileExportButton
          content={message.content}
          title={message.model ? `${getDisplayName(message.model)} response` : undefined}
          visible={showExportSheet}
          onClose={handleCloseExport}
        />
      )}

      <MessageActionSheet
        visible={actionsVisible}
        actions={messageActions}
        onSelect={handleSelectAction}
        onClose={handleCloseActions}
        onDismissed={handleActionsDismissed}
      />

      <SelectTextSheet
        visible={selectTextVisible}
        text={displayContent}
        onClose={() => setSelectTextVisible(false)}
        onQuoteSelection={onQuoteSelection ? (text) => onQuoteSelection(message, text) : undefined}
      />

      {/* Edit message modal */}
      <MessageEditModal
        visible={editModalVisible}
        text={editText}
        attachments={message.attachments}
        onChangeText={setEditText}
        onClose={() => setEditModalVisible(false)}
        onSubmit={handleSubmitEdit}
      />
    </Animated.View>
  );

  if (isAssistant) {
    return (
      <TapGestureHandler
        numberOfTaps={2}
        onHandlerStateChange={handleDoubleTap}
        testID="message-bubble-double-tap"
      >
        <View>{messageContent}</View>
      </TapGestureHandler>
    );
  }

  return messageContent;
});
