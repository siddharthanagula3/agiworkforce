import { View, useWindowDimensions, Alert, Modal, Platform, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/PressableBox';
import { readConnectorConnectRequest, type ConnectorConnectRequest } from '@agiworkforce/types';
import { ConnectorConnectCard } from './ConnectorConnectCard';
import { useRouter } from 'expo-router';
import type { AccessibilityActionEvent, AccessibilityActionInfo } from 'react-native';
import { SafeAreaInsetsContext, SafeAreaView } from 'react-native-safe-area-context';
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useRecyclingState } from '@shopify/flash-list';
import {
  Check,
  Clock,
  FileSpreadsheet,
  FileText,
  Presentation,
  AlertCircle,
  RefreshCw,
  Copy,
  TriangleAlert,
  Volume2,
  MoreHorizontal,
  Square,
  ShieldAlert,
  Quote,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
} from 'lucide-react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { TapGestureHandler, State } from 'react-native-gesture-handler';
import type { TapGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { AuthorizedImage } from '@/src/features/image/components/AuthorizedImage';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/Text';
import { StreamingIndicator } from './StreamingIndicator';
import { ThinkingChip } from './ThinkingChip';
import { InlineArtifactCard } from './InlineArtifactCard';
import * as voiceOutput from '@/src/features/voice/services/voiceOutput';
import {
  READ_ALOUD_UNAVAILABLE_REASON,
  readAloudOwnerReason,
  useReadAloudUnavailableReason,
} from '@/src/features/voice/services/readAloudAvailability';
import {
  canonicalToMobileArtifact,
  useArtifactStore,
  type CloudLinkedMobileArtifact,
} from '@/src/features/artifacts/store';
import type { MobileArtifactProvenance } from '@/src/features/artifacts/types';
import { captureCloudAccountEpoch } from '@/src/features/auth/services/cloudAccountSession';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  SAVE_ANSWER_AS_DOCUMENT_LABEL,
  documentTitleFromAnswer,
  normalizeArtifactTitle,
} from '@agiworkforce/unified-chat/answer-document';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { ArtifactFullScreen } from './ArtifactFullScreen';
import { ToolCallDetailsSheet, ToolCallTimeline } from './ToolCallTimeline';
import {
  isExecutingCode,
  readCodeExecutionResult,
} from '@agiworkforce/unified-chat/code-execution-result';
import { CodeExecutionBlock } from './CodeExecutionBlock';
import { codeExecutionPlotFiles, finishedCodeStepId } from './CodeExecutionPlots';
import { answerFormatCardType } from '@agiworkforce/unified-chat/message-format';
import { withoutCitationMarkers } from '@agiworkforce/unified-chat/citation-markers';
import { MessageFormatCard } from './MessageFormatCard';
import { InteractiveCardBlock } from './InteractiveCardBlock';
import { API_URL } from '@/lib/constants';
import { RunningAgentActivityTimeline } from './RunningAgentActivityTimeline';
import {
  explainAutoRouteReason,
  getToolDisplayLabel,
  isTerminalToolStatus,
  pastChatCitationsFromMetadata,
  summarizeToolTimeline,
} from '@agiworkforce/types';
import { StatusStep as StatusStepComponent } from './StatusStep';
import { GeneratedImage } from './GeneratedImage';
import { ImageGenProgress } from './ImageGenProgress';
import { GeneratedVideo } from './GeneratedVideo';
import { VideoGenProgress } from './VideoGenProgress';
import { ImageFullScreen, type ViewerImage } from './ImageFullScreen';
import { FileExportButton } from './FileExportButton';
import { StreamingArtifactCard, streamingArtifactBlock } from './StreamingArtifactCard';
import {
  fencesShownAsCards,
  liveMessageArtifacts,
  offersStreamingArtifact,
  withoutFencesShownAsCards,
  withheldDerivedArtifactIds,
} from '@/stores/chat/derivedMessageArtifact';
import { CollapsibleSources } from './CollapsibleSources';
import { ProjectFileCitations, projectFileCitationsFromMetadata } from './ProjectFileCitations';
import { PastChatCitations } from './PastChatCitations';
import { AssistantDraftScope, hasUnsavedAnswerEdits } from './AssistantDraftScope';
import { saveAssistantFenceEdit } from '@/src/features/chat/services/assistantFenceEdit';
import type { AssistantFenceEditRequest } from '@/src/features/chat/services/assistantFenceEditRequest';
import { answerClipboardText } from '@/src/features/chat/utils/markdownPlainText';
import {
  nativeCitationFromDelta,
  orderTurnSources,
  searchQueryFromMetadata,
  type NativeCitation,
} from '@/src/features/chat/utils/messageSources';
import {
  SENT_FILE_UNAVAILABLE_MESSAGE,
  sentAttachmentDetail,
  sentAttachmentKind,
  sentAttachmentViewerSource,
  sharedAttachmentsNotCopied,
} from '@/src/features/chat/utils/sentAttachment';
import { FileViewerScreen } from './artifact-viewers/FileViewerScreen';
import type { FileViewerSource } from './artifact-viewers/viewerKind';
import { MemoryUsedChip } from './MemoryUsedChip';
import { messageSentAtLabel } from '@/src/features/chat/utils/messageTime';
import { messageMemoryCitations } from '@/src/features/memory/services/memoryCitations';
import { messageFallbackNotice } from '@/src/features/chat/utils/fallbackNotice';
import { ResearchRunCard, type ResearchPlanDecision } from './research/ResearchRunCard';
import { AgiWorkPlanReview } from './AgiWorkPlanReview';
import {
  readAgiWorkPlanReview,
  readAgiWorkPlanSteps,
  type AgiWorkPlanDecision,
} from '@/src/features/chat/utils/agiWorkPlan';
import { ResearchSourcesAppendix } from './research/ResearchSourcesAppendix';
import { ResearchReportSections } from './research/ResearchReportSections';
import { useRevealInChat } from './cards/ChatScrollIntoView';
import {
  RESEARCH_PHASE_LABELS,
  readResearchRunState,
} from '@/src/features/chat/utils/researchRunState';
import {
  activityEndedByDecline,
  toolCallsEndedByDecline,
} from '@/src/features/chat/utils/declinedToolSteps';
import { imageVersionsFromMetadata } from '@/src/features/image/imageVersions';
import { collectMessageResearchSources } from '@agiworkforce/unified-chat/message-sources';
import type { MessageResearchSourceMetadata } from '@agiworkforce/unified-chat/message-sources';
import { getManagedModelPresentationLabel } from '@agiworkforce/unified-chat/model-info';
import {
  reconcileCitationMarkersFromSourceList,
  stripTrailingCitationOnlyBlock,
  stripTrailingSourceList,
} from '@agiworkforce/unified-chat/report-sources';
import {
  WEB_SEARCH_NOTICE_ACTION,
  WEB_SEARCH_NOTICE_TEXT,
  answeredOnFreePool,
  modelEscalationLine,
  secretRedactionNotice,
  webSearchNoticeForMessage,
} from './messageTurnNotices';
import { MessageEditModal } from './MessageEditModal';
import { SelectTextSheet } from './SelectTextSheet';
import { renderMarkdownContent } from './MessageContentRenderer';
import { parseAssistantThinking } from '@/stores/chat/chatExecutionStore';
import { useChatMessageStore } from '@/stores/chat/chatMessageStore';
import { ProvenanceFooter } from './ProvenanceFooter';
import { PerformanceChip } from './PerformanceChip';
import { ReportSheet } from './ReportFlagButton';
import { ResponseRatingDetails } from './ResponseRatingDetails';
import type { ResponseRatingDetailsInput } from '@/src/features/chat/services/cloudMessageMutations';
import { reportAssetFor } from '@/services/contentReportAsset';
import { copyControlLabel, useCopyAction } from '@/src/shared/hooks/useCopyAction';
import { showToast } from '@/src/shared/components/Toast';
import { storage } from '@/lib/mmkv';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeColors, radii } from '@/src/ui/theme';
import { chatTypography, motion, typeScale } from '@/src/ui/theme/tokens';
import {
  getDisplayName,
  getModelById,
  getModelByIdForCloudAccess,
  isAutoMode,
} from '@/src/features/model-picker/service';
import {
  hasMessageStreamError,
  getMessageStreamErrorCode,
  streamFailureNoticeText,
} from '@/src/features/chat/utils/messageStreamError';
import { offersModelSwitch } from '@/services/apiErrors';
import {
  CLOUD_RESUME_SIGN_IN,
  confirmBeforeRewrite,
  isApprovalTurnLive,
  noteBannerModelSwitch,
  useChatExecutionStore,
  type ToolInputOutcome,
} from '@/stores/chat/chatExecutionStore';
import { useAuthStore } from '@/src/features/auth/store';
import { modelEditsImages, serverEditsImages } from '@/stores/chat/imageEditSupport';
import type {
  ChatMessage,
  Artifact,
  MessageAttachment,
  ToolCall,
  ToolSearchResult,
} from '@/types/chat';
import { useConversationArtifacts } from '@/src/features/chat/hooks/useConversationArtifacts';
import { readAgentActivityState } from '@/src/features/chat/utils/agentActivityState';
import {
  isPlaceholderOnlyActivity,
  isStoppedFinishReason,
  settledTurnActivity,
  type LiveRunState,
} from '@/src/features/chat/utils/agentActivity';
import {
  ManagedCloudAgentRunReferenceSchema,
  describeAttachmentTruncation,
  readPersistedInteractiveCards,
  SHARED_ATTACHMENTS_NOT_COPIED,
  TOOL_APPROVAL_SCOPE_DECISIONS,
  type ToolApprovalDecisionValue,
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
import type { ImageWholeEdit } from '@/src/features/image/wholeImageEdit';

type ReactionType = 'thumbsUp' | 'thumbsDown' | null;

const RATING_RECORDED_NOTICE = 'Thanks for your feedback';
const RATING_REMOVED_NOTICE = 'Rating removed';

function confirmRating(next: ReactionType): void {
  showToast(next === null ? RATING_REMOVED_NOTICE : RATING_RECORDED_NOTICE);
}

interface MessageAction {
  key: string;
  label: string;
  destructive?: boolean;
  unavailableReason?: string;
  run: () => void;
}

const WAIT_FOR_RESPONSE = 'Available when the current response finishes.';
const RESEARCH_SETTLED_PHASES: ReadonlySet<string> = new Set([
  'complete',
  'error',
  'interrupted',
  'paused',
]);
const READ_ALOUD_FAILED = 'Read aloud could not play. Try again.';
const SAVE_DOCUMENT_SIGNED_OUT = 'Sign in to save this answer as a document.';
const DISCARD_DRAFT_TITLE = 'Discard your unsaved changes?';
const DISCARD_DRAFT_PROMPTS = {
  regenerate: {
    message: 'Regenerating replaces this answer, and the unsaved changes in it are lost.',
    confirm: 'Discard and regenerate',
  },
  edit: {
    message:
      'Editing your message replaces the answer below, and the unsaved changes in it are lost.',
    confirm: 'Discard and edit',
  },
  resend: {
    message:
      'Sending your message again replaces the answer below, and the unsaved changes in it are lost.',
    confirm: 'Discard and resend',
  },
} as const;
const TOOL_INPUT_OUTCOME_COPY: Record<ToolInputOutcome, string> = {
  sent: 'Answer sent.',
  expired: 'This request expired.',
};

function readToolInputOutcome(metadata: ChatMessage['metadata']): ToolInputOutcome | undefined {
  const value = metadata?.toolInputOutcome;
  return value === 'sent' || value === 'expired' ? value : undefined;
}

function confirmLosingAnswerEdits(
  answerId: string | undefined,
  action: keyof typeof DISCARD_DRAFT_PROMPTS,
  run: () => void,
): void {
  if (!answerId || !hasUnsavedAnswerEdits(answerId)) {
    run();
    return;
  }
  const prompt = DISCARD_DRAFT_PROMPTS[action];
  Alert.alert(DISCARD_DRAFT_TITLE, prompt.message, [
    { text: 'Keep editing', style: 'cancel' },
    { text: prompt.confirm, style: 'destructive', onPress: run },
  ]);
}
const ACTION_SHEET_CHROME = 160;

function MessageActionSheet({
  visible,
  sentAt,
  actions,
  onSelect,
  onClose,
  onDismissed,
}: {
  visible: boolean;
  sentAt: string | null;
  actions: MessageAction[];
  onSelect: (action: MessageAction) => void;
  onClose: () => void;
  onDismissed: () => void;
}) {
  const colors = useThemeColors();
  const { height } = useWindowDimensions();
  const insets = useContext(SafeAreaInsetsContext);
  const rowsMaxHeight = Math.max(
    52 * 3,
    height - (insets?.top ?? 0) - (insets?.bottom ?? 0) - ACTION_SHEET_CHROME,
  );

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
            {sentAt ? (
              <Text
                testID="message-sent-at"
                style={{
                  fontSize: typeScale.footnote,
                  color: colors.textMuted,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                }}
              >
                {sentAt}
              </Text>
            ) : null}
            <ScrollView
              testID="message-action-rows"
              style={{ maxHeight: rowsMaxHeight }}
              bounces={false}
            >
              {actions.map((action, index) => (
                <PressableBox
                  key={action.key}
                  testID={`message-action-${action.key}`}
                  onPress={action.unavailableReason ? undefined : () => onSelect(action)}
                  disabled={Boolean(action.unavailableReason)}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  accessibilityHint={action.unavailableReason}
                  accessibilityState={{ disabled: Boolean(action.unavailableReason) }}
                  style={{
                    minHeight: 52,
                    justifyContent: 'center',
                    paddingHorizontal: 20,
                    paddingVertical: action.unavailableReason ? 8 : 0,
                    borderBottomWidth: index < actions.length - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                  }}
                >
                  <Text
                    style={{
                      fontSize: typeScale.callout,
                      color: action.unavailableReason
                        ? colors.textMuted
                        : action.destructive
                          ? colors.agentError
                          : colors.textPrimary,
                    }}
                  >
                    {action.label}
                  </Text>
                  {action.unavailableReason ? (
                    <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>
                      {action.unavailableReason}
                    </Text>
                  ) : null}
                </PressableBox>
              ))}
            </ScrollView>
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
  actionAccessibilityLabel?: string;
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
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
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
      accessibilityLabel={
        noun === 'response'
          ? `Response ${variant.index + 1} of ${variant.total}`
          : `Edited message, version ${variant.index + 1} of ${variant.total}`
      }
    >
      <PressableBox
        onPress={previousId ? () => onSelect(previousId) : undefined}
        disabled={!previousId}
        accessibilityRole="button"
        accessibilityLabel={`Previous ${noun}`}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
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
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronRight size={16} color={nextId ? colors.textSecondary : colors.textMuted} />
      </PressableBox>
    </View>
  );
}

function legacyReasoningText(metadata: ChatMessage['metadata']): string | undefined {
  const content = metadata?.thinkingContent;
  if (typeof content === 'string' && content.trim()) return content;
  const steps = metadata?.thinkingSteps;
  if (!Array.isArray(steps)) return undefined;
  const written = steps.filter(
    (step): step is string => typeof step === 'string' && step.trim().length > 0,
  );
  return written.length > 0
    ? written.map((step, index) => `**Step ${index + 1}**\n${step.trim()}`).join('\n\n')
    : undefined;
}

function readCardTextOffsets(value: unknown): Readonly<Record<string, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const offsets = Object.entries(value).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0,
  );
  return offsets.length > 0 ? Object.fromEntries(offsets) : undefined;
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

function SentImageTile({
  attachment,
  style,
  onOpen,
}: {
  attachment: MessageAttachment;
  style: ComponentProps<typeof AuthorizedImage>['style'];
  onOpen: (url: string) => void;
}) {
  const [unavailable, setUnavailable] = useState(false);
  return (
    <PressableBox
      onPress={() =>
        unavailable
          ? Alert.alert(`${attachment.fileName} is no longer available`)
          : onOpen(attachment.url)
      }
      className="rounded-lg overflow-hidden"
      accessibilityLabel={
        unavailable
          ? `Attached image: ${attachment.fileName}, unavailable`
          : `Attached image: ${attachment.fileName}`
      }
      {...(unavailable ? {} : { accessibilityHint: 'Opens full screen' })}
      accessibilityRole="button"
    >
      <AuthorizedImage
        uri={attachment.url}
        name={attachment.fileName}
        style={style}
        onUnavailableChange={setUnavailable}
      />
    </PressableBox>
  );
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

const SENT_FILE_ICON = {
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  document: FileText,
} as const;

function SentFileChip({
  attachment,
  onOpen,
}: {
  attachment: MessageAttachment;
  onOpen: (source: FileViewerSource) => void;
}) {
  const colors = useThemeColors();
  const Icon = SENT_FILE_ICON[sentAttachmentKind(attachment)];
  const detail = sentAttachmentDetail(attachment);
  const open = () => {
    const source = sentAttachmentViewerSource(attachment);
    if (source) onOpen(source);
    else Alert.alert('Could not open file', SENT_FILE_UNAVAILABLE_MESSAGE);
  };
  return (
    <PressableBox
      testID="sent-file-chip"
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`File attachment: ${attachment.fileName}${detail ? `, ${detail}` : ''}`}
      accessibilityHint="Opens the file"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 12,
        borderRadius: radii.md,
        backgroundColor: colors.accentSurface,
      }}
    >
      <Icon size={16} color={colors.agentActive} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: typeScale.footnote, color: colors.textPrimary }}>
          {attachment.fileName}
        </Text>
        {detail ? (
          <Text style={{ fontSize: typeScale.caption, color: colors.textMuted }}>{detail}</Text>
        ) : null}
      </View>
    </PressableBox>
  );
}

function modelSupportsThinking(modelId?: string): boolean {
  if (!modelId || isAutoMode(modelId)) return true;
  const def = getModelById(modelId);
  return def?.supportsThinking !== false;
}

function getProvenance(message: ChatMessage): { provider?: string; model?: string } | null {
  const { model, metadata } = message;
  if (!model) return null;
  const cloudTurn =
    typeof metadata?.requestedModel === 'string' || typeof metadata?.resolvedModel === 'string';
  const resolved =
    typeof metadata?.resolvedModel === 'string' && !isAutoMode(metadata.resolvedModel)
      ? metadata.resolvedModel
      : undefined;
  const answeredBy = resolved ?? model;
  if (isAutoMode(answeredBy)) {
    return cloudTurn ? { provider: 'AGI Cloud' } : { provider: 'Local Mode', model: 'Auto' };
  }

  const def = getModelByIdForCloudAccess(answeredBy, true);
  if (!def) return cloudTurn ? { provider: 'AGI Cloud' } : null;

  if (def.surface === 'local') {
    return { provider: 'Local Mode', model: def.name };
  }

  return {
    provider: 'AGI Cloud',
    model: getManagedModelPresentationLabel(answeredBy, {
      freePool: answeredOnFreePool(metadata),
    }),
  };
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
  speechOwner?: voiceOutput.VoiceOutputOwner | null;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (messageId: string) => void;
  onRetryWithModel?: (messageId: string) => void;
  onContinueMessage?: (messageId: string) => void;
  onBranch?: (messageId: string) => void;
  onScheduleMessage?: (messageId: string) => void;
  onEditImageArea?: (message: ChatMessage, edit: ImageAreaEdit) => void;
  onEditImage?: (message: ChatMessage, edit: ImageWholeEdit) => void;
  imageEditModelIds?: ReadonlySet<string>;
  inTemporaryChat?: boolean;
  onDeleteImageConversation?: () => void;
  variant?: VariantInfo;
  onSelectVariant?: (messageId: string) => void;
  onSwitchModel?: () => void;
  onEditMessage?: (
    messageId: string,
    newContent: string,
    attachments?: MessageAttachment[],
  ) => boolean;
  editAttachmentsSupported?: boolean;
  onReaction?: (messageId: string, reaction: ReactionType) => void;
  onSubmitRatingDetails?: (messageId: string, details: ResponseRatingDetailsInput) => Promise<void>;
  onResolveToolApproval?: (
    messageId: string,
    toolCallId: string,
    decision: ToolApprovalDecisionValue,
    guidance?: string,
  ) => void;
  onResearchPlanDecision?: (messageId: string, decision: ResearchPlanDecision) => void;
  onRetryResearch?: (messageId: string) => void;
  onStopResearch?: () => void;
  onPauseResearch?: (messageId: string) => Promise<boolean>;
  isResumingResearch?: boolean;
  onQuoteSelection?: (message: ChatMessage, text: string) => void;
  onFollowUp?: (text: string) => void;
  nextAnswerId?: string;
  liveRun?: LiveRunState;
}

const RUN_STATUS_UNAVAILABLE = 'Status unavailable';

function MessageActionButton({
  label,
  icon: Icon,
  onPress,
  color,
  unavailableReason,
  accessibilityActions,
  onAccessibilityAction,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  onPress: () => void;
  color: string;
  unavailableReason?: string;
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}) {
  return (
    <PressableBox
      onPress={unavailableReason ? () => showToast(unavailableReason) : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={unavailableReason}
      accessibilityState={unavailableReason ? { disabled: true } : undefined}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={{
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radii.md,
        opacity: unavailableReason ? 0.4 : 1,
      }}
    >
      <Icon size={16} color={color} />
    </PressableBox>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  speechOwner,
  onDeleteMessage,
  onRetryMessage,
  onEditImageArea,
  onEditImage,
  imageEditModelIds,
  inTemporaryChat = false,
  onDeleteImageConversation,
  onRetryWithModel,
  onContinueMessage,
  onBranch,
  onScheduleMessage,
  variant,
  onSelectVariant,
  onSwitchModel,
  onEditMessage,
  editAttachmentsSupported = false,
  onReaction,
  onSubmitRatingDetails,
  onResolveToolApproval,
  onResearchPlanDecision,
  onRetryResearch,
  onStopResearch,
  onPauseResearch,
  isResumingResearch = false,
  onQuoteSelection,
  onFollowUp,
  nextAnswerId,
  liveRun,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const research = isAssistant ? readResearchRunState(message.metadata?.research) : undefined;
  const reportAsset =
    reportAssetFor('video', message.videoUrl) ?? reportAssetFor('image', message.imageUrl);
  const reportConversationId = message.conversationId || message.id;
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
  const memoryCitations = useMemo(
    () => (isAssistant ? messageMemoryCitations(message.metadata) : null),
    [isAssistant, message.metadata],
  );
  const storedActivity = message.metadata?.agentActivity;
  const storedFinishReason = message.metadata?.finishReason;
  const canonicalActivity = useMemo(() => {
    const activity = isAssistant ? readAgentActivityState(storedActivity) : undefined;
    return activity
      ? settledTurnActivity(activity, {
          toolCalls: message.toolCalls,
          streaming: message.isStreaming === true,
          hasText: /\S/.test(message.content),
          finishReason: storedFinishReason,
          ...(liveRun ? { liveRun } : {}),
        })
      : undefined;
  }, [
    isAssistant,
    storedActivity,
    storedFinishReason,
    message.toolCalls,
    message.isStreaming,
    message.content,
    liveRun,
  ]);
  const toolInputOutcome = isAssistant ? readToolInputOutcome(message.metadata) : undefined;
  const attachmentTruncationNotice = isUser
    ? describeAttachmentTruncation(
        Array.isArray(message.metadata?.truncatedAttachments)
          ? (message.metadata.truncatedAttachments as string[])
          : undefined,
      )
    : null;
  const sharedAttachmentNames = isUser
    ? sharedAttachmentsNotCopied(message.metadata)
        .map((attachment) => attachment.name)
        .join(', ')
    : '';
  const steerRunId = useMemo(() => {
    const reference = ManagedCloudAgentRunReferenceSchema.safeParse(
      message.metadata?.cloudAgentRun,
    );
    return reference.success ? reference.data.runId : undefined;
  }, [message.metadata?.cloudAgentRun]);
  const assistantProvenance = isAssistant ? getProvenance(message) : null;
  const provenance = isAssistant && !message.isStreaming ? assistantProvenance : null;
  const routeReceipt =
    isAssistant && !message.isStreaming ? autoRouteReceipt(message.metadata) : null;
  const [fallbackNoticeDismissed, setFallbackNoticeDismissed] = useRecyclingState(false, [
    message.id,
  ]);
  const fallbackNotice =
    isAssistant && !message.isStreaming && !fallbackNoticeDismissed && message.content.trim()
      ? messageFallbackNotice(message.metadata)
      : null;
  const awaitingApproval =
    isAssistant &&
    (canonicalActivity
      ? canonicalActivity.status === 'awaiting-approval' ||
        canonicalActivity.entries.some(
          (entry) => entry.kind === 'tool' && entry.status === 'awaiting-approval',
        )
      : (message.toolCalls ?? []).some(
          (tool) =>
            tool.requiresApproval === true &&
            !tool.approvalDecision &&
            !isTerminalToolStatus(tool.status),
        ));
  const endedByDecline =
    isAssistant &&
    (canonicalActivity
      ? activityEndedByDecline(canonicalActivity, message.toolCalls)
      : toolCallsEndedByDecline(message.toolCalls ?? []));
  const citedSourceCount = useMemo(() => {
    const cited = message.metadata?.citations;
    if (!isAssistant || !Array.isArray(cited)) return undefined;
    const citations = cited.flatMap((entry): NativeCitation[] => {
      const citation = nativeCitationFromDelta(entry);
      return citation ? [citation] : [];
    });
    return citations.length > 0 ? orderTurnSources([], citations).length : undefined;
  }, [isAssistant, message.metadata?.citations]);
  const sourcesQuery = isAssistant ? searchQueryFromMetadata(message.metadata) : undefined;
  const projectFileCitations = useMemo(
    () => (isAssistant ? projectFileCitationsFromMetadata(message.metadata) : []),
    [isAssistant, message.metadata],
  );
  const pastChatCitations = useMemo(
    () => (isAssistant ? pastChatCitationsFromMetadata(message.metadata) : []),
    [isAssistant, message.metadata],
  );
  const imageVersions = useMemo(
    () => (isAssistant ? imageVersionsFromMetadata(message.metadata) : []),
    [isAssistant, message.metadata],
  );
  const viewerImages = useMemo<ViewerImage[]>(() => {
    const attachedImages = (message.attachments ?? [])
      .filter((attachment) => attachment.mimeType.startsWith('image/'))
      .map((attachment): ViewerImage => ({
        url: attachment.url,
        kind: 'attachment',
        name: attachment.fileName,
        mimeType: attachment.mimeType,
      }));
    if (isUser) return attachedImages;
    return [
      ...(message.imageUrl
        ? [
            {
              url: message.imageUrl,
              kind: 'generated' as const,
              ...(message.imageGenPrompt || message.revisedPrompt
                ? { prompt: message.imageGenPrompt ?? message.revisedPrompt }
                : {}),
              ...(message.model ? { model: message.model } : {}),
              ...(message.imageAspectRatio ? { aspectRatio: message.imageAspectRatio } : {}),
              allowEphemeral: message.imageGenPersisted === false,
            },
          ]
        : []),
      ...attachedImages,
    ];
  }, [
    isUser,
    message.attachments,
    message.imageUrl,
    message.imageGenPrompt,
    message.revisedPrompt,
    message.model,
    message.imageAspectRatio,
    message.imageGenPersisted,
  ]);
  const saveFenceEdit = useCallback(
    (request: AssistantFenceEditRequest) =>
      saveAssistantFenceEdit(message.conversationId, message.id, request),
    [message.conversationId, message.id],
  );
  const roleLabel = isUser ? 'You' : (assistantProvenance?.model ?? 'AGI');
  const parsedThinking = useMemo(
    () => (isAssistant ? parseAssistantThinking(message.content) : null),
    [isAssistant, message.content],
  );
  const displayContent = parsedThinking?.hasReasoning ? parsedThinking.content : message.content;
  const codeExecutionResult = isAssistant ? readCodeExecutionResult(message.metadata) : undefined;
  const codeExecuting =
    isAssistant &&
    isExecutingCode({
      isStreaming: message.isStreaming,
      metadata: message.metadata,
      toolCalls: [],
    });
  const legacyThinking = isAssistant ? legacyReasoningText(message.metadata) : undefined;
  const reasoningText =
    message.reasoning ??
    (parsedThinking?.hasReasoning ? parsedThinking.reasoning : undefined) ??
    legacyThinking;
  const hasReasoning =
    isAssistant &&
    reasoningText !== undefined &&
    (parsedThinking?.hasReasoning === true ||
      legacyThinking !== undefined ||
      modelSupportsThinking(message.model));
  const [expandedArtifact, setExpandedArtifact] = useRecyclingState<Artifact | null>(null, [
    message.id,
  ]);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useRecyclingState<string | null>(null, [
    message.id,
  ]);
  const shownViewerImages = useMemo<ViewerImage[]>(() => {
    if (!fullScreenImageUrl || viewerImages.some((image) => image.url === fullScreenImageUrl)) {
      return viewerImages;
    }
    const version = imageVersions.find((entry) => entry.imageUrl === fullScreenImageUrl);
    if (!version) return viewerImages;
    return [
      {
        url: version.imageUrl,
        kind: 'generated',
        ...(version.prompt ? { prompt: version.prompt } : {}),
        ...(version.model ? { model: version.model } : {}),
        ...(version.aspect ? { aspectRatio: version.aspect } : {}),
        allowEphemeral: false,
      },
    ];
  }, [fullScreenImageUrl, viewerImages, imageVersions]);
  const [showExportSheet, setShowExportSheet] = useRecyclingState(false, [message.id]);
  const [viewingAttachment, setViewingAttachment] = useRecyclingState<FileViewerSource | null>(
    null,
    [message.id],
  );
  const [accessibilityTool, setAccessibilityTool] = useRecyclingState<ToolCall | null>(null, [
    message.id,
  ]);
  const [editModalVisible, setEditModalVisible] = useRecyclingState(false, [message.id]);
  const [selectTextVisible, setSelectTextVisible] = useRecyclingState(false, [message.id]);
  const [editText, setEditText] = useRecyclingState('', [message.id]);
  const [editAttachments, setEditAttachments] = useRecyclingState<MessageAttachment[]>(
    [],
    [message.id],
  );
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

  const answerWithDrafts = isAssistant ? message.id : nextAnswerId;
  const rerunPrompt = isAssistant ? 'regenerate' : 'resend';
  const retryTurn = useCallback(() => {
    if (!onRetryMessage) return;
    confirmLosingAnswerEdits(answerWithDrafts, rerunPrompt, () => onRetryMessage(message.id));
  }, [answerWithDrafts, rerunPrompt, onRetryMessage, message.id]);
  const retryWithModel = useCallback(() => {
    if (!onRetryWithModel) return;
    confirmLosingAnswerEdits(answerWithDrafts, rerunPrompt, () => onRetryWithModel(message.id));
  }, [answerWithDrafts, rerunPrompt, onRetryWithModel, message.id]);
  const handleRetryGeneration = retryTurn;
  const switchModelFromBanner = useCallback(() => {
    noteBannerModelSwitch(message.conversationId);
    onSwitchModel?.();
  }, [message.conversationId, onSwitchModel]);

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
    const liveArtifacts = message.isStreaming
      ? liveMessageArtifacts(
          message.content,
          message.conversationId,
          message.id,
          message.createdAt,
          appMode,
          message.metadata,
        )
      : [];
    const byId = new Map<string, Artifact>();
    for (const artifact of [
      ...liveArtifacts,
      ...scopedStoreArtifacts,
      ...persistedFiles,
      ...(message.artifacts ?? []),
    ]) {
      byId.set(artifact.id, artifact);
    }
    const withheld = withheldDerivedArtifactIds(
      message.content,
      message.conversationId,
      message.id,
      appMode,
      message.metadata,
    );
    const unique = [...byId.values()].filter((artifact) => !withheld.has(artifact.id));
    return mergeDerivedAndGeneratedFileArtifacts(
      unique.filter((artifact) => !artifact.generatedFile),
      unique.filter((artifact) => artifact.generatedFile),
    );
  }, [
    appMode,
    storedArtifacts,
    message.id,
    message.conversationId,
    message.content,
    message.createdAt,
    message.metadata,
    message.artifacts,
    message.isStreaming,
  ]);
  const artifactCardSources = useMemo(
    () =>
      fencesShownAsCards(
        message.content,
        message.conversationId,
        message.id,
        appMode,
        message.metadata,
        new Set(inlineArtifacts.map((artifact) => artifact.id)),
      ),
    [
      appMode,
      inlineArtifacts,
      message.content,
      message.conversationId,
      message.id,
      message.metadata,
    ],
  );
  const hasCodeExecutionResult = codeExecutionResult !== undefined;
  const codePlots = useMemo(
    () =>
      hasCodeExecutionResult || finishedCodeStepId(canonicalActivity) !== undefined
        ? codeExecutionPlotFiles(inlineArtifacts)
        : [],
    [hasCodeExecutionResult, canonicalActivity, inlineArtifacts],
  );
  const cardArtifacts = useMemo(() => {
    if (!hasCodeExecutionResult || codePlots.length === 0) return inlineArtifacts;
    const plotIds = new Set(codePlots.map((plot) => plot.artifactId));
    return inlineArtifacts.filter((artifact) => !plotIds.has(artifact.id));
  }, [hasCodeExecutionResult, codePlots, inlineArtifacts]);
  const showsStreamingArtifact = useMemo(
    () => offersStreamingArtifact(message.content, appMode, message.metadata),
    [appMode, message.content, message.metadata],
  );
  const streamingArtifactCardShown =
    showsStreamingArtifact && streamingArtifactBlock(message.content) !== null;

  const interactiveCards = useMemo(
    () =>
      appMode === 'cloud'
        ? (message.interactiveCards ?? readPersistedInteractiveCards(message.metadata))
        : [],
    [appMode, message.interactiveCards, message.metadata],
  );
  const interactiveCardTextOffsets = useMemo(
    () => readCardTextOffsets(message.metadata?.interactiveCardTextOffsets),
    [message.metadata?.interactiveCardTextOffsets],
  );

  const conversationStreaming = useChatExecutionStore((s) =>
    s.streamingConversationIds.includes(message.conversationId),
  );
  const clerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const toolInputSendError = useChatExecutionStore((s) => {
    const error = s.toolInputSendErrors[message.id];
    return error === CLOUD_RESUME_SIGN_IN && clerkSignedIn ? undefined : error;
  });

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

  const handleResolveToolApproval = useCallback(
    (toolCallId: string, decision: ToolApprovalDecisionValue, guidance?: string) =>
      onResolveToolApproval?.(message.id, toolCallId, decision, guidance),
    [onResolveToolApproval, message.id],
  );
  const handleAllowToolForChat = useCallback(
    (toolCallId: string, _toolName: string, guidance?: string) =>
      onResolveToolApproval?.(
        message.id,
        toolCallId,
        TOOL_APPROVAL_SCOPE_DECISIONS.session,
        guidance,
      ),
    [onResolveToolApproval, message.id],
  );
  const handleAlwaysAllowTool = useCallback(
    (toolCallId: string, _toolName: string, guidance?: string) =>
      onResolveToolApproval?.(
        message.id,
        toolCallId,
        TOOL_APPROVAL_SCOPE_DECISIONS.always,
        guidance,
      ),
    [onResolveToolApproval, message.id],
  );
  const scopedApprovalProps = onResolveToolApproval
    ? {
        onAllowApprovalForChat: handleAllowToolForChat,
        onAlwaysAllowApproval: handleAlwaysAllowTool,
      }
    : {};

  const approvalTurnExpired = Boolean(onResolveToolApproval) && !isApprovalTurnLive(message.id);

  const handleImagePress = useCallback(
    (url: string) => {
      setFullScreenImageUrl(url);
    },
    [setFullScreenImageUrl],
  );

  const modelCanEditImage = imageEditModelIds
    ? serverEditsImages(message.model, imageEditModelIds)
    : modelEditsImages(message.model);
  const handleCloseFullScreenImage = useCallback(() => {
    setFullScreenImageUrl(null);
  }, [setFullScreenImageUrl]);

  const [actionsVisible, setActionsVisible] = useRecyclingState(false, [message.id]);
  const [reportVisible, setReportVisible] = useRecyclingState(false, [message.id]);
  const [ratingDetailsVisible, setRatingDetailsVisible] = useRecyclingState(false, [message.id]);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const [isSpeaking, setIsSpeaking] = useRecyclingState(false, [message.id]);
  const readAloudUnavailable = useReadAloudUnavailableReason(isAssistant ? speechOwner : null);
  const speechRef = useRef<voiceOutput.VoiceOutputHandle | null>(null);
  const speechScopeRef = useRef<object | null>(null);
  const speechScope = useMemo(
    () => ({ messageId: message.id, content: message.content, owner: speechOwner }),
    [message.id, message.content, speechOwner],
  );

  useLayoutEffect(() => {
    const scope = speechScope;
    speechScopeRef.current = scope;
    setIsSpeaking(false);
    return () => {
      if (speechScopeRef.current !== scope) return;
      speechScopeRef.current = null;
      const speech = speechRef.current;
      speechRef.current = null;
      void speech?.stop().catch(() => undefined);
    };
  }, [speechScope, setIsSpeaking]);

  const handleShowExport = useCallback(() => {
    setShowExportSheet(true);
  }, [setShowExportSheet]);

  const handleCloseExport = useCallback(() => {
    setShowExportSheet(false);
  }, [setShowExportSheet]);

  const applyReaction = useCallback(
    (target: Exclude<ReactionType, null>) => {
      if (hapticsEnabled) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const next: ReactionType = reaction === target ? null : target;
      setReaction(next);
      onReaction?.(message.id, next);
      if (next === 'thumbsDown' && onSubmitRatingDetails) setRatingDetailsVisible(true);
      else confirmRating(next);
    },
    [
      hapticsEnabled,
      message.id,
      onReaction,
      onSubmitRatingDetails,
      reaction,
      setReaction,
      setRatingDetailsVisible,
    ],
  );

  const submitRatingDetails = useCallback(
    async (details: ResponseRatingDetailsInput) => {
      if (!onSubmitRatingDetails) return;
      await onSubmitRatingDetails(message.id, details);
      confirmRating('thumbsDown');
    },
    [onSubmitRatingDetails, message.id],
  );

  const handleOpenEditModal = useCallback(() => {
    setEditText(message.content);
    setEditAttachments(message.attachments ?? []);
    setEditModalVisible(true);
  }, [message.content, message.attachments, setEditAttachments, setEditModalVisible, setEditText]);

  const handleRemoveEditAttachment = useCallback(
    (url: string) => setEditAttachments((current) => current.filter((item) => item.url !== url)),
    [setEditAttachments],
  );

  const handleSubmitEdit = useCallback(() => {
    const trimmed = editText.trim();
    const attachmentsChanged = editAttachments.length !== (message.attachments ?? []).length;
    if (!trimmed || (trimmed === message.content.trim() && !attachmentsChanged)) {
      setEditModalVisible(false);
      return;
    }
    const send = () => {
      if (onEditMessage) {
        const accepted = attachmentsChanged
          ? onEditMessage(message.id, trimmed, editAttachments)
          : onEditMessage(message.id, trimmed);
        if (!accepted) return;
      }
      setEditModalVisible(false);
    };
    confirmLosingAnswerEdits(nextAnswerId, 'edit', () =>
      confirmBeforeRewrite(message.conversationId, message.id, 'edit', send),
    );
  }, [
    editText,
    editAttachments,
    nextAnswerId,
    message.id,
    message.conversationId,
    message.content,
    message.attachments,
    onEditMessage,
    setEditModalVisible,
  ]);

  const copyMessage = useCallback(
    () => void copy(isAssistant ? answerClipboardText(message.content) : message.content),
    [copy, isAssistant, message.content],
  );

  const saveAnswerAsDocument = useCallback(() => {
    const content = displayContent.trim();
    if (!content) return;
    let provenance: MobileArtifactProvenance;
    if (appMode === 'local') {
      provenance = { scope: 'local' };
    } else {
      const account = captureCloudAccountEpoch();
      if (!account) {
        showToast(SAVE_DOCUMENT_SIGNED_OUT);
        return;
      }
      provenance = { scope: 'cloud', ownerId: account.ownerId };
    }
    const document: CloudLinkedMobileArtifact = {
      ...canonicalToMobileArtifact(
        {
          id: uuidv7(),
          type: 'document',
          title: normalizeArtifactTitle(documentTitleFromAnswer(content)),
          content: `${content}\n`,
          language: 'markdown',
        },
        new Date().toISOString(),
        '',
        themeColors,
        provenance,
      ),
      messageId: message.id,
      conversationId: message.conversationId,
      artifactType: 'document' as const,
    };
    useArtifactStore.getState().addArtifacts([document]);
    setExpandedArtifact({
      id: document.id,
      type: document.kind,
      title: document.title,
      content: document.content,
      ...(document.language ? { language: document.language } : {}),
    });
  }, [
    appMode,
    displayContent,
    message.conversationId,
    message.id,
    setExpandedArtifact,
    themeColors,
  ]);

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

  const canRate = isAssistant && !message.isStreaming && Boolean(onReaction);
  const canReport =
    isAssistant && !message.isStreaming && Boolean(message.content.trim() || reportAsset);
  const showsAnswerActions = canReport || (isAssistant && !message.isStreaming && endedByDecline);
  const rowStreaming = message.isStreaming === true;
  const rerunUnavailable = conversationStreaming ? WAIT_FOR_RESPONSE : undefined;

  const handleDoubleTap = useCallback(
    (event: TapGestureHandlerStateChangeEvent) => {
      if (event.nativeEvent.state !== State.ACTIVE || !canRate) return;
      applyReaction('thumbsUp');
    },
    [canRate, applyReaction],
  );

  const messageActions = useMemo<MessageAction[]>(() => {
    const actions: MessageAction[] = [];
    if (isUser && onEditMessage) {
      actions.push({ key: 'edit', label: 'Edit Message', run: handleOpenEditModal });
    }
    if (isUser && onRetryMessage) {
      actions.push({
        key: 'resend',
        label: 'Resend',
        ...(rerunUnavailable ? { unavailableReason: rerunUnavailable } : {}),
        run: retryTurn,
      });
    }
    if (!isUser && onRetryMessage && !rowStreaming && !awaitingApproval) {
      actions.push({
        key: 'retry',
        label: 'Retry',
        ...(rerunUnavailable ? { unavailableReason: rerunUnavailable } : {}),
        run: retryTurn,
      });
    }
    if (isAssistant && onRetryWithModel && !rowStreaming && !awaitingApproval) {
      actions.push({
        key: 'retry-model',
        label: 'Retry with Another Model',
        ...(rerunUnavailable ? { unavailableReason: rerunUnavailable } : {}),
        run: retryWithModel,
      });
    }
    if (onBranch && !rowStreaming) {
      actions.push({
        key: 'branch',
        label: 'Branch Conversation from Here',
        run: () => onBranch(message.id),
      });
    }
    if (isUser && onScheduleMessage && message.content.trim()) {
      actions.push({
        key: 'schedule',
        label: 'Schedule as Task\u2026',
        run: () => onScheduleMessage(message.id),
      });
    }
    actions.push({
      key: 'copy',
      label: rowStreaming ? 'Copy Partial Response' : 'Copy Message',
      run: copyMessage,
    });
    if (displayContent.trim()) {
      actions.push({
        key: 'select-text',
        label: 'Select Text',
        run: () => setSelectTextVisible(true),
      });
    }
    if (isAssistant && !rowStreaming && message.content.trim()) {
      actions.push({ key: 'export', label: 'Export Message\u2026', run: handleShowExport });
    }
    if (isAssistant && !rowStreaming && displayContent.trim()) {
      actions.push({
        key: 'save-as-document',
        label: SAVE_ANSWER_AS_DOCUMENT_LABEL,
        run: saveAnswerAsDocument,
      });
    }
    if (canRate) {
      actions.push({
        key: 'good-response',
        label: reaction === 'thumbsUp' ? 'Remove Good Response' : 'Good Response',
        run: () => applyReaction('thumbsUp'),
      });
      actions.push({
        key: 'bad-response',
        label: reaction === 'thumbsDown' ? 'Remove Bad Response' : 'Bad Response',
        run: () => applyReaction('thumbsDown'),
      });
    }
    if (canReport) {
      actions.push({ key: 'report', label: 'Report\u2026', run: () => setReportVisible(true) });
    }
    if (onDeleteMessage && !rowStreaming) {
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
    rowStreaming,
    awaitingApproval,
    rerunUnavailable,
    displayContent,
    copyMessage,
    onEditMessage,
    onRetryMessage,
    onRetryWithModel,
    retryTurn,
    retryWithModel,
    onBranch,
    onScheduleMessage,
    onDeleteMessage,
    handleOpenEditModal,
    handleShowExport,
    saveAnswerAsDocument,
    confirmDeleteMessage,
    setSelectTextVisible,
    canRate,
    canReport,
    reaction,
    applyReaction,
    setReportVisible,
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
    const canRerun = !rerunUnavailable;
    const canRerunAnswer = canRerun && !rowStreaming && !awaitingApproval;
    if (isUser && onRetryMessage && canRerun) {
      actions.push({ name: 'resend', label: 'Resend message' });
    }
    if (isAssistant && onRetryMessage && canRerunAnswer) {
      actions.push({ name: 'retry', label: 'Retry' });
    }
    if (isAssistant && onRetryWithModel && canRerunAnswer) {
      actions.push({ name: 'retry-model', label: 'Retry with another model' });
    }
    if (onBranch && !rowStreaming) {
      actions.push({ name: 'branch', label: 'Branch conversation from here' });
    }
    if (isUser && onScheduleMessage && message.content.trim()) {
      actions.push({ name: 'schedule', label: 'Schedule as task' });
    }
    actions.push({ name: 'copy', label: rowStreaming ? 'Copy partial response' : 'Copy message' });
    if (displayContent.trim()) actions.push({ name: 'select-text', label: 'Select text' });
    if (isAssistant && !rowStreaming && message.content.trim()) {
      actions.push({ name: 'export', label: 'Export message' });
    }
    if (isAssistant && !rowStreaming && displayContent.trim()) {
      actions.push({ name: 'save-as-document', label: SAVE_ANSWER_AS_DOCUMENT_LABEL });
    }
    if (canRate) {
      actions.push({
        name: 'good-response',
        label: reaction === 'thumbsUp' ? 'Remove good response' : 'Good response',
      });
      actions.push({
        name: 'bad-response',
        label: reaction === 'thumbsDown' ? 'Remove bad response' : 'Bad response',
      });
    }
    if (canReport) actions.push({ name: 'report', label: 'Report' });
    if (onDeleteMessage && !rowStreaming) actions.push({ name: 'delete', label: 'Delete message' });
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
    onBranch,
    onScheduleMessage,
    onDeleteMessage,
    message.content,
    rowStreaming,
    awaitingApproval,
    rerunUnavailable,
    message.toolCalls,
    canonicalActivity,
    displayContent,
    canRate,
    canReport,
    reaction,
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
          copyMessage();
          break;
        case 'retry':
        case 'resend':
          retryTurn();
          break;
        case 'select-text':
          setSelectTextVisible(true);
          break;
        case 'retry-model':
          retryWithModel();
          break;
        case 'branch':
          onBranch?.(message.id);
          break;
        case 'schedule':
          onScheduleMessage?.(message.id);
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
        case 'save-as-document':
          saveAnswerAsDocument();
          break;
        case 'good-response':
          applyReaction('thumbsUp');
          break;
        case 'bad-response':
          applyReaction('thumbsDown');
          break;
        case 'report':
          setReportVisible(true);
          break;
        default:
          break;
      }
    },
    [
      message.id,
      message.toolCalls,
      copyMessage,
      setAccessibilityTool,
      retryTurn,
      retryWithModel,
      onBranch,
      onScheduleMessage,
      confirmDeleteMessage,
      handleOpenEditModal,
      handleShowExport,
      saveAnswerAsDocument,
      setSelectTextVisible,
      applyReaction,
      setReportVisible,
    ],
  );

  const isStreamingRow = message.isStreaming === true;
  const reconnecting = useChatExecutionStore((state) =>
    state.reconnectingMessageIds.includes(message.id),
  );
  const streamingLabel = reconnecting ? 'Reconnecting…' : undefined;
  const researchStatusLabel =
    isStreamingRow &&
    research &&
    !RESEARCH_SETTLED_PHASES.has(research.phase) &&
    !/\S/.test(displayContent)
      ? research.label || RESEARCH_PHASE_LABELS[research.phase]
      : undefined;
  const turnStatusLabel =
    streamingLabel ??
    researchStatusLabel ??
    (!isStreamingRow && liveRun === 'unknown' ? RUN_STATUS_UNAVAILABLE : undefined);
  const showStatusLine =
    isStreamingRow &&
    (!canonicalActivity ||
      (researchStatusLabel !== undefined && canonicalActivity.status !== 'running'));
  const finishReason = isAssistant ? message.metadata?.finishReason : undefined;
  const stoppedByUser = !isStreamingRow && isStoppedFinishReason(finishReason);
  const stoppedWithText = stoppedByUser && message.content.trim().length > 0;
  const showsAnswerRow = showsAnswerActions && (stoppedWithText || !stoppedByUser);
  const offersStreamFailureModelSwitch = Boolean(
    onSwitchModel && offersModelSwitch(getMessageStreamErrorCode(message)),
  );
  const usageLine = isAssistant && !isStreamingRow ? answerUsageLine(message.metadata) : null;
  const escalationLine = isAssistant && !isStreamingRow ? modelEscalationLine(message) : null;
  const [redactionNoticeDismissed, setRedactionNoticeDismissed] = useRecyclingState(false, [
    message.id,
  ]);
  const redactionNotice =
    isAssistant && !isStreamingRow && !redactionNoticeDismissed
      ? secretRedactionNotice(message.metadata)
      : null;
  const refusedAnswer =
    !isStreamingRow && typeof finishReason === 'string' && REFUSAL_FINISH_REASONS.has(finishReason);
  const quotedReply = isUser ? splitQuotedReply(displayContent) : null;
  const skillUsed = isUser ? sentSkillName(message.metadata) : null;
  const bodyContent = quotedReply ? quotedReply.body : displayContent;
  const inlineCitations = research ? researchSources : message.citations;
  const metadataSearchResults = message.metadata?.searchResults;
  const metadataCitations = message.metadata?.citations;
  const metadataSources = useMemo(
    () =>
      isAssistant
        ? collectMessageResearchSources({
            searchResults: metadataSearchResults as MessageResearchSourceMetadata['searchResults'],
            citations: metadataCitations as MessageResearchSourceMetadata['citations'],
          })
        : undefined,
    [isAssistant, metadataSearchResults, metadataCitations],
  );
  const hasResearch = Boolean(research);
  const turnHasSources =
    (metadataSources?.searchSources.length ?? 0) > 0 || (message.citations?.length ?? 0) > 0;
  const preparedAnswer = useMemo(() => {
    if (isUser) return { markdown: bodyContent, canLinkNumericCitations: true };
    const reconciled = reconcileCitationMarkersFromSourceList(bodyContent, inlineCitations ?? []);
    const withoutDuplicateSources =
      hasResearch || turnHasSources
        ? stripTrailingSourceList(reconciled.markdown)
        : reconciled.markdown;
    return {
      markdown: stripTrailingCitationOnlyBlock(withoutDuplicateSources),
      canLinkNumericCitations: reconciled.canLinkNumericCitations,
    };
  }, [isUser, bodyContent, inlineCitations, hasResearch, turnHasSources]);
  const answerCitations = preparedAnswer.canLinkNumericCitations ? inlineCitations : undefined;
  const answerShowsCitations = (answerCitations?.length ?? 0) > 0;
  const handleToggleReadAloud = useCallback(() => {
    if (speechScopeRef.current !== speechScope) return;
    const previous = speechRef.current;
    if (previous) {
      speechRef.current = null;
      void previous.stop().catch(() => undefined);
      setIsSpeaking(false);
      return;
    }
    const scope = speechScope;
    const ownerReason = readAloudOwnerReason(speechOwner);
    if (!speechOwner || ownerReason) {
      showToast(ownerReason ?? READ_ALOUD_UNAVAILABLE_REASON.preparing);
      return;
    }
    const spoken = answerShowsCitations ? withoutCitationMarkers(message.content) : message.content;
    const speech = speechOwner.start(spoken, {
      ...voiceOutput.speechOptionsFromSettings(),
      serverVoice: speechOwner.source?.scope === 'cloud',
    });
    speechRef.current = speech;
    setIsSpeaking(true);
    void speech.done.then((outcome) => {
      if (speechRef.current !== speech || speechScopeRef.current !== scope) return;
      speechRef.current = null;
      setIsSpeaking(false);
      if (outcome?.status === 'failed') showToast(READ_ALOUD_FAILED);
    });
  }, [speechOwner, speechScope, message.content, answerShowsCitations, setIsSpeaking]);
  const formatCardType = useMemo(
    () =>
      isAssistant && !isStreamingRow && !hasResearch
        ? answerFormatCardType(
            preparedAnswer.markdown,
            interactiveCards.map((card) => card.kind),
          )
        : null,
    [isAssistant, isStreamingRow, hasResearch, preparedAnswer.markdown, interactiveCards],
  );
  const trustedImageUrls = useMemo(() => {
    const unlinkedCitations = preparedAnswer.canLinkNumericCitations ? [] : (inlineCitations ?? []);
    const urls = [
      ...(metadataSources?.searchSources ?? []),
      ...(metadataSources?.citationsByMarker ?? []),
      ...unlinkedCitations,
    ].flatMap((source) => (source.url ? [source.url] : []));
    return urls.length > 0 ? [...new Set(urls)] : undefined;
  }, [metadataSources, preparedAnswer.canLinkNumericCitations, inlineCitations]);
  const revealInChat = useRevealInChat();
  const reportComplete = research?.phase === 'complete' && !isStreamingRow;
  const canJumpToSection = reportComplete && revealInChat !== null;
  const answerBodyRef = useRef<View>(null);
  const headingTops = useRef<{ messageId: string; tops: Map<string, number> }>({
    messageId: message.id,
    tops: new Map(),
  });
  const handleHeadingLayout = useCallback(
    (sectionId: string, y: number) => {
      if (headingTops.current.messageId !== message.id) {
        headingTops.current = { messageId: message.id, tops: new Map() };
      }
      headingTops.current.tops.set(sectionId, y);
    },
    [message.id],
  );
  const jumpToSection = useCallback(
    (sectionId: string) => {
      const { messageId, tops } = headingTops.current;
      const top = messageId === message.id ? tops.get(sectionId) : undefined;
      const body = answerBodyRef.current;
      if (top === undefined || !body || !revealInChat) return;
      const nextTops = [...tops.values()].filter((value) => value > top);
      revealInChat({
        measureInWindow: (done) =>
          body.measureInWindow((x, y, width, height) => {
            const end = nextTops.length > 0 ? Math.min(...nextTops) : height;
            done(x, y + top, width, Math.max(0, end - top));
          }),
      });
    },
    [message.id, revealInChat],
  );
  const contentElements = useMemo(() => {
    if (isUser) {
      return bodyContent
        ? [
            <Text
              key="user-text"
              testID="user-message-text"
              style={{ ...chatTypography.body, color: themeColors.textPrimary }}
            >
              {bodyContent}
            </Text>,
          ]
        : [];
    }
    const answerMarkdown =
      artifactCardSources.size > 0 || streamingArtifactCardShown
        ? withoutFencesShownAsCards(
            preparedAnswer.markdown,
            artifactCardSources,
            streamingArtifactCardShown,
          )
        : preparedAnswer.markdown;
    return renderMarkdownContent(answerMarkdown, themeColors, {
      highlightCode: !isStreamingRow,
      streaming: isStreamingRow,
      selectable: false,
      capCodeBlocks: true,
      ...(stoppedByUser ? { stopped: true } : {}),
      ...(answerCitations ? { citations: answerCitations } : {}),
      ...(trustedImageUrls ? { trustedImageUrls } : {}),
      ...(onFollowUp ? { onFollowUp } : {}),
      ...(canJumpToSection ? { onHeadingLayout: handleHeadingLayout } : {}),
    });
  }, [
    isUser,
    bodyContent,
    preparedAnswer.markdown,
    themeColors,
    isStreamingRow,
    artifactCardSources,
    streamingArtifactCardShown,
    stoppedByUser,
    answerCitations,
    trustedImageUrls,
    onFollowUp,
    canJumpToSection,
    handleHeadingLayout,
  ]);

  const producedNoVisibleOutput =
    !/\S/.test(displayContent.replace(/[\u200B\uFEFF]/g, '')) &&
    !message.imageUrl &&
    !message.videoUrl &&
    !message.isGeneratingImage &&
    !message.isGeneratingVideo &&
    (message.attachments?.length ?? 0) === 0 &&
    inlineArtifacts.length === 0;
  const searchNotice = isAssistant
    ? webSearchNoticeForMessage({
        message,
        activity: canonicalActivity,
        awaitingApproval,
        producedNoVisibleOutput,
        rendersResearchPlan: Boolean(research),
        hasStreamError: hasMessageStreamError(message),
        declinedSearch: endedByDecline,
        memoryCitationCount: memoryCitations?.count ?? 0,
        sourceCount: Math.max(
          metadataSources?.searchSources.length ?? 0,
          message.citations?.length ?? 0,
        ),
      })
    : null;

  const shownActivity =
    canonicalActivity && !(stoppedByUser && isPlaceholderOnlyActivity(canonicalActivity))
      ? canonicalActivity
      : undefined;
  const reasoningInActivity = Boolean(
    shownActivity && (shownActivity.entries.length > 0 || shownActivity.status !== 'completed'),
  );
  const plotsInActivity =
    !hasCodeExecutionResult &&
    codePlots.length > 0 &&
    finishedCodeStepId(shownActivity) !== undefined;
  const thinkingChip = hasReasoning ? (
    <ThinkingChip
      thinkingText={reasoningText ?? ''}
      isStreaming={message.isStreaming}
      duration={
        (message.metadata?.thinkingDuration ?? message.metadata?.thinkingDurationSeconds) as
          number | undefined
      }
      startedAtMs={message.metadata?.thinkingStartedAt as number | undefined}
      answerStarted={/\S/.test(displayContent)}
      activity={canonicalActivity}
      showPreview={reasoningInActivity}
    />
  ) : null;

  const imageWidth = Math.min(width - 80, 320);
  const createdAtParsed = Date.parse(message.createdAt);
  const createdAtMs = Number.isFinite(createdAtParsed) ? createdAtParsed : undefined;
  const imageAttachments = (message.attachments ?? []).filter((attachment) =>
    attachment.mimeType.startsWith('image/'),
  );
  const fileAttachments = (message.attachments ?? []).filter(
    (attachment) => !attachment.mimeType.startsWith('image/'),
  );
  const isGroupedMessage = !isAssistant && !canonicalActivity;

  const messageContent = (
    <Animated.View
      testID={isAssistant && message.isStreaming ? 'chat.message.assistant.streaming' : undefined}
      entering={
        reducedMotion || !arrivedNow ? undefined : FadeInDown.duration(motion.quick).springify()
      }
      className="px-4 py-4"
    >
      <PressableBox
        testID="chat.message.content"
        onLongPress={handleLongPress}
        delayLongPress={400}
        accessible={isGroupedMessage}
        focusable={isGroupedMessage}
        importantForAccessibility={isGroupedMessage ? 'auto' : 'no'}
        accessibilityLabel={
          isGroupedMessage
            ? `${isUser ? 'Your' : roleLabel} message: ${message.content?.slice(0, 100) || 'empty'}`
            : undefined
        }
        accessibilityHint={isGroupedMessage ? 'Double tap and hold for message actions' : undefined}
        accessibilityRole={isGroupedMessage ? 'text' : undefined}
        accessibilityActions={isGroupedMessage ? accessibilityActionsList : undefined}
        onAccessibilityAction={isGroupedMessage ? handleAccessibilityAction : undefined}
      >
        <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
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

          {isUser && message.queueFailed && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  backgroundColor: themeColors.dangerSurface,
                  paddingHorizontal: 5,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}
                accessibilityLabel="Message failed to send"
              >
                <TriangleAlert size={10} color={themeColors.agentError} />
                <Text style={{ fontSize: typeScale.caption, color: themeColors.agentError }}>
                  failed to send
                </Text>
              </View>
              {onRetryMessage ? (
                <PressableBox
                  onPress={retryTurn}
                  accessibilityRole="button"
                  accessibilityLabel="Retry sending this message"
                  hitSlop={10}
                  style={{ minHeight: 24, justifyContent: 'center', paddingHorizontal: 4 }}
                >
                  <Text
                    style={{
                      fontSize: typeScale.footnote,
                      fontWeight: '600',
                      color: themeColors.textPrimary,
                    }}
                  >
                    Retry
                  </Text>
                </PressableBox>
              ) : null}
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
            {imageAttachments.length > 0 ? (
              <View className="mt-1 flex-row flex-wrap gap-2">
                {imageAttachments.map((attachment) => (
                  <SentImageTile
                    key={`att-${attachment.url}`}
                    attachment={attachment}
                    onOpen={handleImagePress}
                    style={
                      isUser
                        ? {
                            width: Math.min(imageWidth, 200),
                            height: Math.min(imageWidth, 200),
                            borderRadius: radii.md,
                          }
                        : { width: imageWidth, height: imageWidth, borderRadius: radii.md }
                    }
                  />
                ))}
              </View>
            ) : null}

            {fileAttachments.length > 0 ? (
              <View className="gap-1 mt-2">
                {fileAttachments.map((attachment) => (
                  <SentFileChip
                    key={`file-att-${attachment.url}`}
                    attachment={attachment}
                    onOpen={setViewingAttachment}
                  />
                ))}
              </View>
            ) : null}

            {attachmentTruncationNotice ? (
              <Text
                accessibilityRole="text"
                style={{ marginTop: 4, fontSize: typeScale.caption, color: themeColors.textMuted }}
              >
                {attachmentTruncationNotice}
              </Text>
            ) : null}

            {sharedAttachmentNames ? (
              <Text
                testID="message-shared-attachments"
                accessibilityRole="text"
                style={{ marginTop: 4, fontSize: typeScale.caption, color: themeColors.textMuted }}
              >
                {`${SHARED_ATTACHMENTS_NOT_COPIED} ${sharedAttachmentNames}`}
              </Text>
            ) : null}

            {research ? (
              <ResearchRunCard
                research={research}
                messageId={message.id}
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

            {shownActivity ? (
              <RunningAgentActivityTimeline
                messageId={message.id}
                activity={shownActivity}
                onResolveApproval={handleResolveToolApproval}
                {...scopedApprovalProps}
                {...(message.toolCalls ? { approvalToolCalls: message.toolCalls } : {})}
                approvalExpired={approvalTurnExpired}
                onResendApproval={onRetryMessage ? retryTurn : undefined}
                {...(onRetryMessage && !rowStreaming && !conversationStreaming
                  ? { onRetry: retryTurn }
                  : {})}
                {...(turnStatusLabel ? { statusLabel: turnStatusLabel } : {})}
                statusUnavailable={!isStreamingRow && liveRun === 'unknown'}
                steerRunId={message.isStreaming ? steerRunId : undefined}
                codeRunConversationId={message.conversationId}
                reasoning={reasoningInActivity ? thinkingChip : undefined}
                artifacts={inlineArtifacts}
                onOpenArtifact={handleExpandArtifact}
                {...(plotsInActivity ? { codePlots } : {})}
              />
            ) : null}

            {reasoningInActivity ? null : thinkingChip}

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

            {isAssistant &&
            !canonicalActivity &&
            message.toolCalls &&
            message.toolCalls.length > 0 ? (
              <ToolCallTimeline
                messageId={message.id}
                toolCalls={message.toolCalls}
                summary={summarizeToolTimeline(message.toolCalls)}
                onResolveApproval={handleResolveToolApproval}
                {...scopedApprovalProps}
                approvalExpired={approvalTurnExpired}
                onResendApproval={onRetryMessage ? retryTurn : undefined}
                codeRunConversationId={message.conversationId}
              />
            ) : null}
            {isAssistant && (codeExecuting || codeExecutionResult) ? (
              <CodeExecutionBlock
                messageId={message.id}
                isExecuting={codeExecuting}
                {...(codeExecutionResult ? { result: codeExecutionResult, plots: codePlots } : {})}
              />
            ) : null}
            {connectRequests.map((request) => (
              <ConnectorConnectCard
                key={request.connectorId}
                request={request}
                {...(onRetryMessage ? { onRetryTurn: retryTurn } : {})}
              />
            ))}

            {isAssistant && interactiveCards.length > 0 ? (
              <InteractiveCardBlock
                cards={interactiveCards}
                tileBaseUrl={API_URL}
                canLoadManagedCloudTiles={appMode === 'cloud'}
                canRespond={
                  appMode === 'cloud' && message.isStreaming !== true && !conversationStreaming
                }
                onRespond={handleRespondToCard}
                messageId={message.id}
                conversationId={reportConversationId}
                placement="before-prose"
                assistantText={displayContent}
                {...(interactiveCardTextOffsets ? { textOffsets: interactiveCardTextOffsets } : {})}
                {...(onFollowUp ? { onSendMessage: onFollowUp } : {})}
              />
            ) : null}

            {contentElements.length > 0 ? (
              <View
                key={message.id}
                ref={answerBodyRef}
                collapsable={false}
                testID="message-answer-body"
              >
                <AssistantDraftScope
                  messageId={message.id}
                  {...(isAssistant ? { saveFenceEdit } : {})}
                >
                  {contentElements}
                </AssistantDraftScope>
                {formatCardType ? (
                  <MessageFormatCard
                    content={preparedAnswer.markdown}
                    cardType={formatCardType}
                    conversationId={message.conversationId}
                    messageId={message.id}
                  />
                ) : null}
                {showStatusLine && <StreamingIndicator label={turnStatusLabel} />}
              </View>
            ) : showStatusLine &&
              !message.isGeneratingImage &&
              !message.isGeneratingVideo &&
              !codeExecuting &&
              !codeExecutionResult ? (
              <StreamingIndicator
                label={
                  turnStatusLabel ??
                  (hasReasoning || research || message.toolCalls?.length ? undefined : 'Preparing')
                }
              />
            ) : null}

            {isAssistant && (message.isGeneratingImage || message.imageGenStatus === 'failed') && (
              <ImageGenProgress
                prompt={message.imageGenPrompt ?? message.content ?? 'Generating image…'}
                progress={message.imageGenProgress}
                status={message.imageGenStatus ?? 'generating'}
                errorMessage={message.imageGenError}
                width={imageWidth}
                {...(message.imageAspectRatio ? { aspectRatio: message.imageAspectRatio } : {})}
                {...(createdAtMs !== undefined ? { startedAt: createdAtMs } : {})}
                {...(message.imageGenRetryAt !== undefined
                  ? { retryAt: message.imageGenRetryAt }
                  : {})}
                onRetry={onRetryMessage ? handleRetryGeneration : undefined}
                onStop={message.isGeneratingImage ? handleStopImageGeneration : undefined}
              />
            )}

            {isAssistant && (message.type === 'image' || message.imageUrl) && message.imageUrl && (
              <GeneratedImage
                key={`${message.id}:${message.imageUrl}`}
                imageUrl={message.imageUrl}
                revisedPrompt={message.revisedPrompt}
                width={imageWidth}
                allowEphemeral={message.imageGenPersisted === false}
                {...(message.model ? { model: message.model } : {})}
                {...(message.imageAspectRatio ? { aspectRatio: message.imageAspectRatio } : {})}
                previousVersions={imageVersions}
                inTemporaryChat={inTemporaryChat}
                onPress={handleImagePress}
              />
            )}

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
                hitSlop={{ top: 6, bottom: 6 }}
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

            {isAssistant && (message.type === 'video' || message.videoUrl) && message.videoUrl && (
              <GeneratedVideo
                key={`${message.id}:${message.videoUrl}`}
                videoUrl={message.videoUrl}
                thumbnailUrl={message.videoThumbnailUrl}
                width={imageWidth}
                prompt={message.videoGenPrompt}
                reportTarget={{
                  messageId: message.id,
                  conversationId: reportConversationId,
                  contentExcerpt: message.videoGenPrompt ?? message.content,
                  asset: reportAssetFor('video', message.videoUrl),
                }}
              />
            )}

            {isAssistant &&
            message.imageGenPersisted === false &&
            typeof message.imageGenError === 'string' ? (
              <PressableBox
                onPress={onRetryMessage ? retryTurn : undefined}
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
                messageId={message.id}
                conversationId={reportConversationId}
                placement="after-prose"
                assistantText={displayContent}
                {...(interactiveCardTextOffsets ? { textOffsets: interactiveCardTextOffsets } : {})}
                {...(onFollowUp ? { onSendMessage: onFollowUp } : {})}
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
                <CloudRunInputForm
                  key={message.pendingToolInput.requestedAt}
                  pendingInput={message.pendingToolInput}
                  busy={conversationStreaming}
                  onSubmit={handleAnswerToolInput}
                  {...(toolInputSendError ? { sendError: toolInputSendError } : {})}
                />
              </View>
            ) : null}

            {isAssistant &&
            appMode === 'cloud' &&
            !message.pendingToolInput &&
            toolInputOutcome &&
            message.isStreaming !== true ? (
              message.answeredToolInput ? (
                <View
                  testID="chat.tool-input-answered"
                  style={{
                    marginTop: 8,
                    gap: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: themeColors.borderLight,
                    padding: 12,
                  }}
                >
                  <CloudRunInputForm
                    key={message.answeredToolInput.requestedAt}
                    pendingInput={message.answeredToolInput}
                    busy={false}
                    outcome={toolInputOutcome}
                  />
                </View>
              ) : (
                <Text
                  testID="chat.tool-input-outcome"
                  accessibilityLiveRegion="polite"
                  style={{
                    marginTop: 8,
                    fontSize: typeScale.caption,
                    color: themeColors.textMuted,
                  }}
                >
                  {TOOL_INPUT_OUTCOME_COPY[toolInputOutcome]}
                </Text>
              )
            ) : null}

            {reportComplete ? (
              <ResearchReportSections
                content={preparedAnswer.markdown}
                messageId={message.id}
                {...(canJumpToSection ? { onSelectSection: jumpToSection } : {})}
              />
            ) : null}

            {research && researchSources.length > 0 ? (
              <ResearchSourcesAppendix sources={researchSources} />
            ) : null}

            {isAssistant && !research && message.citations && message.citations.length > 0 ? (
              <CollapsibleSources
                sources={message.citations}
                {...(citedSourceCount !== undefined ? { citedCount: citedSourceCount } : {})}
                {...(sourcesQuery ? { query: sourcesQuery } : {})}
                partial={awaitingApproval}
                {...(message.metadata ? { metadata: message.metadata } : {})}
              />
            ) : null}

            {projectFileCitations.length > 0 && !message.isStreaming ? (
              <ProjectFileCitations citations={projectFileCitations} answerText={displayContent} />
            ) : null}

            {pastChatCitations.length > 0 && !message.isStreaming ? (
              <PastChatCitations citations={pastChatCitations} />
            ) : null}

            {awaitingApproval && !message.isStreaming ? (
              <TurnNotice
                icon={AlertCircle}
                message={
                  approvalTurnExpired
                    ? 'This response is partial. The approval request can no longer be resumed; send a new message to try again.'
                    : 'Waiting for approval. This response is partial; review the tool request to continue.'
                }
              />
            ) : null}

            {memoryCitations && !message.isStreaming ? (
              <MemoryUsedChip citations={memoryCitations} />
            ) : null}

            {searchNotice ? (
              <TurnNotice
                icon={AlertCircle}
                message={WEB_SEARCH_NOTICE_TEXT[searchNotice]}
                {...(onRetryMessage
                  ? {
                      actionLabel: WEB_SEARCH_NOTICE_ACTION[searchNotice].label,
                      actionAccessibilityLabel:
                        WEB_SEARCH_NOTICE_ACTION[searchNotice].accessibilityLabel,
                      onAction: retryTurn,
                    }
                  : {})}
              />
            ) : null}

            {isAssistant && cardArtifacts.length > 0 ? (
              <View style={{ gap: 4 }}>
                {cardArtifacts.map((artifact) => (
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
                offered={showsStreamingArtifact}
                isStreaming={Boolean(message.isStreaming)}
                failed={hasMessageStreamError(message) && !endedByDecline}
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
            {isAssistant &&
              !message.isStreaming &&
              hasMessageStreamError(message) &&
              !endedByDecline && (
                <PressableBox
                  onPress={onRetryMessage ? retryTurn : undefined}
                  disabled={!onRetryMessage}
                  accessibilityRole={onRetryMessage ? 'button' : 'text'}
                  accessibilityLabel={
                    onRetryMessage
                      ? `${streamFailureNoticeText(message)} Tap to try again.`
                      : streamFailureNoticeText(message)
                  }
                  style={{
                    gap: 6,
                    backgroundColor: themeColors.dangerSurface,
                    borderWidth: 1,
                    borderColor: themeColors.dangerBorder,
                    borderRadius: radii.md,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    marginTop: 4,
                    alignSelf: 'flex-start',
                    maxWidth: '100%',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                    <View style={{ paddingTop: 2 }}>
                      <AlertCircle size={13} color={themeColors.agentError} />
                    </View>
                    <Text
                      testID="stream-failure-notice-text"
                      style={{
                        flexShrink: 1,
                        fontSize: typeScale.caption,
                        color: themeColors.textSecondary,
                      }}
                    >
                      {streamFailureNoticeText(message)}
                    </Text>
                  </View>
                  {onRetryMessage || offersStreamFailureModelSwitch ? (
                    <View
                      testID="stream-failure-notice-actions"
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 12,
                        paddingLeft: 19,
                      }}
                    >
                      {onRetryMessage && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
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
                        </View>
                      )}
                      {offersStreamFailureModelSwitch && (
                        <PressableBox
                          onPress={switchModelFromBanner}
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
                    </View>
                  ) : null}
                </PressableBox>
              )}

            {stoppedByUser ? (
              <TurnNotice
                icon={Square}
                message="Response stopped."
                actionLabel={onRetryMessage && !stoppedWithText ? 'Try again' : undefined}
                actionAccessibilityLabel="Regenerate this response"
                onAction={onRetryMessage && !stoppedWithText ? retryTurn : undefined}
              />
            ) : null}

            {refusedAnswer ? (
              <TurnNotice
                icon={ShieldAlert}
                message="The model declined to finish this response for safety reasons. Rephrase your message, or try a different model."
                actionLabel={onSwitchModel ? 'Switch model' : undefined}
                actionAccessibilityLabel="Switch model"
                onAction={onSwitchModel ? switchModelFromBanner : undefined}
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

            {onContinueMessage && !isStreamingRow && !stoppedByUser ? (
              <PressableBox
                onPress={() => onContinueMessage(message.id)}
                accessibilityRole="button"
                accessibilityLabel="Continue generating this response"
                testID="continue-generating"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  alignSelf: 'flex-start',
                  gap: 6,
                  minHeight: 44,
                  marginTop: 6,
                  paddingHorizontal: 12,
                  borderRadius: radii.md,
                  borderWidth: 1,
                  borderColor: themeColors.border,
                  backgroundColor: themeColors.neutralSurface,
                }}
              >
                <ArrowRight size={14} color={themeColors.textPrimary} />
                <Text
                  style={{
                    fontSize: typeScale.footnote,
                    fontWeight: '600',
                    color: themeColors.textPrimary,
                  }}
                >
                  Continue generating
                </Text>
              </PressableBox>
            ) : null}

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

            {fallbackNotice ? (
              <View
                testID="message-fallback-notice"
                accessibilityRole="summary"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
              >
                <Text
                  style={{
                    flex: 1,
                    paddingHorizontal: 2,
                    fontSize: typeScale.caption,
                    color: themeColors.textSecondary,
                  }}
                >
                  {fallbackNotice}
                </Text>
                <PressableBox
                  onPress={() => setFallbackNoticeDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss model substitution notice"
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                >
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      fontWeight: '600',
                      color: themeColors.textPrimary,
                    }}
                  >
                    Dismiss
                  </Text>
                </PressableBox>
              </View>
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

            {escalationLine ? (
              <Text
                testID="model-escalation-receipt"
                style={{
                  marginTop: 2,
                  paddingHorizontal: 2,
                  fontSize: typeScale.caption,
                  color: themeColors.textMuted,
                }}
              >
                {escalationLine}
              </Text>
            ) : null}

            {redactionNotice ? (
              <View
                testID="secret-redaction-notice"
                accessibilityRole="summary"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
              >
                <Text
                  style={{
                    flex: 1,
                    paddingHorizontal: 2,
                    fontSize: typeScale.caption,
                    color: themeColors.textSecondary,
                  }}
                >
                  {redactionNotice}
                </Text>
                <PressableBox
                  onPress={() => setRedactionNoticeDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss secret redaction notice"
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                >
                  <Text
                    style={{
                      fontSize: typeScale.caption,
                      fontWeight: '600',
                      color: themeColors.textPrimary,
                    }}
                  >
                    Dismiss
                  </Text>
                </PressableBox>
              </View>
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
          </View>
        </View>
      </PressableBox>

      {isAssistant && !message.isStreaming && !showsAnswerRow && variant && onSelectVariant ? (
        <View style={{ alignItems: 'flex-start', paddingLeft: 10 }}>
          <VariantPager variant={variant} noun="response" onSelect={onSelectVariant} />
        </View>
      ) : null}

      {showsAnswerRow ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 2,
            paddingLeft: 10,
          }}
          accessibilityLabel="Message actions"
        >
          {variant && onSelectVariant ? (
            <VariantPager variant={variant} noun="response" onSelect={onSelectVariant} />
          ) : null}
          {message.content.trim() ? (
            <>
              <MessageActionButton
                label={copyControlLabel(copyStatus, 'Copy')}
                icon={
                  copyStatus === 'copied' ? Check : copyStatus === 'failed' ? TriangleAlert : Copy
                }
                onPress={copyMessage}
                color={
                  copyStatus === 'copied'
                    ? themeColors.agentSuccess
                    : copyStatus === 'failed'
                      ? themeColors.agentError
                      : themeColors.textMuted
                }
              />
              <MessageActionButton
                label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
                icon={isSpeaking ? Square : Volume2}
                onPress={handleToggleReadAloud}
                color={isSpeaking ? themeColors.teal : themeColors.textMuted}
                {...(readAloudUnavailable && !isSpeaking
                  ? { unavailableReason: readAloudUnavailable }
                  : {})}
              />
            </>
          ) : null}
          {onRetryMessage && !awaitingApproval ? (
            <MessageActionButton
              label="Regenerate response"
              icon={RefreshCw}
              onPress={retryTurn}
              color={themeColors.textMuted}
              {...(rerunUnavailable ? { unavailableReason: rerunUnavailable } : {})}
            />
          ) : null}
          <MessageActionButton
            label={`More message actions for ${roleLabel}`}
            icon={MoreHorizontal}
            onPress={handleLongPress}
            color={themeColors.textMuted}
            accessibilityActions={accessibilityActionsList}
            onAccessibilityAction={handleAccessibilityAction}
          />
        </View>
      ) : null}

      {isUser && variant && onSelectVariant ? (
        <View style={{ alignItems: 'flex-end', paddingRight: 10 }}>
          <VariantPager variant={variant} noun="version" onSelect={onSelectVariant} />
        </View>
      ) : null}

      <ArtifactFullScreen
        artifact={expandedArtifact}
        switchable={conversationArtifacts}
        onSwitch={setExpandedArtifact}
        visible={expandedArtifact !== null}
        onClose={handleCloseArtifact}
        onRegenerate={onRetryMessage ? retryTurn : undefined}
        conversationId={message.conversationId}
        messageId={message.id}
      />

      <FileViewerScreen source={viewingAttachment} onClose={() => setViewingAttachment(null)} />

      <ImageFullScreen
        key={`${message.id}:${fullScreenImageUrl}`}
        images={shownViewerImages}
        initialIndex={Math.max(
          0,
          shownViewerImages.findIndex((image) => image.url === fullScreenImageUrl),
        )}
        visible={fullScreenImageUrl !== null}
        onClose={handleCloseFullScreenImage}
        onEditArea={
          onEditImageArea && modelCanEditImage
            ? (edit) => {
                handleCloseFullScreenImage();
                onEditImageArea(message, edit);
              }
            : undefined
        }
        onEditImage={
          onEditImage && modelCanEditImage
            ? (edit) => {
                handleCloseFullScreenImage();
                onEditImage(message, edit);
              }
            : undefined
        }
        onDelete={isUser ? undefined : onDeleteImageConversation}
        deleteMessage="Deleting this image deletes the chat it was made in, with all of its messages."
        reportTarget={
          isAssistant && fullScreenImageUrl
            ? {
                messageId: message.id,
                conversationId: reportConversationId,
                contentExcerpt: message.revisedPrompt ?? message.content,
                asset: reportAssetFor('image', fullScreenImageUrl),
              }
            : undefined
        }
      />

      <ToolCallDetailsSheet tool={accessibilityTool} onClose={() => setAccessibilityTool(null)} />

      {isAssistant && (
        <FileExportButton
          content={message.content}
          title={message.model ? `${getDisplayName(message.model)} response` : undefined}
          visible={showExportSheet}
          onClose={handleCloseExport}
        />
      )}

      {canReport ? (
        <ReportSheet
          visible={reportVisible}
          onClose={() => setReportVisible(false)}
          title="Report this response"
          target={{
            messageId: message.id,
            conversationId: reportConversationId,
            contentExcerpt: message.content.trim()
              ? message.content
              : (message.revisedPrompt ?? message.videoGenPrompt ?? ''),
            ...(reportAsset
              ? { asset: reportAsset }
              : { subject: { kind: 'chat-message' as const, id: message.id } }),
          }}
        />
      ) : null}

      {canRate && onSubmitRatingDetails ? (
        <ResponseRatingDetails
          visible={ratingDetailsVisible}
          onSubmit={submitRatingDetails}
          onClose={() => setRatingDetailsVisible(false)}
        />
      ) : null}

      <MessageActionSheet
        visible={actionsVisible}
        sentAt={messageSentAtLabel(message.createdAt)}
        actions={messageActions}
        onSelect={handleSelectAction}
        onClose={handleCloseActions}
        onDismissed={handleActionsDismissed}
      />

      <SelectTextSheet
        visible={selectTextVisible}
        text={displayContent}
        verbatim={isUser}
        onClose={() => setSelectTextVisible(false)}
        onQuoteSelection={onQuoteSelection ? (text) => onQuoteSelection(message, text) : undefined}
      />

      <MessageEditModal
        visible={editModalVisible}
        text={editText}
        attachments={editModalVisible ? editAttachments : message.attachments}
        {...(editAttachmentsSupported ? { onRemoveAttachment: handleRemoveEditAttachment } : {})}
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
