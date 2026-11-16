import { Alert, AppState } from 'react-native';
import { create } from 'zustand';
import { TIMEOUTS } from '@/lib/constants';
import {
  QueueFullError,
  applyAgentActivityEvent,
  finishAgentActivityLocally,
  type AgentActivityState,
} from '@agiworkforce/client-runtime';
import { localGenerate } from '@agiworkforce/local-llm';
import { announceReplyReadyInBackground } from '@/services/replyReadyNotice';
import {
  keepLocalChatAttachments,
  resolveLocalChatAttachment,
  resolveLocalChatAttachmentUrl,
} from '@/services/localChatAttachments';
import { getMobileSendQueue } from '@/lib/sendQueue';
import { api, ApiPaywallError } from '@/services/api';
import {
  ApiFreeCapacityError,
  ApiHttpError,
  CloudCredentialUnavailableError,
  UPLOAD_ACCOUNT_UNCONFIRMED_MESSAGE,
} from '@/services/apiErrors';
import { withFailureReference } from '@/services/failureCopy';
import {
  buildAttachedDocumentContext,
  buildProjectSourceContext,
} from '@/services/attachmentContext';
import { getThermalState, recordPerfEvent } from '@/services/performanceMonitor';
import { startPeakMemorySampler } from '@/services/processFootprint';
import { resolveTurnEffort } from '@/src/features/chat/utils/turnEffort';
import { imageLimitRefusal } from '@/src/features/chat/utils/attachmentValidation';
import {
  freeCapacityErrorStateFromApiError,
  FREE_CAPACITY_BUSY_MESSAGE,
  type FreeCapacityErrorState,
} from '@/src/features/chat/utils/freeCapacityRecovery';
import {
  paywallActivityErrorFromApiError,
  paywallErrorStateFromApiError,
  type PaywallErrorState,
} from '@/src/features/chat/utils/paywallRecovery';
import {
  providerConsentErrorMessage,
  providerConsentErrorStateFromError,
  type ProviderConsentErrorState,
} from '@/src/features/chat/utils/providerConsentRecovery';
import {
  cancelMobileCloudAgentRun,
  streamChat,
  streamDeviceStepResume,
  streamToolInputResume,
  streamToolApprovalResume,
  type StreamCallbacks,
  type StreamDelta,
} from '@/services/streaming';
import {
  CONNECTION_LOST_FAILURE,
  StreamConnectionLostError,
} from '@/services/streamConnectionLost';
import type { InteractiveCard, InteractiveCardResponsePayload } from '@agiworkforce/types';
import {
  parseInteractiveCardDelta,
  parseGeneratedFilesDelta,
  readPersistedInteractiveCards,
  reconcileManagedCloudPublicText,
  resolveSurvivingLeaf,
  stampLinearParents,
  ManagedCloudAgentRunReferenceSchema,
  ManagedCloudAgentRunHttpError,
  isApprovingToolDecision,
  type ToolApprovalDecisionValue,
  type GeneratedFileWire,
  type ManagedCloudAgentRunReference,
  type ManagedCloudAgentRunInputAnswer,
  type FreeQuotaMessageContent,
  normalizePromotionalChatHistory,
  INTERACTIVE_CARD_RESPONSE_PATH,
} from '@agiworkforce/cloud-contracts';
import {
  createToolCallAccumulator,
  seedToolCallAccumulator,
  accumulateToolCallDelta,
  toolCallList,
} from '@/src/features/chat/utils/toolCallAccumulator';
import { getRemoteChatDisabledReason, RemoteChatDisabledError } from '@/services/remoteChatGate';
import { CloudProviderConsentRequiredError, ensureCloudSendConsent } from '@/services/llmGate';
import {
  PHONE_STEP_DECLINED,
  readPhoneDeviceStep,
  runPhoneDeviceStep,
  type PhoneDeviceStep,
  type PhoneStepOutcome,
} from '@/src/features/integrations/services/phoneDeviceSteps';
import { isPhoneStepTool, phoneStepNeedsConfirmation } from '@agiworkforce/types';
import {
  checkContentFilter,
  MINOR_SAFE_REFUSAL,
  REDUCED_SENSITIVE_CONTENT_REFUSAL,
} from '@/lib/contentFilter';
import { isMinorMode } from '@/src/features/auth/services/ageGate';
import { useAuthStore } from '@/src/features/auth/store';
import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  markLocalModelRefUsed,
  resolveLocalModelRef,
} from '@/src/features/model-picker/localModelRuntime';
import {
  DEFAULT_AUTO_MODE_ID,
  isCloudManagedModelId,
  isFreeQuotaTurnModelId,
  isSelectableModelId,
} from '@/src/features/model-picker/service';
import {
  cloudDispatchUnavailableMessage,
  resolveMobileCloudDispatch,
} from '@/src/features/chat/utils/cloudDispatchRouting';
import { useModelStore } from '@/src/features/model-picker/store';
import { useWaitlistStore } from '@/src/features/waitlist/store';
import {
  useTierStore,
  ensureCloudEntitlementsReadyForRequest,
  isCapabilityRequestable,
} from '@/src/features/billing/store';
import { useProjectStore } from '@/src/features/projects/store';
import { useAgentControlStore } from '@/stores/agentControlStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';
import {
  isResearchChosenFor,
  styleForConversation,
  useChatViewStore,
  type ChatMode,
  type ChatStyle,
} from './chatViewStore';
import {
  messageArtifactFromShared,
  offersMessageArtifact,
  type MessageArtifactScope,
} from './derivedMessageArtifact';
import { settleRunningSteps } from './conversationTurnState';
import { useOutputFormatStore } from '@/src/features/chat/store/outputFormatStore';
import { retrieveMemoryContext } from '@/src/features/memory/store';
import { buildPersonalContextBlocks } from '@/src/features/memory/services/personalContext';
import { retrievePastChatContext } from '@/src/features/memory/services/pastChatContext';
import {
  consolidateFactsFromTurn,
  shouldConsolidateMemoryOnClient,
} from '@/src/features/memory/services/consolidation';
import { useMemorySyncStateStore } from '@/stores/memory/memorySyncStateStore';
import {
  answerMemoryCommand,
  hasMemoryCommand,
} from '@/src/features/memory/services/memoryCommands';
import { recognizeText } from '@/src/features/image/services/ocr';
import { keepShownOrder } from './reconcileCloudMessages';
import {
  executionModeForConversation,
  executionModeForModel,
  providerForExecutionMode,
  type ConversationExecutionMode,
} from '@/src/features/chat/utils/conversationMode';
import {
  isThreadingCapableConversation,
  visibleThreadFor,
} from '@/src/features/chat/utils/conversationThread';
import {
  labelMobileSession,
  mobileExecutionProfileFor,
} from '@/src/features/chat/utils/sessionLabeling';
import type {
  ChatMessage,
  ConversationSummary,
  MessageAttachment,
  PendingToolInput,
  PendingToolInputCall,
  StatusStep,
  ToolCall,
  ToolSearchResult,
} from '@/types/chat';
import {
  RESPONSE_STYLE_GUIDANCE,
  getModelMetadataById,
  isAutoModeModelId,
  isTerminalToolStatus,
  messageKindForAgentEvent,
  type ResearchDeliverableSpec,
  type ResearchSourceRequest,
  type ResearchStep,
} from '@agiworkforce/types';
import {
  hasResearchSourceChoice,
  type ResearchPlanChoices,
} from '@/src/features/chat/utils/researchPlanChoices';
import {
  isResearchRunResumable,
  readResearchRunState,
  reduceResearchDelta,
  researchResumePayload,
  settleResearchRun,
  type ResearchRunState,
} from '@/src/features/chat/utils/researchRunState';
import type { CloudWorkMode } from '@agiworkforce/types';
import { buildAgiWorkGoalInput, type AgiWorkGoalInput } from '@/src/features/tasks/agiWorkGoal';
import {
  clarifyCardNeedsResume,
  MOBILE_INTERACTIVE_CARD_CAPABILITY,
  settledClarifyTurn,
} from '@/src/features/chat/utils/clarifyCard';
import {
  agiWorkPlanRetryMessage,
  parseAgiWorkPlanDelta,
  readAgiWorkPlanReview,
  readAgiWorkPlanSteps,
  type AgiWorkPlanDecision,
  type AgiWorkPlanReviewState,
  type AgiWorkPlanStep,
} from '@/src/features/chat/utils/agiWorkPlan';
import { useUploadLifecycleStore } from '@/src/features/chat/upload/uploadLifecycle';
import {
  unsentAttachmentMessage,
  uploadWithRetry,
} from '@/src/features/chat/upload/uploadAttachment';
import { isConversationTemporary } from '@/src/features/chat/upload/uploadContext';
import {
  agreeToCloudUploadAhead,
  confirmCloudUpload,
  takeCloudUploadAgreedAhead,
} from '@/src/features/chat/utils/cloudUploadConsent';
import { hasExplicitWebSearchIntent, isWebSearchAvailable } from '@agiworkforce/search';
import { codeExecutionResultFromDelta } from './codeExecutionResult';
import type { CodeExecutionResult } from '@agiworkforce/unified-chat/code-execution-result';
import { uuidv7 } from '@agiworkforce/utils/uuidv7';
import { isPastedTextFileName } from '@agiworkforce/utils/composer-paste';
import { markConversationForSync, markMessageForSync, syncNow } from '@/services/cloudSyncEngine';
import {
  CLOUD_RUN_CANCEL_ERROR,
  cancelCloudRun,
  describeCloudRunError,
} from '@/src/features/tasks/service';
import { managedCloudChat } from '@/services/managedCloudChat';
import { ManagedCloudChatHttpError } from '@agiworkforce/cloud-contracts';
import { getProviderOffering } from '@agiworkforce/types';
import {
  PROJECT_FILE_CITATIONS_METADATA_KEY,
  WEB_SEARCH_CITATION_DELTA_KEY,
} from '@agiworkforce/types';
import {
  nativeCitationFromDelta,
  turnSourceMetadata,
  turnSourcesWithActivity,
  type NativeCitation,
} from '@/src/features/chat/utils/messageSources';
import { createInlineCitationMarkers } from '@/src/features/chat/utils/inlineCitationMarkers';
import {
  ensureReadyFreeQuotaOffering,
  useFreeQuotaCatalogueStore,
} from '@/src/features/model-picker/freeQuotaCatalogue';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import type { ChatMessage as LocalLlmMessage } from '@agiworkforce/local-llm';
import { getConversationMessageStore } from './conversationRepository';
import { persistedAttachmentMetadata } from './messageAttachments';
import { ensureLocalSystemPrompt } from './localSystemPrompt';
import { useChatCloudMessageStore } from './chatCloudMessageStore';
import { deleteCloudMessagesRemote } from '@/src/features/chat/services/cloudMessageMutations';
import { readAgentActivityState } from '@/src/features/chat/utils/agentActivityState';
import {
  hasUnfinishedRun,
  isStoppedFinishReason,
  settledTurnActivity,
} from '@/src/features/chat/utils/agentActivity';
import {
  askWhetherTurnIsRunning,
  IN_FLIGHT_TURN_WAITING_MESSAGE,
  type InFlightTurnVerdict,
} from '@/src/features/chat/inFlightTurnRecovery';
import {
  EMPTY_RESPONSE_FAILURE,
  parseStreamFailure,
  turnProducedNothing,
  type StreamFailure,
} from '@/src/features/chat/utils/messageStreamError';
import { CONTINUE_GENERATION_INSTRUCTION } from '@agiworkforce/unified-chat/continue-generation';
import {
  replayToSendOptions,
  type SendReplayMetadataLike,
} from '@agiworkforce/unified-chat/regenerate-replay';
import { continuableCloudModel } from '@/src/features/chat/utils/continuableAnswer';
import {
  repairContinuationSeam,
  SEAM_INSPECTION_WINDOW,
} from '@agiworkforce/unified-chat/continuation-seam';
import type { MobileArtifactProvenance } from '@/src/features/artifacts/types';
import {
  generatedFileArtifactsFromWire,
  generatedFileMetadataFromWire,
  generatedFileWireFromMetadata,
  mergeDerivedAndGeneratedFileArtifacts,
} from '@/src/features/chat/utils/generatedFileArtifacts';
import { stripLeadingCurrentPromptEcho } from '@/src/features/chat/utils/assistantOutput';
import type { SkillTurnTools } from '@/src/features/skills/skillRequirements';
import { PAST_CHAT_CITATIONS_METADATA_KEY } from '@/src/features/chat/utils/referenceCitations';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

export interface SendMessageOptions {
  mode?: ChatMode;
  style?: ChatStyle;
  taskInstruction?: string;
  skillName?: string;
  skillTools?: SkillTurnTools;
  searchRequested?: boolean;
  onAccepted?: () => void;
  /**
   * Regenerate: answer this existing question again. No second question is
   * written, and the new answer becomes a sibling of the one already there.
   */
  regenerateParentMessageId?: string;
  /**
   * Edit: where the revised question hangs, copied from the question it
   * revises. `null` names the root sibling group and is not the same as absent,
   * which means this send is not branching at all.
   */
  branchParentId?: string | null;
  /**
   * Start this turn as an AGI Work run regardless of the composer's mode. The
   * plan entitlement still decides, an unentitled account falls back to chat.
   */
  workMode?: CloudWorkMode;
  agiWorkGoal?: AgiWorkGoalInput;
  agiWorkPlan?: string[];
  interactiveCardResume?: boolean;
  onRunStarted?: (runId: string) => void;
  /**
   * Resume a Deep Research run instead of starting a new plan: the sources and
   * steps already gathered, plus the steps the user approved. An empty
   * `approvedSteps` is what makes the server pause for plan approval again.
   */
  researchResume?: {
    sources: ToolSearchResult[];
    steps: ResearchStep[];
    approvedSteps: ResearchStep[];
    deliverable?: ResearchDeliverableSpec;
    guidance?: string;
  };
  researchSources?: ResearchSourceRequest;
  research?: boolean;
  retryOfMessageId?: string;
}

export type SendErrorRetry = { kind: 'resend' } | { kind: 'regenerate'; messageId: string };

interface DeferredSend {
  content: string;
  model: string;
  attachments?: Attachment[];
  options?: SendMessageOptions;
}

interface ExecutionState {
  isStreaming: boolean;
  streamingConversationIds: string[];
  reconnectingMessageIds: string[];
  toolInputSendErrors: Record<string, string>;
  streamingContent: string;
  streamingReasoning: string;
  error: string | null;
  failureCode: { message: string; code: string } | null;
  paywallError: PaywallErrorState | null;
  providerConsentError: ProviderConsentErrorState | null;
  freeCapacityError: FreeCapacityErrorState | null;
  errorConversationId: string | null;
  errorRetry: SendErrorRetry | null;
  retryAttempts: Record<string, number>;
  isEditing: boolean;

  sendMessage: (
    conversationId: string,
    content: string,
    model: string,
    attachments?: Attachment[],
    options?: SendMessageOptions,
  ) => Promise<boolean>;
  stopStreaming: () => void;
  retryMessage: (conversationId: string, messageId: string, modelOverride?: string) => void;
  resumeResearch: (
    conversationId: string,
    assistantMessageId: string,
    decision: 'start' | 'cancel' | 'retry',
    steps?: ResearchStep[],
    choices?: ResearchPlanChoices,
    answers?: string,
  ) => Promise<void>;
  editMessage: (
    conversationId: string,
    messageId: string,
    newContent: string,
    attachments?: MessageAttachment[],
  ) => boolean;
  clearError: () => void;
  clearErrorFor: (conversationId: string) => void;
  /** Clears a failure only when no conversation owns it, for the new-chat screen. */
  clearUnscopedError: () => void;
  setSendError: (
    message: string,
    scope?: { conversationId: string; retry?: SendErrorRetry | null },
  ) => void;
  clearPaywallError: () => void;
  setPaywallError: (paywallError: PaywallErrorState, conversationId?: string) => void;
  clearProviderConsentError: () => void;
  resolveToolApproval: (
    conversationId: string,
    assistantMessageId: string,
    toolCallId: string,
    decision: ToolApprovalDecisionValue,
    guidance?: string,
  ) => Promise<void>;
  continuePausedCloudTurn: (conversationId: string, assistantMessageId: string) => Promise<void>;
  continueCloudAnswer: (
    conversationId: string,
    assistantMessageId: string,
    turn?: InFlightTurnVerdict,
  ) => Promise<boolean>;
  answerToolInput: (
    conversationId: string,
    assistantMessageId: string,
    answers: ManagedCloudAgentRunInputAnswer[],
  ) => Promise<void>;
  respondToInteractiveCard: (
    conversationId: string,
    assistantMessageId: string,
    cardId: string,
    payload: InteractiveCardResponsePayload,
  ) => Promise<boolean>;
  resolveAgiWorkPlan: (
    conversationId: string,
    assistantMessageId: string,
    decision: AgiWorkPlanDecision,
  ) => Promise<void>;
}

// Exported so the composer can offer a download or a ready model against this
// exact failure instead of leaving the user with a dead Retry.
export const LOCAL_NO_MODEL_MESSAGE =
  'Local Mode is active, but no on-device model is ready yet. Open Models to download or select a local model.';

const abortControllers = new Map<string, AbortController>();
const MAX_ABORT_CONTROLLERS = 50;
const MAX_DEFERRED_SENDS = 5;
const CLOUD_CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deferredSends = new Map<string, DeferredSend[]>();
const streamingConversations = new Set<string>();
const cloudStreamingConversations = new Set<string>();
const cloudRunChecks = new Set<string>();
let cloudExecutionGeneration = 0;
const activeCloudRuns = new Map<string, ManagedCloudAgentRunReference>();

interface PendingApprovalCall {
  toolCallId: string;
  name: string;
  deviceStep?: PhoneDeviceStep;
}

interface PendingApprovalTurn {
  runId: string;
  conversationId: string;
  calls: PendingApprovalCall[];
  decisions: Map<string, ToolApprovalDecisionValue>;
  guidance: Map<string, string>;
  resolving: boolean;
  deviceResults?: Map<string, PhoneStepOutcome>;
  deviceStarted?: Set<string>;
  resultsUndelivered?: boolean;
  inputAnswers?: ManagedCloudAgentRunInputAnswer[];
  pausedInput?: PendingToolInput;
  expired?: boolean;
}

const pendingApprovalTurns = new Map<string, PendingApprovalTurn>();
const SHARED_PAGE_URL = /\bhttps?:\/\/[^\s<>"]+/i;
const TERMINAL_RESUME_STATUSES = new Set([404, 409, 410]);

function isTerminalResumeError(error: unknown): boolean {
  return error instanceof ApiHttpError && TERMINAL_RESUME_STATUSES.has(error.status);
}

const INACTIVE_INPUT_STATUSES = new Set([404, 410]);
const INACTIVE_INPUT_MESSAGE = 'This request is no longer active.';
const INPUT_SEND_FAILED = 'Could not send your answer. Check your connection and try again.';
export const CLOUD_RESUME_SIGN_IN = 'Sign in to resume this AGI Cloud task.';

function setToolInputSendError(messageId: string, error: string | null): void {
  useChatExecutionStore.setState((state) => {
    if ((state.toolInputSendErrors[messageId] ?? null) === error) return {};
    const { [messageId]: _previous, ...rest } = state.toolInputSendErrors;
    return { toolInputSendErrors: error === null ? rest : { ...rest, [messageId]: error } };
  });
}

function inactiveInputReason(error: unknown): string | null {
  return error instanceof ApiHttpError && INACTIVE_INPUT_STATUSES.has(error.status)
    ? error.message
    : null;
}

function recordToolInputRequest(calls: PendingToolInputCall[], delta: StreamDelta): void {
  const request = delta.x_tool_input_request;
  if (!request) return;
  const call: PendingToolInputCall = {
    toolCallId: request.tool_call_id,
    name: request.name,
    connectorId: request.connector_id ?? '',
    round: request.round ?? 0,
    inputRequests: request.input_requests,
  };
  const known = calls.findIndex((entry) => entry.toolCallId === call.toolCallId);
  if (known >= 0) calls[known] = call;
  else calls.push(call);
}

// The answered form stays on screen until the run accepts the answers, so a
// failed send gives the person back what they typed.
function withoutAnsweredInput(message: ChatMessage, turn: PendingApprovalTurn): ChatMessage {
  if (turn.inputAnswers === undefined || message.pendingToolInput === undefined) return message;
  const { pendingToolInput: answered, ...rest } = message;
  return withToolInputOutcome({ ...rest, answeredToolInput: answered }, 'sent');
}

export type ToolInputOutcome = 'sent' | 'expired';

function withToolInputOutcome(message: ChatMessage, outcome: ToolInputOutcome): ChatMessage {
  return { ...message, metadata: { ...message.metadata, toolInputOutcome: outcome } };
}

// streamingContent is one value for every chat that streams, so a failing turn
// keeps the text its own row received rather than whatever streamed last.
function turnContentOf(messages: readonly ChatMessage[], messageId: string): string {
  return messages.find((message) => message.id === messageId)?.content ?? '';
}

function storedNativeCitations(metadata: ChatMessage['metadata']): NativeCitation[] {
  const stored = (metadata as Record<string, unknown> | undefined)?.['citations'];
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((entry) => {
    const citation = nativeCitationFromDelta(entry);
    return citation ? [citation] : [];
  });
}

function pendingToolInputPatch(
  runId: string | undefined,
  calls: PendingToolInputCall[],
): { pendingToolInput?: PendingToolInput } {
  return runId && calls.length > 0
    ? { pendingToolInput: { runId, requestedAt: new Date().toISOString(), toolCalls: [...calls] } }
    : {};
}

function pendingPhoneSteps(calls: PendingApprovalCall[]): PhoneDeviceStep[] {
  return calls.flatMap((call) => (call.deviceStep ? [call.deviceStep] : []));
}

function storedPhoneSteps(metadata: ChatMessage['metadata']): Map<string, PhoneDeviceStep> {
  const raw = (metadata as Record<string, unknown> | undefined)?.['phoneDeviceSteps'];
  const steps = new Map<string, PhoneDeviceStep>();
  if (!Array.isArray(raw)) return steps;
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const step = entry as Record<string, unknown>;
    if (
      typeof step['toolCallId'] === 'string' &&
      typeof step['name'] === 'string' &&
      typeof step['deviceId'] === 'string' &&
      typeof step['input'] === 'object' &&
      step['input'] !== null &&
      isPhoneStepTool(step['name'])
    ) {
      steps.set(step['toolCallId'], {
        toolCallId: step['toolCallId'],
        name: step['name'],
        deviceId: step['deviceId'],
        input: step['input'] as Record<string, unknown>,
      });
    }
  }
  return steps;
}
const interactiveCardResponsesInFlight = new Set<string>();
const agiWorkPlanDecisionsInFlight = new Set<string>();

function pausedTurn(
  runId: string,
  conversationId: string,
  calls: PendingApprovalCall[],
): PendingApprovalTurn {
  return {
    runId,
    conversationId,
    calls,
    decisions: new Map(),
    guidance: new Map(),
    resolving: false,
    ...(calls.some((call) => call.deviceStep)
      ? { deviceResults: new Map(), deviceStarted: new Set() }
      : {}),
  };
}

function trackPhoneDeviceStep(calls: PendingApprovalCall[], delta: StreamDelta): void {
  const step = readPhoneDeviceStep(delta.x_agent_event);
  if (!step || calls.some((call) => call.toolCallId === step.toolCallId)) return;
  calls.push({ toolCallId: step.toolCallId, name: step.name, deviceStep: step });
}

function patchPausedToolCall(
  conversationId: string,
  assistantMessageId: string,
  toolCallId: string,
  patch: Partial<ToolCall>,
): void {
  const msgStore = getConversationMessageStore(conversationId);
  msgStore.setState((s) => ({
    messages: {
      ...s.messages,
      [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
        m.id === assistantMessageId
          ? {
              ...m,
              toolCalls: (m.toolCalls ?? []).map((t) =>
                t.toolCallId === toolCallId ? { ...t, ...patch } : t,
              ),
            }
          : m,
      ),
    },
  }));
  pushCloudAssistantUpdate(
    conversationId,
    msgStore.getState().messages[conversationId] ?? [],
    assistantMessageId,
  );
}

function resumePausedTurn(
  turn: PendingApprovalTurn,
  resumeCallbacks: StreamCallbacks,
  signal: AbortSignal,
  afterSequence: number,
): Promise<void> {
  let trackedRunId: string | null = null;
  const release = () => {
    if (trackedRunId && activeCloudRuns.get(turn.conversationId)?.runId === trackedRunId) {
      activeCloudRuns.delete(turn.conversationId);
    }
  };
  const callbacks: StreamCallbacks = {
    ...resumeCallbacks,
    onRunReference: (reference) => {
      if (!signal.aborted) {
        trackedRunId = reference.runId;
        activeCloudRuns.set(turn.conversationId, reference);
      }
      resumeCallbacks.onRunReference?.(reference);
    },
    onDone: () => {
      release();
      resumeCallbacks.onDone();
    },
    onError: (error) => {
      release();
      resumeCallbacks.onError(error);
    },
  };
  const operationId = uuidv7();
  if (turn.inputAnswers) {
    return streamToolInputResume(
      {
        run_id: turn.runId,
        operationId,
        tool_inputs: turn.inputAnswers.map((answer) => ({
          tool_call_id: answer.toolCallId,
          input_responses: answer.responses,
        })),
      },
      callbacks,
      signal,
      { afterSequence },
    );
  }
  const deviceResults = turn.deviceResults;
  if (deviceResults) {
    return streamDeviceStepResume(
      {
        run_id: turn.runId,
        operationId,
        device_id: turn.calls.find((call) => call.deviceStep)?.deviceStep?.deviceId ?? '',
        device_results: turn.calls.map((call) => {
          const outcome = deviceResults.get(call.toolCallId) ?? PHONE_STEP_DECLINED;
          return {
            tool_call_id: call.toolCallId,
            content: outcome.content,
            is_error: outcome.isError,
          };
        }),
      },
      callbacks,
      signal,
      { afterSequence },
    );
  }
  const guidance = turn.calls
    .map((call) => turn.guidance.get(call.toolCallId))
    .filter(Boolean)
    .join('\n\n');
  return streamToolApprovalResume(
    {
      run_id: turn.runId,
      operationId,
      tool_approvals: turn.calls.map((call) => ({
        tool_call_id: call.toolCallId,
        decision: turn.decisions.get(call.toolCallId) ?? 'rejected',
      })),
      ...(guidance ? { guidance } : {}),
    },
    callbacks,
    signal,
    { afterSequence },
  );
}

async function settlePhoneDeviceSteps(
  conversationId: string,
  assistantMessageId: string,
): Promise<void> {
  const turn = pendingApprovalTurns.get(assistantMessageId);
  if (!turn?.deviceResults || !turn.deviceStarted || turn.resolving || turn.resultsUndelivered) {
    return;
  }
  for (const call of turn.calls) {
    if (!call.deviceStep || turn.deviceStarted.has(call.toolCallId)) continue;
    const decision = turn.decisions.get(call.toolCallId);
    if (phoneStepNeedsConfirmation(call.name, call.deviceStep.input) && !decision) continue;
    turn.deviceStarted.add(call.toolCallId);
    patchPausedToolCall(conversationId, assistantMessageId, call.toolCallId, {
      status: 'running',
      requiresApproval: false,
    });
    const generation = cloudExecutionGeneration;
    const outcome =
      decision === 'rejected' ? PHONE_STEP_DECLINED : await runPhoneDeviceStep(call.deviceStep);
    const finished: Partial<ToolCall> = {
      status: outcome.isError ? 'failed' : 'succeeded',
      output: outcome.content,
    };
    if (pendingApprovalTurns.get(assistantMessageId) !== turn) {
      if (turn.expired && generation === cloudExecutionGeneration) {
        patchPausedToolCall(conversationId, assistantMessageId, call.toolCallId, finished);
      }
      return;
    }
    turn.deviceResults.set(call.toolCallId, outcome);
    patchPausedToolCall(conversationId, assistantMessageId, call.toolCallId, finished);
  }
  if (turn.resolving || turn.deviceResults.size < turn.calls.length) return;
  turn.resolving = true;
  await useChatExecutionStore
    .getState()
    .continuePausedCloudTurn(conversationId, assistantMessageId);
}

export function isApprovalTurnLive(assistantMessageId: string): boolean {
  if (pendingApprovalTurns.has(assistantMessageId)) return true;

  const cloudState = useChatCloudMessageStore.getState();
  for (const [conversationId, messages] of Object.entries(cloudState.messages)) {
    const message = messages.find((candidate) => candidate.id === assistantMessageId);
    if (!message) continue;

    const runReference = ManagedCloudAgentRunReferenceSchema.safeParse(
      message.metadata?.cloudAgentRun,
    );
    const calls = (message.toolCalls ?? [])
      .filter(
        (call): call is ToolCall & { toolCallId: string } =>
          call.requiresApproval === true && typeof call.toolCallId === 'string',
      )
      .map((call) => ({ toolCallId: call.toolCallId, name: call.name }));
    const phoneSteps = storedPhoneSteps(message.metadata);
    const allPhoneStepsFinished =
      phoneSteps.size > 0 &&
      message.isStreaming !== true &&
      [...phoneSteps.keys()].every((toolCallId) =>
        (message.toolCalls ?? []).some(
          (call) =>
            call.toolCallId === toolCallId &&
            (call.status === 'succeeded' || call.status === 'failed'),
        ),
      );
    if (!runReference.success || (calls.length === 0 && !allPhoneStepsFinished)) return false;
    if (calls.some((call) => isPhoneStepTool(call.name) && !phoneSteps.has(call.toolCallId))) {
      return false;
    }

    const pausedIds = new Set([...calls.map((call) => call.toolCallId), ...phoneSteps.keys()]);
    const decisions = new Map<string, ToolApprovalDecisionValue>();
    const guidance = new Map<string, string>();
    for (const call of message.toolCalls ?? []) {
      if (!call.toolCallId || !pausedIds.has(call.toolCallId)) continue;
      if (call.approvalDecision) {
        decisions.set(
          call.toolCallId,
          call.approvalDecision === 'approved' && call.approvalScope
            ? call.approvalScope
            : call.approvalDecision,
        );
      }
      if (call.approvalGuidance) {
        guidance.set(call.toolCallId, call.approvalGuidance);
      }
    }
    if (phoneSteps.size > 0) {
      const toolCalls = message.toolCalls ?? [];
      const turn = pausedTurn(runReference.data.runId, conversationId, [
        ...calls.filter((call) => !phoneSteps.has(call.toolCallId)),
        ...[...phoneSteps.values()].map((step) => ({
          toolCallId: step.toolCallId,
          name: step.name,
          deviceStep: step,
        })),
      ]);
      for (const [toolCallId, decision] of decisions) turn.decisions.set(toolCallId, decision);
      for (const [toolCallId, note] of guidance) turn.guidance.set(toolCallId, note);
      for (const call of toolCalls) {
        if (!call.toolCallId || !phoneSteps.has(call.toolCallId)) continue;
        if (call.status !== 'succeeded' && call.status !== 'failed') continue;
        turn.deviceStarted?.add(call.toolCallId);
        turn.deviceResults?.set(call.toolCallId, {
          content: typeof call.output === 'string' ? call.output : '',
          isError: call.status === 'failed',
        });
      }
      turn.resultsUndelivered = turn.deviceResults?.size === turn.calls.length;
      pendingApprovalTurns.set(assistantMessageId, turn);
      return true;
    }
    pendingApprovalTurns.set(assistantMessageId, {
      runId: runReference.data.runId,
      conversationId,
      calls,
      decisions,
      guidance,
      resolving: false,
    });
    return true;
  }
  return false;
}

function expiredPausedTurn(
  message: ChatMessage,
  turn: PendingApprovalTurn | undefined,
): ChatMessage {
  const checkpointIds = new Set(
    turn && turn.inputAnswers === undefined
      ? turn.calls
          .map((call) => call.toolCallId)
          .filter((toolCallId) => !turn.deviceStarted?.has(toolCallId))
      : [],
  );
  let expired = message;
  if (message.pendingToolInput !== undefined) {
    if (turn?.inputAnswers !== undefined) {
      expired = withToolInputOutcome(withoutAnsweredInput(message, turn), 'expired');
    } else {
      const { pendingToolInput: unanswered, ...rest } = message;
      expired = withToolInputOutcome({ ...rest, answeredToolInput: unanswered }, 'expired');
    }
  }
  return {
    ...expired,
    toolCalls: expired.toolCalls?.map((tool) =>
      tool.toolCallId && (tool.requiresApproval === true || checkpointIds.has(tool.toolCallId))
        ? {
            ...tool,
            status: 'awaiting-approval' as const,
            requiresApproval: false,
            approvalDecision: undefined,
            output: undefined,
          }
        : tool,
    ),
    metadata: { ...expired.metadata, phoneDeviceSteps: undefined },
  };
}

function expirePausedTurns(conversationId: string, assistantMessageIds: readonly string[]): void {
  const expiring = new Map(assistantMessageIds.map((id) => [id, pendingApprovalTurns.get(id)]));
  for (const turn of expiring.values()) if (turn) turn.expired = true;
  for (const id of assistantMessageIds) pendingApprovalTurns.delete(id);
  const msgStore = getConversationMessageStore(conversationId);
  const updated = (msgStore.getState().messages[conversationId] ?? []).map((message) =>
    expiring.has(message.id) ? expiredPausedTurn(message, expiring.get(message.id)) : message,
  );
  msgStore.setState((s) => ({ messages: { ...s.messages, [conversationId]: updated } }));
  for (const id of assistantMessageIds) pushCloudAssistantUpdate(conversationId, updated, id);
}

// A paused request belongs to the newest turn only. Answering it after a newer
// turn has started would stream its continuation above, or into, that turn.
function expireIfSuperseded(conversationId: string, assistantMessageId: string): boolean {
  const messages = getConversationMessageStore(conversationId).getState().messages[conversationId];
  const index = messages?.findIndex((message) => message.id === assistantMessageId) ?? -1;
  const newerTurn =
    index >= 0 &&
    messages!
      .slice(index + 1)
      .some((message) => message.role === 'user' || message.role === 'assistant');
  if (
    !newerTurn &&
    !abortControllers.has(conversationId) &&
    !streamingConversations.has(conversationId)
  ) {
    return false;
  }
  expirePausedTurns(conversationId, [assistantMessageId]);
  return true;
}

function expirePausedTurnsBefore(conversationId: string, newerMessageId: string): void {
  const messages = getConversationMessageStore(conversationId).getState().messages[conversationId];
  const boundary = messages?.findIndex((message) => message.id === newerMessageId) ?? -1;
  if (boundary <= 0) return;
  const paused = messages!
    .slice(0, boundary)
    .filter(
      (message) =>
        message.role === 'assistant' &&
        pendingApprovalTurns.get(message.id)?.resolving !== true &&
        (message.pendingToolInput !== undefined ||
          ((pendingApprovalTurns.has(message.id) ||
            message.toolCalls?.some((tool) => tool.requiresApproval === true) ||
            storedPhoneSteps(message.metadata).size > 0) &&
            isApprovalTurnLive(message.id))),
    )
    .map((message) => message.id);
  if (paused.length > 0) expirePausedTurns(conversationId, paused);
}

function undeliveredDeviceTurn(assistantMessageId: string): PendingApprovalTurn | null {
  if (!isApprovalTurnLive(assistantMessageId)) return null;
  const turn = pendingApprovalTurns.get(assistantMessageId);
  return turn?.deviceResults && turn.resultsUndelivered && !turn.resolving ? turn : null;
}

export function __resetPendingApprovalTurnsForTests(): void {
  pendingApprovalTurns.clear();
  activeCloudRuns.clear();
  cloudStreamingConversations.clear();
}

export function clearCloudExecutionState(): void {
  cloudExecutionGeneration += 1;
  const cloudConversationIds = Array.from(cloudStreamingConversations);
  for (const conversationId of cloudConversationIds) {
    cloudStreamingConversations.delete(conversationId);
    streamingConversations.delete(conversationId);
    activeCloudRuns.delete(conversationId);
    cancelledBeforeStream.delete(conversationId);
    stalledConversations.delete(conversationId);
    deferredSends.delete(conversationId);
    thinkingStartTimes.delete(conversationId);
    thinkingEndTimes.delete(conversationId);
    lastDeltaTimes.delete(conversationId);
    const controller = abortControllers.get(conversationId);
    abortControllers.delete(conversationId);
    controller?.abort();
  }
  pendingApprovalTurns.clear();
  modelShownAtBannerSwitch.clear();
  useChatExecutionStore.setState({
    ...streamingFlags(),
    isEditing: false,
    ...(streamingConversations.size === 0
      ? { streamingContent: '', streamingReasoning: '', ...NO_FAILURE, errorConversationId: null }
      : {}),
  });
}

const FAILURE_FIELDS = [
  'error',
  'failureCode',
  'paywallError',
  'providerConsentError',
  'freeCapacityError',
] as const;
type FailureField = (typeof FAILURE_FIELDS)[number];
const NO_FAILURE: Pick<ExecutionState, FailureField | 'errorRetry'> = {
  error: null,
  failureCode: null,
  paywallError: null,
  providerConsentError: null,
  freeCapacityError: null,
  errorRetry: null,
};

type ExecutionStateWrite =
  Partial<ExecutionState> | ((state: ExecutionState) => Partial<ExecutionState>);

// A failure belongs to the conversation whose action raised it: another
// conversation never shows it, never clears it and never retries it.
function scopeFailureWrite(
  state: ExecutionState,
  partial: Partial<ExecutionState>,
  conversationId: string,
  retry: SendErrorRetry | null,
): Partial<ExecutionState> {
  const written = FAILURE_FIELDS.filter((field) => field in partial);
  if (written.length === 0) return partial;
  if (written.some((field) => partial[field] != null)) {
    return {
      ...(state.errorConversationId === conversationId ? {} : NO_FAILURE),
      ...partial,
      ...('error' in partial ? { errorRetry: partial.error == null ? null : retry } : {}),
      errorConversationId: conversationId,
    };
  }
  if (state.errorConversationId !== null && state.errorConversationId !== conversationId) {
    const kept: Partial<ExecutionState> = { ...partial };
    for (const field of written) delete kept[field];
    return kept;
  }
  const next = { ...state, ...partial };
  return {
    ...partial,
    ...('error' in partial ? { errorRetry: null } : {}),
    ...(FAILURE_FIELDS.every((field) => next[field] == null) ? { errorConversationId: null } : {}),
  };
}

function failureScopedSet(
  conversationId: string,
  retry: () => SendErrorRetry | null = () => null,
): (write: ExecutionStateWrite) => void {
  return (write) =>
    useChatExecutionStore.setState((state) =>
      scopeFailureWrite(
        state,
        typeof write === 'function' ? write(state) : write,
        conversationId,
        retry(),
      ),
    );
}

function currentConversationScope(): string | null {
  return getMsgStore().getState().currentConversationId ?? null;
}

function markReconnecting(
  set: (update: (state: ExecutionState) => Partial<ExecutionState>) => void,
  messageId: string,
  reconnecting: boolean,
): void {
  set((state) => {
    const listed = state.reconnectingMessageIds.includes(messageId);
    if (listed === reconnecting) return {};
    return {
      reconnectingMessageIds: reconnecting
        ? [...state.reconnectingMessageIds, messageId]
        : state.reconnectingMessageIds.filter((id) => id !== messageId),
    };
  });
}

function streamingFlags(): { isStreaming: boolean; streamingConversationIds: string[] } {
  return {
    isStreaming: streamingConversations.size > 0,
    streamingConversationIds: Array.from(streamingConversations),
  };
}

// A turn cut off here was not finished by the model, so its row settles as
// stopped and offers Try again instead of reading as a complete answer.
const stalledConversations = new Set<string>();

AppState.addEventListener('change', (nextState) => {
  if (nextState === 'background') {
    useUploadLifecycleStore.getState().markBackgrounded();
    return;
  }
  if (nextState !== 'active') return;
  const now = Date.now();
  for (const cid of Array.from(streamingConversations)) {
    const last = lastDeltaTimes.get(cid) ?? 0;
    if (now - last > TIMEOUTS.STREAM_STALL && !activeCloudRuns.has(cid)) {
      const controller = abortControllers.get(cid);
      if (!controller) continue;
      stalledConversations.add(cid);
      controller.abort();
    }
  }
});
const cancelledBeforeStream = new Set<string>();
const MAX_RETRY_ATTEMPTS = 3;
const modelShownAtBannerSwitch = new Map<string, string>();

export function noteBannerModelSwitch(conversationId: string): void {
  modelShownAtBannerSwitch.set(conversationId, useModelStore.getState().selectedModel);
}

function takeBannerModelChoice(conversationId: string): string | undefined {
  const shownBefore = modelShownAtBannerSwitch.get(conversationId);
  if (shownBefore === undefined) return undefined;
  const chosen = useModelStore.getState().selectedModel;
  return chosen && chosen !== shownBefore ? chosen : undefined;
}
const thinkingStartTimes = new Map<string, number>();
const thinkingEndTimes = new Map<string, number>();
const lastDeltaTimes = new Map<string, number>();

const CHAT_MODE_PROMPTS: Record<ChatMode, string | null> = {
  chat: null,
  research:
    'Mode: Research. Give careful analysis, note uncertainty, and do not claim live web access unless a web-search tool is actually available in this turn.',
  create:
    'Mode: Create. Produce usable drafts, code, plans, or structured outputs with clear next steps.',
};

const CHAT_STYLE_OVERRIDE = 'Use this style in this chat over any saved response style.';

const CHAT_STYLE_PROMPTS: Record<ChatStyle, string | null> = {
  normal: null,
  concise: `Style: Concise. ${RESPONSE_STYLE_GUIDANCE.concise} ${CHAT_STYLE_OVERRIDE}`,
  explanatory: `Style: Explanatory. ${RESPONSE_STYLE_GUIDANCE.explanatory} ${CHAT_STYLE_OVERRIDE}`,
  learning: `Style: Learning. ${RESPONSE_STYLE_GUIDANCE.learning} ${CHAT_STYLE_OVERRIDE}`,
  formal: `Style: Formal. ${RESPONSE_STYLE_GUIDANCE.formal} ${CHAT_STYLE_OVERRIDE}`,
};

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function createLocalAttachmentReferences(
  attachments?: Attachment[],
): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((attachment) => ({
    url: resolveLocalChatAttachmentUrl(attachment.uri),
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    ...(attachment.fileSize != null ? { fileSize: attachment.fileSize } : {}),
    ...(attachment.assetId ? { assetId: attachment.assetId } : {}),
  }));
}

function restoreComposerAttachments(attachments?: MessageAttachment[]): Attachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined;
  return attachments.map((attachment, index) => ({
    id: attachment.assetId ?? `${attachment.url}#${index}`,
    uri: attachment.url,
    mimeType: attachment.mimeType,
    fileName: attachment.fileName,
    ...(attachment.fileSize != null ? { fileSize: attachment.fileSize } : {}),
    ...(attachment.assetId ? { assetId: attachment.assetId } : {}),
  }));
}

const LOCAL_IMAGE_OCR_CACHE_LIMIT = 64;
const localImageOcrCache = new Map<string, string>();

async function localImageOcrText(url: string): Promise<string> {
  const cached = localImageOcrCache.get(url);
  if (cached !== undefined) return cached;
  const text = (await recognizeText(url)).text.trim();
  if (localImageOcrCache.size >= LOCAL_IMAGE_OCR_CACHE_LIMIT) {
    const oldest = localImageOcrCache.keys().next().value;
    if (oldest !== undefined) localImageOcrCache.delete(oldest);
  }
  localImageOcrCache.set(url, text);
  return text;
}

async function buildLocalImageOcrContext(imageUploads: MessageAttachment[]): Promise<string[]> {
  const context: string[] = [];
  for (const image of imageUploads) {
    try {
      const text = await localImageOcrText(image.url);
      if (text.length > 0) {
        context.push(
          `[Image: ${image.fileName ?? 'attached image'}]\nOn-device OCR text:\n${text}`,
        );
        continue;
      }
    } catch {
      // Fall through to the honest no-text message below.
    }
    context.push(
      `[Image: ${image.fileName ?? 'attached image'}]\nOn-device OCR found no readable text. The local text model cannot inspect the image pixels directly.`,
    );
  }
  return context;
}

function normalizeLocalMessageContent(
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>,
): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => {
      if (part.type === 'text') return part.text ?? '';
      if (part.type === 'image_url') return '[image attachment]';
      return `[${part.type}]`;
    })
    .filter(Boolean)
    .join('\n');
}

function buildChatViewSystemPrompt(
  mode: ChatMode,
  style: ChatStyle,
  taskInstruction?: string,
): string | null {
  const parts = [CHAT_MODE_PROMPTS[mode], CHAT_STYLE_PROMPTS[style], taskInstruction].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join('\n') : null;
}

interface ParsedLocalThinking {
  content: string;
  reasoning: string;
  hasReasoning: boolean;
}

const LOCAL_MODEL_UNAVAILABLE_ERROR =
  'This Local Mode chat uses a model that is no longer available on this device. Open Models and pick a local model to continue.';
const LOCAL_REASONING_TAG_RE = /<\s*(\/?)\s*(think|thinking|reasoning)\s*>/gi;
const PARTIAL_LOCAL_REASONING_TAG_RE =
  /<\s*\/?\s*(?:t|th|thi|thin|think|thinki|thinkin|thinking|r|re|rea|reas|reaso|reason|reasoni|reasonin|reasoning)?$/i;

function stripPartialLocalReasoningTag(raw: string): string {
  return raw.replace(PARTIAL_LOCAL_REASONING_TAG_RE, '');
}

export function parseAssistantThinking(raw: string): ParsedLocalThinking {
  return parseLocalThinking(raw);
}

function parseLocalThinking(raw: string): ParsedLocalThinking {
  const safeRaw = stripPartialLocalReasoningTag(sanitizeLocalOutput(raw));
  LOCAL_REASONING_TAG_RE.lastIndex = 0;

  let cursor = 0;
  let mode: 'content' | 'reasoning' = 'content';
  let content = '';
  let reasoning = '';
  let hasReasoning = false;
  let match: RegExpExecArray | null;

  while ((match = LOCAL_REASONING_TAG_RE.exec(safeRaw)) !== null) {
    const segment = safeRaw.slice(cursor, match.index);
    if (mode === 'reasoning') {
      reasoning += segment;
    } else {
      content += segment;
    }

    const isClosingTag = match[1] === '/';
    if (isClosingTag) {
      mode = 'content';
    } else {
      hasReasoning = true;
      mode = 'reasoning';
    }
    cursor = LOCAL_REASONING_TAG_RE.lastIndex;
  }

  const tail = safeRaw.slice(cursor);
  if (mode === 'reasoning') {
    reasoning += tail;
  } else {
    content += tail;
  }

  return {
    content: sanitizeLocalOutput(content).replace(/^\s+/, ''),
    reasoning: reasoning.trim(),
    hasReasoning,
  };
}

function parseCurrentTurnAssistantOutput(raw: string, prompt: string): ParsedLocalThinking {
  const parsed = parseLocalThinking(raw);
  return {
    ...parsed,
    content: stripLeadingCurrentPromptEcho(parsed.content, prompt),
  };
}

function sanitizeLocalOutput(raw: string): string {
  return raw
    .replace(/<\|im_(?:start|end)\|>/gi, '')
    .replace(/<\|endoftext\|>/gi, '')
    .replace(/<\/?s>/gi, '')
    .split(String.fromCharCode(0))
    .join('')
    .trimEnd();
}

// Every local failure leaves through here, so a runtime exception string never
// reaches the transcript. A raw `FoundationModels.LanguageModelSession.\
// GenerationError error -1.` told the user nothing and read as a crash.
const GENERIC_TURN_FAILURE = 'Something went wrong. Please try again.';

function localSetupMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw) console.warn('[chat] local inference failed:', raw);

  if (
    raw.includes('No model path') ||
    raw.includes('No local runtime') ||
    raw.includes('Download a model') ||
    raw.includes('not downloaded') ||
    raw.includes('needs to be downloaded again') ||
    raw.includes('No local model is configured') ||
    raw.includes('not selectable for local chat') ||
    raw.includes('not available on this device')
  ) {
    return LOCAL_NO_MODEL_MESSAGE;
  }
  if (raw.includes('thermally throttled')) {
    return 'Your device is too warm to run the on-device model. Let it cool down, then try again.';
  }
  if (raw.includes('APPLE_INTELLIGENCE_UNAVAILABLE')) {
    return 'Apple Intelligence is not available on this device. Choose another on-device model to keep chatting privately.';
  }
  if (raw.includes('APPLE_INTELLIGENCE_ASSETS_UNAVAILABLE')) {
    return 'Apple Intelligence is still preparing its on-device model. Try again shortly, or choose another on-device model.';
  }
  if (raw.includes('APPLE_INTELLIGENCE_CONTEXT_EXCEEDED')) {
    return 'This conversation is too long for Apple Intelligence. Start a new chat or choose a model with a larger context window.';
  }
  if (raw.includes('APPLE_INTELLIGENCE_REFUSED')) {
    return 'Apple Intelligence declined to answer this message. Rephrase it, or choose another on-device model.';
  }
  if (raw.includes('APPLE_INTELLIGENCE_RATE_LIMITED')) {
    return 'Apple Intelligence is busy on this device. Wait a moment and try again.';
  }
  if (raw.includes('APPLE_INTELLIGENCE_FAILED') || raw.includes('FoundationModels')) {
    return 'Apple Intelligence could not finish this reply on this device. Try again, or choose another on-device model.';
  }
  if (raw.includes('out of memory') || raw.includes('OOM')) {
    return 'This device ran out of memory for the on-device model. Close other apps, or choose a smaller model.';
  }
  return 'Local inference failed. Check device storage, thermal state, and installed model status.';
}

function getMsgStore() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatMessageStore } =
    require('@/stores/chat/chatMessageStore') as typeof import('@/stores/chat/chatMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatMessageStore;
}

function getCloudStore() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { useChatCloudMessageStore } =
    require('@/stores/chat/chatCloudMessageStore') as typeof import('@/stores/chat/chatCloudMessageStore');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return useChatCloudMessageStore;
}

export function compareCloudMessagesByCreatedAtThenId(a: ChatMessage, b: ChatMessage): number {
  const at = a.createdAt ?? '';
  const bt = b.createdAt ?? '';
  return at === bt ? a.id.localeCompare(b.id) : at.localeCompare(bt);
}

function queueCloudTurnForSync(conversationId: string, messages: ChatMessage[]): void {
  markConversationForSync(conversationId);
  for (const m of messages) {
    if (m.role === 'user' || m.role === 'assistant' || m.role === 'system') {
      markMessageForSync(conversationId, m.id);
    }
  }
}

function hasVisibleText(content: string): boolean {
  return content.replace(/[\u200B\uFEFF]/g, '').trim().length > 0;
}

function storedCardTextOffsets(metadata: ChatMessage['metadata']): Record<string, number> {
  const stored = metadata?.['interactiveCardTextOffsets'];
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const offsets: Record<string, number> = {};
  for (const [cardId, offset] of Object.entries(stored as Record<string, unknown>)) {
    if (typeof offset === 'number' && Number.isFinite(offset) && offset >= 0) {
      offsets[cardId] = offset;
    }
  }
  return offsets;
}

function recordCardTextOffset(
  offsets: Record<string, number>,
  cardId: string,
  content: string,
): void {
  if (offsets[cardId] !== undefined) return;
  offsets[cardId] = hasVisibleText(content) ? content.length : 0;
}

function pushCloudAssistantUpdate(
  conversationId: string,
  messages: ChatMessage[],
  assistantMessageId: string,
): void {
  const assistant = messages.find(
    (message) => message.id === assistantMessageId && message.role === 'assistant',
  );
  if (!assistant) return;
  queueCloudTurnForSync(conversationId, [assistant]);
  void syncNow();
}

function settleToolCalls(
  toolCalls: ToolCall[] | undefined,
  status: 'failed' | 'cancelled',
): ToolCall[] | undefined {
  if (!toolCalls?.length) return toolCalls;
  let changed = false;
  const settled = toolCalls.map((tool) => {
    if (isTerminalToolStatus(tool.status)) return tool;
    changed = true;
    const partial = Boolean(tool.output || tool.searchResults?.length);
    return {
      ...tool,
      requiresApproval: false,
      status: partial ? 'partial' : status === 'cancelled' ? 'canceled' : 'failed',
    } satisfies ToolCall;
  });
  return changed ? settled : toolCalls;
}

function sendReplayOf(metadata: ChatMessage['metadata']): SendReplayMetadataLike | undefined {
  const replay = metadata?.['sendReplay'];
  return replay && typeof replay === 'object' && !Array.isArray(replay)
    ? (replay as SendReplayMetadataLike)
    : undefined;
}

const GONE_RUN_STATUSES: ReadonlySet<number> = new Set([404, 410]);

function isCloudRunGone(error: unknown): boolean {
  return error instanceof ManagedCloudAgentRunHttpError && GONE_RUN_STATUSES.has(error.status);
}

const UNSENT_PASTED_TEXT_MESSAGE =
  'Your pasted text did not finish uploading, so nothing was sent. Your message is still here. Try sending again.';

function unsentUploadsMessage(fileNames: string[]): string {
  const files = fileNames.filter((name) => !isPastedTextFileName(name));
  if (files.length === fileNames.length) return unsentAttachmentMessage(fileNames);
  if (files.length === 0) return UNSENT_PASTED_TEXT_MESSAGE;
  return `${unsentAttachmentMessage(files)} Your pasted text is still in your message.`;
}

function stoppedByUser(message: ChatMessage): ChatMessage {
  if (message.role !== 'assistant') return { ...message, isStreaming: false };
  return {
    ...message,
    isStreaming: false,
    metadata: { ...message.metadata, finishReason: 'stopped' },
  };
}

function settleMessageTurnState(
  message: ChatMessage,
  status: 'failed' | 'cancelled',
  completedAtMs: number,
  error?: string,
): ChatMessage {
  const activity = readAgentActivityState(message.metadata?.agentActivity);
  const research = settleResearchRun(
    readResearchRunState(message.metadata?.research),
    status === 'cancelled' ? 'interrupted' : 'error',
    error,
  );
  const toolCalls = settleToolCalls(message.toolCalls, status);
  const settledSteps = settleRunningSteps(message);
  const agiWorkPlan = settleAgiWorkPlan(message.metadata?.agiWorkPlan, status);
  if (!activity && !research && !agiWorkPlan) {
    return toolCalls === message.toolCalls ? settledSteps : { ...settledSteps, toolCalls };
  }
  return {
    ...settledSteps,
    ...(toolCalls === message.toolCalls ? {} : { toolCalls }),
    metadata: {
      ...message.metadata,
      ...(activity
        ? {
            agentActivity: finishAgentActivityLocally(activity, {
              status,
              completedAtMs,
              ...(error ? { error } : {}),
            }),
          }
        : {}),
      ...(research ? { research } : {}),
      ...(agiWorkPlan ? { agiWorkPlan } : {}),
    },
  };
}

function settleAgiWorkPlan(
  value: unknown,
  status: 'failed' | 'cancelled',
): AgiWorkPlanStep[] | null {
  const steps = readAgiWorkPlanSteps(value);
  if (!steps?.some((step) => step.status === 'in_progress')) return null;
  return steps.map((step) => (step.status === 'in_progress' ? { ...step, status } : step));
}

function conversationRowsInOrder(conversationId: string): ChatMessage[] {
  const owned =
    getConversationMessageStore(conversationId).getState().messages[conversationId] ?? [];
  return keepShownOrder(owned, owned);
}

function attachTurnStep(conversationId: string, messageId: string, step: StatusStep): void {
  getConversationMessageStore(conversationId).setState((state) => {
    const messages = state.messages[conversationId];
    if (!messages?.some((message) => message.id === messageId)) return {};
    return {
      messages: {
        ...state.messages,
        [conversationId]: messages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                steps: [
                  ...(message.steps ?? []).filter((existing) => existing.id !== step.id),
                  step,
                ],
              }
            : message,
        ),
      },
    };
  });
}

/**
 * The conversation as the reader sees it, and the only thing a completion
 * request is ever built from: mobile assembles its own prompt, so an abandoned
 * variant that reached this array would reach the model.
 */
function historyMessagesForConversation(
  conversationId: string,
  executionMode: ConversationExecutionMode,
): ChatMessage[] {
  const state = getConversationMessageStore(conversationId).getState();
  const owned = state.messages[conversationId] ?? [];
  const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
  if (executionMode !== 'cloud') return visibleThreadFor(owned, conversation);
  return visibleThreadFor(conversationRowsInOrder(conversationId), conversation);
}

function cloudAnswerToContinue(
  conversationId: string,
  assistantMessageId: string,
  turn: InFlightTurnVerdict,
) {
  if (
    abortControllers.has(conversationId) ||
    streamingConversations.has(conversationId) ||
    cloudRunChecks.has(conversationId)
  ) {
    return null;
  }
  const conversation = getConversationMessageStore(conversationId)
    .getState()
    .conversations.find((c) => c.id === conversationId);
  if (!conversation) return null;
  const thread = historyMessagesForConversation(conversationId, 'cloud');
  const answer = thread[thread.length - 1];
  if (!answer || answer.id !== assistantMessageId) return null;
  if (hasUnfinishedRun(answer) && turn !== 'stalled') return null;
  const model = continuableCloudModel(conversation, answer, turn);
  return model ? { conversation, thread, answer, model } : null;
}

/**
 * The turns a branch continues from: the path down to the row it hangs off.
 * A branch at the root has nothing before it, which `null` names here and the
 * resolver would otherwise read as "never branched, take every row".
 */
function pathEndingAt(conversationId: string, leafMessageId: string | null): ChatMessage[] {
  if (leafMessageId === null) return [];
  return visibleThreadFor(conversationRowsInOrder(conversationId), {
    activeLeafMessageId: leafMessageId,
  });
}

type WireHistoryEntry = {
  role: string;
  content:
    | string
    | Array<{
        type: string;
        text?: string;
        image_url?: { url: string };
        file?: { asset_id: string };
      }>;
};

function wireHistory(
  messages: ChatMessage[],
  executionMode: ConversationExecutionMode,
  documentContextByMessage: ReadonlyMap<string, string[]> = new Map(),
): WireHistoryEntry[] {
  return messages
    .filter((m) => !m.isStreaming)
    .flatMap((m): WireHistoryEntry[] => {
      const settled =
        m.role === 'assistant'
          ? settledClarifyTurn(m.interactiveCards ?? readPersistedInteractiveCards(m.metadata))
          : null;
      const settledTurn = settled ? [{ role: 'user', content: settled }] : [];
      const documentContext = documentContextByMessage.get(m.id);
      const turnText = documentContext
        ? [...documentContext, m.content].filter(Boolean).join('\n\n')
        : m.content;
      const replayedAttachments = m.attachments?.filter((a) =>
        executionMode === 'cloud'
          ? Boolean(a.assetId) ||
            (a.mimeType.startsWith('image/') && /^(https:|data:)/i.test(a.url))
          : a.mimeType.startsWith('image/'),
      );
      if (replayedAttachments && replayedAttachments.length > 0) {
        return [
          {
            role: m.role,
            content: [
              ...(turnText ? [{ type: 'text' as const, text: turnText }] : []),
              ...replayedAttachments.map((a) =>
                a.assetId
                  ? { type: 'file' as const, file: { asset_id: a.assetId } }
                  : { type: 'image_url' as const, image_url: { url: a.url } },
              ),
            ],
          },
          ...settledTurn,
        ];
      }
      return [{ role: m.role, content: turnText }, ...settledTurn];
    });
}

const CONTINUE_FAILED_MESSAGE = 'This answer could not be continued. Try again.';

type ContinuationFailure = Partial<
  Pick<
    ExecutionState,
    'error' | 'failureCode' | 'paywallError' | 'providerConsentError' | 'freeCapacityError'
  >
>;

function continuationFailure(error: unknown): ContinuationFailure {
  if (error instanceof ApiPaywallError) {
    return { paywallError: paywallErrorStateFromApiError(error) };
  }
  if (error instanceof CloudProviderConsentRequiredError) return { error: null };
  const providerConsentError = providerConsentErrorStateFromError(error);
  if (providerConsentError) {
    return { error: providerConsentErrorMessage(providerConsentError), providerConsentError };
  }
  if (error instanceof ApiFreeCapacityError) {
    return {
      error: FREE_CAPACITY_BUSY_MESSAGE,
      freeCapacityError: freeCapacityErrorStateFromApiError(error),
    };
  }
  if (error instanceof ApiHttpError) {
    const message = withFailureReference(error.message, error.requestId);
    return { error: message, failureCode: error.code ? { message, code: error.code } : null };
  }
  if (error instanceof RemoteChatDisabledError) return { error: error.message };
  if (error instanceof StreamConnectionLostError) return { error: CONNECTION_LOST_FAILURE.message };
  return { error: CONTINUE_FAILED_MESSAGE };
}

/**
 * Gives a conversation that has only ever been linear the parent pointers its
 * history implies, so the turn about to be written has something to branch
 * from. Must run before an edited row's own parent is read: on a conversation
 * that has never branched there is no parent to read yet, and treating that
 * absence as `null` would file the revision under the root instead of beside
 * the question it revises.
 *
 * Runs only while no row has a parent, as the server's `stampLinearParents`
 * does: every root of a sibling group is null-parented on purpose, and chaining
 * it onto whichever row precedes it would fold separate versions into one line.
 * A Local transcript is chained in the order it is held, because a question and
 * its answer are written in the same millisecond and their random ids would
 * otherwise decide which one comes first.
 */
function ensureLocalThreadParents(conversationId: string): ChatMessage[] {
  const store = getConversationMessageStore(conversationId);
  const rows = store.getState().messages[conversationId] ?? [];
  const stamped = withThreadParents(conversationId, rows);
  if (stamped !== rows) {
    store.setState((state) => ({
      messages: { ...state.messages, [conversationId]: stamped },
    }));
  }
  return stamped;
}

function withThreadParents(conversationId: string, rows: ChatMessage[]): ChatMessage[] {
  if (rows.some((row) => row.parentId != null)) return rows;
  return getConversationMessageStore(conversationId) === useChatCloudMessageStore
    ? stampLinearParents(rows)
    : chainInHeldOrder(rows);
}

function chainInHeldOrder(rows: ChatMessage[]): ChatMessage[] {
  if (rows.length < 2) return rows;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    return previous ? { ...row, parentId: previous.id } : row;
  });
}

/**
 * A rewrite that never wrote its new version leaves the parents it stamped
 * behind, and with no leaf to follow them the next ordinary send writes
 * parentless rows beside them; a later edit of one of those would read its
 * missing parent as a root and drop every earlier turn from view. Clearing the
 * stamped parents by row id keeps a refused, failed or abandoned edit or
 * regenerate from changing anything at all, even after another writer has
 * replaced the array, and puts back the leaf an answer withdrawn before it
 * streamed moved. Runs whatever the attempt returned: a row the attempt added
 * means its version was written and the stamps are in use.
 */
function forgetUnusedThreadParents(
  conversationId: string,
  linearRows: ChatMessage[],
  stampedRows: ChatMessage[],
  leafBefore: string | null | undefined,
): void {
  if (linearRows === stampedRows) return;
  const linearParents = new Map(
    linearRows.map((row): [string, string | null | undefined] => [row.id, row.parentId]),
  );
  const stampedParents = new Map<string, string>();
  for (const row of stampedRows) {
    if (row.parentId != null && linearParents.get(row.id) == null) {
      stampedParents.set(row.id, row.parentId);
    }
  }
  if (stampedParents.size === 0) return;
  const heldIds = new Set(stampedRows.map((row) => row.id));
  const store = getConversationMessageStore(conversationId);
  const current = store.getState().messages[conversationId];
  if (!current || current.some((row) => !heldIds.has(row.id))) return;
  let restored = false;
  const unstamped = current.map((row) => {
    if (row.parentId == null || stampedParents.get(row.id) !== row.parentId) return row;
    restored = true;
    const { parentId: _stampedParentId, ...unthreaded } = row;
    return linearParents.get(row.id) === null ? { ...unthreaded, parentId: null } : unthreaded;
  });
  if (!restored) return;
  store.setState((state) => ({ messages: { ...state.messages, [conversationId]: unstamped } }));
  if (activeLeafOf(conversationId) !== leafBefore) putBackActiveLeaf(conversationId, leafBefore);
}

/**
 * Whether an edit or a regenerate here keeps the earlier version beside the new
 * one. A Local transcript lives on the phone, so it can always hold siblings; a
 * Cloud one only when its server threads.
 */
function keepsEarlierVersions(conversation: ConversationSummary | undefined): boolean {
  if (!conversation) return false;
  return (
    executionModeForConversation(conversation) === 'local' ||
    isThreadingCapableConversation(conversation)
  );
}

/**
 * How many messages after `messageId` an edit or a regenerate would delete.
 * Zero when the earlier version is kept, and zero for the last turn: editing
 * the last question replaces only its own answer, and regenerating the last
 * answer has nothing after it.
 */
function messagesLostByRewrite(
  conversationId: string,
  messageId: string,
  rewrite: 'edit' | 'regenerate',
): number {
  const state = getConversationMessageStore(conversationId).getState();
  const conversation = state.conversations.find((candidate) => candidate.id === conversationId);
  if (!conversation || keepsEarlierVersions(conversation)) return 0;
  const rows = state.messages[conversationId] ?? [];
  const index = rows.findIndex((row) => row.id === messageId);
  const target = rows[index];
  if (!target) return 0;
  const after = rows.length - index - 1;
  const ownAnswer = target.role === 'user' && rows[index + 1]?.role === 'assistant' ? 1 : 0;
  if (after - ownAnswer <= 0) return 0;
  return rewrite === 'edit' ? after : after - ownAnswer;
}

function lostMessagesPhrase(count: number): { messages: string; they: string } {
  return count === 1
    ? { messages: '1 message', they: 'It' }
    : { messages: `${count} messages`, they: 'They' };
}

const REWRITE_CONFIRMATION = {
  edit: {
    title: 'Edit and resend?',
    body: (count: number) => {
      const { messages, they } = lostMessagesPhrase(count);
      return `This removes the ${messages} after this one. ${they} can't be recovered.`;
    },
    confirm: 'Edit and resend',
  },
  regenerate: {
    title: 'Regenerate this answer?',
    body: (count: number) => {
      const { messages, they } = lostMessagesPhrase(count);
      return `This replaces this answer and removes the ${messages} after it. ${they} can't be recovered.`;
    },
    confirm: 'Regenerate',
  },
} as const;

/**
 * Runs `proceed` at once when the rewrite keeps every later message, and asks
 * first when it would delete some: only a conversation that cannot hold an
 * earlier version still loses the turns after the one rewritten.
 */
export function confirmBeforeRewrite(
  conversationId: string,
  messageId: string,
  rewrite: 'edit' | 'regenerate',
  proceed: () => void,
): void {
  const lost = messagesLostByRewrite(conversationId, messageId, rewrite);
  if (lost === 0) {
    proceed();
    return;
  }
  const copy = REWRITE_CONFIRMATION[rewrite];
  Alert.alert(copy.title, copy.body(lost), [
    { text: 'Cancel', style: 'cancel' },
    { text: copy.confirm, style: 'destructive', onPress: proceed },
  ]);
}

export function setLocalActiveLeaf(conversationId: string, messageId: string): void {
  const store = getConversationMessageStore(conversationId);
  if (store === useChatCloudMessageStore) {
    useChatCloudMessageStore.getState().patchCloudConversation(conversationId, {
      activeLeafMessageId: messageId,
    });
    return;
  }
  store.setState((state) => ({
    conversations: state.conversations.map((candidate) =>
      candidate.id === conversationId
        ? { ...candidate, activeLeafMessageId: messageId }
        : candidate,
    ),
  }));
}

function activeLeafOf(conversationId: string): string | null | undefined {
  return getConversationMessageStore(conversationId)
    .getState()
    .conversations.find((candidate) => candidate.id === conversationId)?.activeLeafMessageId;
}

function putBackActiveLeaf(conversationId: string, leaf: string | null | undefined): void {
  const store = getConversationMessageStore(conversationId);
  if (store === useChatCloudMessageStore) {
    if (leaf !== undefined) {
      useChatCloudMessageStore
        .getState()
        .patchCloudConversation(conversationId, { activeLeafMessageId: leaf });
    }
    return;
  }
  store.setState((state) => ({
    conversations: state.conversations.map((candidate) => {
      if (candidate.id !== conversationId) return candidate;
      const { activeLeafMessageId: _replaced, ...unpointed } = candidate;
      return leaf === undefined ? unpointed : { ...unpointed, activeLeafMessageId: leaf };
    }),
  }));
}

/**
 * A turn withdrawn before it streamed takes its answer row with it. A leaf
 * left naming that row would hang the next turn off a row that no longer
 * exists, and the walk up from it would stop there and hide every earlier turn.
 */
function moveLeafOffRemovedRow(
  conversationId: string,
  rowsWithRemoved: ChatMessage[],
  removedId: string,
): void {
  if (activeLeafOf(conversationId) !== removedId) return;
  const survivor = resolveSurvivingLeaf(rowsWithRemoved, removedId);
  if (survivor) setLocalActiveLeaf(conversationId, survivor);
}

/**
 * Writes the row a branch hangs off through the messages route rather than the
 * sync push, because only that route stamps a linear history into a tree and
 * accepts an explicit parent. The push chains new rows from whatever leaf it
 * finds, which is the right answer for a continuation and the wrong one for a
 * sibling.
 *
 * Re-sending a row that already exists is how a regenerate moves the branch
 * point: the insert is idempotent on the id and never rewrites a parent, so the
 * call stamps the history and leaves the leaf on the question being answered
 * again. Either way the row written is a question, never an answer.
 */
async function writeCloudBranchPoint(
  conversationId: string,
  message: Pick<ChatMessage, 'id' | 'content' | 'model' | 'metadata'>,
  parentId: string | null,
): Promise<void> {
  await managedCloudChat.saveMessage(conversationId, {
    id: message.id,
    role: 'user',
    content: message.content,
    ...(message.model ? { model: message.model } : {}),
    ...(message.metadata ? { metadata: message.metadata } : {}),
    parentId,
  });
}

function deriveChatMessageArtifacts(
  content: string,
  conversationId: string,
  messageId: string,
  createdAt: string,
  scope: MessageArtifactScope,
  metadata?: Record<string, unknown>,
): NonNullable<ChatMessage['artifacts']> {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { deriveArtifacts } =
      require('@agiworkforce/artifacts') as typeof import('@agiworkforce/artifacts');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const shared = deriveArtifacts(content, {
      conversationId,
      messageId,
      include: (block) => offersMessageArtifact(block, scope, metadata),
      now: createdAt,
    });
    return shared.map(messageArtifactFromShared);
  } catch (err) {
    console.warn('[chatExecutionStore] Failed to derive message artifacts:', err);
    return [];
  }
}

export { generatedFileArtifactsFromWire } from '@/src/features/chat/utils/generatedFileArtifacts';

/**
 * Runs for history as well as for a finished stream. `deriveAndMapToMobileArtifacts`
 * is pure and its ids are deterministic, so re-deriving the same content is
 * idempotent.
 */
export function captureArtifactsFromMessage(
  content: string,
  messageId: string,
  conversationId: string,
  conversationTitle: string,
  createdAt: string,
  provenance: MobileArtifactProvenance,
): void {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { useArtifactStore, deriveAndMapToMobileArtifacts } =
      require('@/src/features/artifacts/store') as typeof import('@/src/features/artifacts/store');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const mobileArtifacts = deriveAndMapToMobileArtifacts(
      content,
      conversationId,
      messageId,
      createdAt,
      conversationTitle,
      provenance,
    );
    if (mobileArtifacts.length > 0) {
      useArtifactStore.getState().addArtifacts(mobileArtifacts);
    }
  } catch (err) {
    console.warn('[chatExecutionStore] Failed to capture message artifacts:', err);
  }
}

function removeArtifactsOfMessages(messages: readonly ChatMessage[]): void {
  const messageIds = new Set(messages.map((message) => message.id));
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { useArtifactStore } =
      require('@/src/features/artifacts/store') as typeof import('@/src/features/artifacts/store');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const artifactStore = useArtifactStore.getState();
    for (const artifact of artifactStore.artifacts) {
      if (artifact.messageId && messageIds.has(artifact.messageId) && !artifact.editedAt) {
        artifactStore.removeArtifact(artifact.id);
      }
    }
  } catch (err) {
    console.warn('[chatExecutionStore] Failed to remove replaced message artifacts:', err);
  }
}

function reinsertRemovedTail(
  current: ChatMessage[],
  keptPrefix: ChatMessage[],
  removedTail: ChatMessage[],
): ChatMessage[] {
  const removedIds = new Set(removedTail.map((message) => message.id));
  const remaining = current.filter((message) => !removedIds.has(message.id));
  const lastKept = keptPrefix[keptPrefix.length - 1];
  const keptIndex = lastKept ? remaining.findIndex((message) => message.id === lastKept.id) : -1;
  const insertAt = lastKept ? (keptIndex < 0 ? remaining.length : keptIndex + 1) : 0;
  return [...remaining.slice(0, insertAt), ...removedTail, ...remaining.slice(insertAt)];
}

function flushDeferredSend(conversationId: string): void {
  const waiting = deferredSends.get(conversationId);
  const next = waiting?.[0];
  if (!waiting || !next) return;
  const rest = waiting.slice(1);
  if (rest.length > 0) deferredSends.set(conversationId, rest);
  else deferredSends.delete(conversationId);
  void useChatExecutionStore
    .getState()
    .sendMessage(conversationId, next.content, next.model, next.attachments, next.options);
}

async function uploadAgreedBeforeDeferring(
  conversationId: string,
  model: string,
  attachments: Attachment[] | undefined,
): Promise<boolean> {
  const needingUpload = attachments?.filter((attachment) => !attachment.assetId) ?? [];
  if (needingUpload.length === 0) return true;
  const conversation = getConversationMessageStore(conversationId)
    .getState()
    .conversations.find((candidate) => candidate.id === conversationId);
  const executionMode = conversation
    ? executionModeForConversation(conversation)
    : executionModeForModel(model);
  if (executionMode !== 'cloud') return true;
  const account = captureCloudAccountEpoch();
  if (!(await agreeToCloudUploadAhead(needingUpload))) return false;
  if (account && !isCloudAccountEpochCurrent(account)) {
    takeCloudUploadAgreedAhead(needingUpload);
    return false;
  }
  return true;
}

export const useChatExecutionStore = create<ExecutionState>()((set, get) => ({
  isStreaming: false,
  streamingConversationIds: [],
  reconnectingMessageIds: [],
  toolInputSendErrors: {},
  streamingContent: '',
  streamingReasoning: '',
  error: null,
  failureCode: null,
  paywallError: null,
  providerConsentError: null,
  freeCapacityError: null,
  errorConversationId: null,
  errorRetry: null,
  retryAttempts: {},
  isEditing: false,

  clearError: () =>
    set((state) => ({
      error: null,
      failureCode: null,
      freeCapacityError: null,
      errorRetry: null,
      ...(state.paywallError === null && state.providerConsentError === null
        ? { errorConversationId: null }
        : {}),
    })),
  clearErrorFor: (conversationId) =>
    failureScopedSet(conversationId)({ error: null, failureCode: null, freeCapacityError: null }),
  clearUnscopedError: () => {
    if (get().errorConversationId === null) get().clearError();
  },
  setSendError: (message, scope) => {
    const conversationId = scope?.conversationId ?? currentConversationScope();
    const write = { error: message, failureCode: null, freeCapacityError: null };
    if (!conversationId) {
      set({ ...write, errorRetry: null, errorConversationId: null });
      return;
    }
    failureScopedSet(conversationId, () => scope?.retry ?? null)(write);
  },
  clearPaywallError: () => set({ paywallError: null }),
  setPaywallError: (paywallError, conversationId) => {
    const owner = conversationId ?? currentConversationScope();
    if (!owner) {
      set({ paywallError, errorConversationId: null });
      return;
    }
    failureScopedSet(owner)({ paywallError });
  },
  clearProviderConsentError: () => set({ providerConsentError: null }),

  sendMessage: async (conversationId, content, model, attachments, options) => {
    if (options?.retryOfMessageId === undefined) modelShownAtBannerSwitch.delete(conversationId);
    let failureRetry: SendErrorRetry | null = null;
    const set = failureScopedSet(conversationId, () => failureRetry);
    const minorMode = isMinorMode();
    const reduceSensitiveContent = useSettingsStore.getState().reduceSensitiveContent;
    if (minorMode || reduceSensitiveContent) {
      const verdict = checkContentFilter(
        content,
        true,
        minorMode ? MINOR_SAFE_REFUSAL : REDUCED_SENSITIVE_CONTENT_REFUSAL,
      );
      if (!verdict.allowed) {
        Alert.alert('Content not available', verdict.refusal);
        return false;
      }
    }

    const queue = getMobileSendQueue();
    try {
      queue.enqueue({ value: content, mode: 'prompt' });
    } catch (err) {
      if (err instanceof QueueFullError) {
        Alert.alert(
          'Queue full',
          `The "${err.lane}" lane is at capacity. Please wait for prior sends to drain.`,
        );
        return false;
      }
      throw err;
    }
    queue.dequeue();
    set({ providerConsentError: null, freeCapacityError: null });

    if (abortControllers.has(conversationId)) {
      const refuseFullDeferral = () => {
        set({
          error: `Only ${MAX_DEFERRED_SENDS} follow-ups can wait for the current reply. Send this one once the reply finishes.`,
          paywallError: null,
        });
        return false;
      };
      if ((deferredSends.get(conversationId)?.length ?? 0) >= MAX_DEFERRED_SENDS) {
        return refuseFullDeferral();
      }
      if (!(await uploadAgreedBeforeDeferring(conversationId, model, attachments))) {
        set({ error: null, paywallError: null });
        return false;
      }
      if (abortControllers.has(conversationId)) {
        const waiting = deferredSends.get(conversationId) ?? [];
        if (waiting.length >= MAX_DEFERRED_SENDS) return refuseFullDeferral();
        deferredSends.set(conversationId, [...waiting, { content, model, attachments, options }]);
        options?.onAccepted?.();
        return true;
      }
    }
    cancelledBeforeStream.delete(conversationId);

    let uploadedAttachments: MessageAttachment[] | undefined;
    const msgStore = getConversationMessageStore(conversationId);
    const conversation = msgStore.getState().conversations.find((c) => c.id === conversationId);
    const temporaryConversation = isConversationTemporary(conversation);
    const cloudUnlocked = useWaitlistStore.getState().cloudUnlocked;
    const remoteDisabledReason = getRemoteChatDisabledReason(undefined, { cloudUnlocked });
    const requestedModel = model;
    const promotionalOffering = getProviderOffering(requestedModel);
    const isFreeQuotaChat = isFreeQuotaTurnModelId(requestedModel);
    const isCloudModel = isCloudManagedModelId(requestedModel);
    const isAutoSelection = isAutoModeModelId(requestedModel);
    const executionMode = conversation
      ? executionModeForConversation(conversation)
      : executionModeForModel(requestedModel);
    const provider = providerForExecutionMode(executionMode);
    const shouldUseLocalRuntime = executionMode === 'local' && isSelectableModelId(requestedModel);
    if (executionMode === 'local' && isCloudModel) {
      set({
        error: 'This is a Local Mode chat. Start a separate AGI Cloud chat to use Cloud models.',
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    if (executionMode === 'local' && !shouldUseLocalRuntime) {
      set({
        error: LOCAL_MODEL_UNAVAILABLE_ERROR,
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    if (executionMode === 'cloud' && !isCloudModel && !isAutoSelection) {
      set({
        error: 'This is an AGI Cloud chat. Start a separate Local Mode chat to use local models.',
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    const cloudAccountEpoch = executionMode === 'cloud' ? captureCloudAccountEpoch() : null;
    let artifactProvenance: MobileArtifactProvenance;
    if (executionMode === 'local') {
      artifactProvenance = { scope: 'local' };
    } else {
      if (cloudAccountEpoch === null) {
        set({
          error: 'Sign in to use AGI Cloud.',
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
      artifactProvenance = {
        scope: 'cloud',
        ownerId: cloudAccountEpoch.ownerId,
      };
    }
    const turnCloudExecutionGeneration = cloudExecutionGeneration;
    const isTurnAccountCurrent = () =>
      executionMode !== 'cloud' ||
      (turnCloudExecutionGeneration === cloudExecutionGeneration &&
        isCloudAccountEpochCurrent(cloudAccountEpoch));
    if (__DEV__) {
      labelMobileSession({
        id: conversationId,
        ownerUserId:
          artifactProvenance.scope === 'cloud' ? artifactProvenance.ownerId : 'local-device',
        executionMode,
      });
      mobileExecutionProfileFor(executionMode);
    }
    let executionModel = requestedModel;
    let routingReason: string | undefined;
    if (FEATURES.auth && executionMode === 'cloud') {
      const { isClerkLoaded, isClerkSignedIn } = useAuthStore.getState();
      if (isClerkLoaded && !isClerkSignedIn) {
        set({
          error: 'Sign in to use AGI Cloud.',
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
    }
    if (executionMode === 'cloud' && remoteDisabledReason) {
      set({
        error: remoteDisabledReason,
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    if (!shouldUseLocalRuntime && remoteDisabledReason) {
      set({
        error: remoteDisabledReason,
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }
    if (executionMode === 'cloud') {
      try {
        await ensureCloudSendConsent();
      } catch (error) {
        if (!(error instanceof CloudProviderConsentRequiredError)) throw error;
        set({ error: null, paywallError: null, ...streamingFlags() });
        return false;
      }
      if (!isTurnAccountCurrent()) return false;
      await ensureCloudEntitlementsReadyForRequest();
      if (!isTurnAccountCurrent()) return false;

      if (isFreeQuotaChat) {
        const freeOffering = await ensureReadyFreeQuotaOffering(requestedModel);
        if (!isTurnAccountCurrent()) return false;
        if (!freeOffering) {
          set({
            error:
              useFreeQuotaCatalogueStore.getState().error ??
              'This provider-funded Free model is unavailable right now. Choose another available Free model.',
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }
        if (
          attachments?.some((attachment) => !attachment.mimeType.startsWith('image/')) ||
          (attachments?.length && promotionalOffering?.quotaChatImageInput !== true)
        ) {
          set({
            error:
              'This Free model cannot read the attached file. Choose an image-capable Free model or remove the attachment.',
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }
        executionModel = requestedModel;
      } else {
        const route = resolveMobileCloudDispatch({
          selection: requestedModel,
          message: content,
          subscriptionTier: useTierStore.getState().tier,
          history: historyMessagesForConversation(conversationId, executionMode).map((message) => ({
            role: message.role,
            content: message.content,
          })),
          attachments: attachments?.map((attachment) => ({
            mime: attachment.mimeType,
            type: attachment.mimeType.startsWith('image/') ? 'image' : 'document',
          })),
          currentModelKey:
            conversation?.model && !isAutoModeModelId(conversation.model)
              ? conversation.model
              : undefined,
        });

        if (route.status === 'unavailable') {
          set({
            error: cloudDispatchUnavailableMessage(route),
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }
        if (route.dispatch !== 'chat') {
          set({
            error: 'This request requires the AGI Cloud media workflow.',
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }
        executionModel = route.modelKey;
        routingReason = route.reason;
      }
      const imageRefusal = imageLimitRefusal(executionModel, attachments);
      if (imageRefusal) {
        set({
          error: imageRefusal,
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
    }
    const storedTurnId = options?.retryOfMessageId ?? options?.regenerateParentMessageId;
    failureRetry = storedTurnId
      ? { kind: 'regenerate', messageId: storedTurnId }
      : options?.interactiveCardResume || options?.branchParentId !== undefined
        ? null
        : { kind: 'resend' };
    if (shouldUseLocalRuntime && attachments && attachments.length > 0) {
      uploadedAttachments = createLocalAttachmentReferences(attachments);
    } else if (attachments && attachments.length > 0) {
      const reusableCloudAttachments = attachments
        .filter((attachment) => Boolean(attachment.assetId))
        .map((attachment) => ({
          assetId: attachment.assetId!,
          url: attachment.uri,
          mimeType: attachment.mimeType,
          fileName: attachment.fileName,
          ...(attachment.fileSize != null ? { fileSize: attachment.fileSize } : {}),
        }));
      const attachmentsNeedingUpload = attachments.filter((attachment) => !attachment.assetId);
      uploadedAttachments =
        reusableCloudAttachments.length > 0 ? reusableCloudAttachments : undefined;

      if (attachmentsNeedingUpload.length > 0) {
        const userConsented =
          takeCloudUploadAgreedAhead(attachmentsNeedingUpload) ||
          (await confirmCloudUpload(attachmentsNeedingUpload));
        if (!isTurnAccountCurrent()) return false;

        if (!userConsented) {
          set({ error: null, paywallError: null, ...streamingFlags() });
          return false;
        }

        try {
          const uploadContext = {
            conversationId,
            temporary: temporaryConversation,
          };
          const uploadResults = await Promise.all(
            attachmentsNeedingUpload.map((a) =>
              uploadWithRetry(
                { uri: a.uri, name: a.fileName, type: a.mimeType },
                a.fileName,
                a.id,
                uploadContext,
              ),
            ),
          );
          if (!isTurnAccountCurrent()) return false;
          const successful = uploadResults
            .map((result, i) => ({ result, attachment: attachmentsNeedingUpload[i]! }))
            .filter((x) => x.result !== null);

          const unsent = uploadResults
            .map((result, i) => ({ result, attachment: attachmentsNeedingUpload[i]! }))
            .filter((x) => x.result === null);
          if (unsent.length > 0) {
            set({
              error: unsentUploadsMessage(unsent.map((x) => x.attachment.fileName)),
              paywallError: null,
              ...streamingFlags(),
            });
            return false;
          }

          if (successful.length > 0) {
            uploadedAttachments = [
              ...reusableCloudAttachments,
              ...successful.map(({ result }) => ({
                assetId: result!.id,
                url: result!.url,
                mimeType: result!.mimeType,
                fileName: result!.name,
                fileSize: result!.byteCount,
              })),
            ];
          }
        } catch (err) {
          if (!isTurnAccountCurrent()) return false;
          const error = err instanceof Error ? err : new Error(String(err));
          if (error instanceof CloudCredentialUnavailableError) {
            set({
              error: UPLOAD_ACCOUNT_UNCONFIRMED_MESSAGE,
              paywallError: null,
              ...streamingFlags(),
            });
            return false;
          }
          set({
            error: unsentUploadsMessage(attachmentsNeedingUpload.map((a) => a.fileName)),
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }
      }
    }

    if (isFreeQuotaChat && uploadedAttachments?.some((attachment) => !attachment.assetId)) {
      set({
        error: 'The attached image could not be uploaded. Try again.',
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }

    const newMessageId = () => (executionMode === 'cloud' ? uuidv7() : generateId());

    const isThreaded =
      executionMode === 'cloud'
        ? isThreadingCapableConversation(conversation)
        : keepsEarlierVersions(conversation);
    const regenerateAnchorId = isThreaded ? options?.regenerateParentMessageId : undefined;
    const branchParentId = isThreaded ? options?.branchParentId : undefined;
    const regenerateAnchor = regenerateAnchorId
      ? conversationRowsInOrder(conversationId).find(
          (row) => row.id === regenerateAnchorId && row.role === 'user',
        )
      : undefined;
    if (regenerateAnchorId && !regenerateAnchor) return false;
    const resumesCardTurn = options?.interactiveCardResume === true;
    if (
      shouldUseLocalRuntime &&
      uploadedAttachments &&
      !temporaryConversation &&
      !regenerateAnchor &&
      !resumesCardTurn
    ) {
      uploadedAttachments = await keepLocalChatAttachments(conversationId, uploadedAttachments);
      if (!isTurnAccountCurrent()) return false;
    }
    const userMessageParentId = regenerateAnchor
      ? undefined
      : branchParentId !== undefined
        ? branchParentId
        : isThreaded
          ? (conversation?.activeLeafMessageId ?? undefined)
          : undefined;

    const persistedAttachments = persistedAttachmentMetadata(uploadedAttachments);
    const userMessage: ChatMessage | undefined =
      regenerateAnchor || resumesCardTurn
        ? undefined
        : {
            id: newMessageId(),
            conversationId,
            role: 'user',
            content,
            createdAt: new Date().toISOString(),
            model: requestedModel,
            attachments: uploadedAttachments,
            ...(userMessageParentId !== undefined ? { parentId: userMessageParentId } : {}),
            ...(executionMode === 'cloud'
              ? {
                  metadata: {
                    requestedModel,
                    resolvedModel: executionModel,
                    ...(routingReason ? { routingReason } : {}),
                    ...(options?.skillName
                      ? {
                          sendReplay: {
                            hasSkillInstruction: true,
                            skillName: options.skillName,
                            ...(options.skillTools?.codeExecution
                              ? { codeExecutionEnabled: true }
                              : {}),
                            ...(options.skillTools?.officeCreation
                              ? { officeCreationEnabled: true }
                              : {}),
                          },
                        }
                      : {}),
                    ...(persistedAttachments ? { attachments: persistedAttachments } : {}),
                  },
                }
              : {}),
          };
    const assistantParentId = regenerateAnchor
      ? regenerateAnchor.id
      : resumesCardTurn
        ? userMessageParentId
        : userMessage && userMessageParentId !== undefined
          ? userMessage.id
          : undefined;

    const assistantMessageId = newMessageId();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      model: executionMode === 'cloud' ? executionModel : requestedModel,
      ...(assistantParentId !== undefined ? { parentId: assistantParentId } : {}),
      ...(executionMode === 'cloud'
        ? {
            metadata: {
              requestedModel,
              resolvedModel: executionModel,
              ...(routingReason ? { routingReason } : {}),
            },
          }
        : {}),
    };

    // A branch continues from the row it hangs off, not from wherever the
    // reader happens to be: resolving from the conversation's own leaf would
    // put the turns being branched away from into the prompt.
    const branchFromId = regenerateAnchor ? regenerateAnchor.id : branchParentId;
    const existingMessages =
      branchFromId === undefined
        ? historyMessagesForConversation(conversationId, executionMode)
        : pathEndingAt(conversationId, branchFromId);

    const earlierDocumentContext = new Map<string, string[]>();
    if (executionMode !== 'cloud') {
      for (const earlier of existingMessages) {
        if (earlier.isStreaming || earlier.role !== 'user') continue;
        const earlierAttachments = earlier.attachments?.map(resolveLocalChatAttachment) ?? [];
        const earlierDocuments = earlierAttachments.filter(
          (a) => !a.assetId && !a.mimeType.startsWith('image/'),
        );
        const earlierImages = shouldUseLocalRuntime
          ? earlierAttachments.filter((a) => !a.assetId && a.mimeType.startsWith('image/'))
          : [];
        if (earlierDocuments.length === 0 && earlierImages.length === 0) continue;
        const documentContext =
          earlierDocuments.length > 0 ? await buildAttachedDocumentContext(earlierDocuments) : [];
        const imageContext =
          earlierImages.length > 0 ? await buildLocalImageOcrContext(earlierImages) : [];
        if (!isTurnAccountCurrent()) return false;
        earlierDocumentContext.set(earlier.id, [...documentContext, ...imageContext]);
      }
    }

    const historyMessages = wireHistory(existingMessages, executionMode, earlierDocumentContext);

    if (
      isFreeQuotaChat &&
      historyMessages.some((message) => !['system', 'user', 'assistant'].includes(message.role))
    ) {
      set({
        error: 'This Free model cannot continue this conversation. Start a new Free chat.',
        paywallError: null,
        ...streamingFlags(),
      });
      return false;
    }

    const imageUploads = uploadedAttachments?.filter((a) => a.mimeType.startsWith('image/'));
    const fileUploads = uploadedAttachments?.filter((a) => !a.mimeType.startsWith('image/'));

    const remoteUploads: string[] =
      uploadedAttachments?.flatMap((a) => (a.assetId ? [a.assetId] : [])) ?? [];
    const localImageUploads = imageUploads?.filter((a) => !a.assetId) ?? [];
    const localFileUploads = fileUploads?.filter((a) => !a.assetId) ?? [];

    let messageContent = content;
    if (localFileUploads.length > 0) {
      const documentContext = await buildAttachedDocumentContext(localFileUploads);
      if (!isTurnAccountCurrent()) return false;
      messageContent = [...documentContext, content].filter(Boolean).join('\n\n');
    }

    if (shouldUseLocalRuntime && localImageUploads.length > 0) {
      const imageContext = await buildLocalImageOcrContext(localImageUploads);
      if (!isTurnAccountCurrent()) return false;
      messageContent = [messageContent, ...imageContext].filter(Boolean).join('\n\n');
    }

    // A regenerate's question already closes the resolved path above; appending
    // it would put the same turn in the prompt twice.
    if (!regenerateAnchor && !resumesCardTurn) {
      if (remoteUploads.length > 0 || localImageUploads.length > 0) {
        historyMessages.push({
          role: 'user',
          content: [
            ...(messageContent ? [{ type: 'text', text: messageContent }] : []),
            ...remoteUploads.map((assetId) => ({ type: 'file', file: { asset_id: assetId } })),
            ...localImageUploads.map((a) => ({
              type: 'image_url',
              image_url: { url: a.url },
            })),
          ],
        });
      } else {
        historyMessages.push({ role: 'user', content: messageContent });
      }
    }

    const activeProjectId = conversation?.projectId ?? null;
    if (activeProjectId && executionMode === 'local') {
      const activeProject = useProjectStore
        .getState()
        .projects.find((p) => p.id === activeProjectId);
      if (activeProject?.sources?.length) {
        const sourceContext = await buildProjectSourceContext(activeProject.sources);
        if (!isTurnAccountCurrent()) return false;
        historyMessages.unshift({
          role: 'system',
          content: ['Project sources the user added to this project:', ...sourceContext].join(
            '\n\n',
          ),
        });
      }
      if (activeProject?.instructions?.trim()) {
        historyMessages.unshift({ role: 'system', content: activeProject.instructions.trim() });
      }
    }

    const chatViewState = useChatViewStore.getState();
    const viewSystemPrompt = buildChatViewSystemPrompt(
      options?.mode ?? chatViewState.chatMode,
      options?.style ?? styleForConversation(chatViewState, conversationId),
      options?.taskInstruction,
    );
    if (viewSystemPrompt) {
      historyMessages.unshift({ role: 'system', content: viewSystemPrompt });
    }

    const agentControl = useAgentControlStore.getState().resolve(conversationId, activeProjectId);

    const memorySettings =
      executionMode === 'cloud'
        ? useCloudSettingsStore.getState()
        : useLocalSettingsStore.getState();
    const isTemporaryChat = temporaryConversation;
    const accountMemoryAllowed =
      executionMode !== 'cloud' ||
      useMemorySyncStateStore.getState().accountMemoryEnabled !== false;
    const memoryReadsEnabled =
      accountMemoryAllowed && memorySettings.memoryEnabled && !isTemporaryChat;

    const serverAssemblesContext = executionMode === 'cloud';
    try {
      const [memFacts, pastChatContext] = await Promise.all([
        memoryReadsEnabled && !serverAssemblesContext ? retrieveMemoryContext(content, 5) : [],
        serverAssemblesContext
          ? null
          : retrievePastChatContext({
              executionMode,
              query: content,
              currentConversationId: conversationId,
              enabled:
                accountMemoryAllowed && memorySettings.referencePastChats && !isTemporaryChat,
            }),
      ]);
      if (!isTurnAccountCurrent()) return false;
      const blocks = buildPersonalContextBlocks({
        personalization: executionMode === 'cloud' ? null : memorySettings.personalization,
        memories: memFacts,
      });
      if (pastChatContext) {
        blocks.push({ role: 'system', content: pastChatContext });
      }
      for (let i = blocks.length - 1; i >= 0; i -= 1) {
        historyMessages.unshift(blocks[i]);
      }
    } catch {
      // Non-fatal: memory/personalization injection must never block a chat turn.
    }
    if (!isTurnAccountCurrent()) return false;

    const shouldCaptureCompletedLocalTurn = shouldConsolidateMemoryOnClient({
      executionMode,
      isTemporaryChat,
      memoryEnabled: accountMemoryAllowed && memorySettings.memoryEnabled,
      generateMemoryFromHistory: memorySettings.generateMemoryFromHistory,
    });
    let completedLocalMemoryCaptured = false;
    const captureCompletedLocalMemory = () => {
      if (!shouldCaptureCompletedLocalTurn || completedLocalMemoryCaptured) return;
      completedLocalMemoryCaptured = true;
      void consolidateFactsFromTurn({
        message: content,
        conversationId,
        includeSensitiveTopics: memorySettings.includeSensitiveTopics,
      });
    };

    const turnMessageCount = userMessage ? 2 : 1;
    const branchPoint =
      regenerateAnchor ?? (branchParentId !== undefined ? userMessage : undefined);
    const conversationIsTemporary =
      useChatCloudMessageStore
        .getState()
        .conversations.find((conversation) => conversation.id === conversationId)?.temporary ===
      true;
    if (branchPoint && executionMode === 'cloud' && !conversationIsTemporary) {
      try {
        await writeCloudBranchPoint(
          conversationId,
          branchPoint,
          regenerateAnchor ? (regenerateAnchor.parentId ?? null) : (branchParentId ?? null),
        );
      } catch {
        if (!isTurnAccountCurrent()) return false;
        set({
          error: 'Could not start a new version of this message. Check your connection and retry.',
          paywallError: null,
          ...streamingFlags(),
        });
        return false;
      }
      if (!isTurnAccountCurrent()) return false;
    }

    if (isFreeQuotaChat) {
      try {
        await managedCloudChat.getConversation(conversationId);
      } catch (error) {
        if (!isTurnAccountCurrent()) return false;
        if (!(error instanceof ManagedCloudChatHttpError) || error.status !== 404) {
          set({
            error: 'Could not verify this Free conversation. Check your connection and retry.',
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }
        try {
          await managedCloudChat.createConversation({
            id: conversationId,
            title: conversation?.title ?? 'New conversation',
            model: requestedModel,
            projectId: activeProjectId,
            isTemporary: conversation?.temporary ?? false,
          });
        } catch (error) {
          if (!isTurnAccountCurrent()) return false;
          set({
            error:
              error instanceof ManagedCloudChatHttpError && error.status === 409
                ? 'This Free conversation is no longer available in AGI Cloud. Start a new chat and send again.'
                : 'Could not start this Free conversation. Check your connection and retry.',
            paywallError: null,
            ...streamingFlags(),
          });
          return false;
        }
      }
      if (!isTurnAccountCurrent()) return false;
    }

    msgStore.setState((state) => {
      const existing = state.messages[conversationId] ?? [];
      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, ...(userMessage ? [userMessage] : []), assistantMessage],
        },
      };
    });
    if (executionMode === 'cloud') {
      expirePausedTurnsBefore(conversationId, userMessage?.id ?? assistantMessageId);
    }
    const storedQuestionId = userMessage?.id ?? regenerateAnchor?.id;
    failureRetry = storedQuestionId ? { kind: 'regenerate', messageId: storedQuestionId } : null;

    msgStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessage: content,
              updatedAt: new Date().toISOString(),
              model: c.model ?? requestedModel,
              provider: c.provider ?? provider,
              executionMode: c.executionMode ?? executionMode,
            }
          : c,
      ),
    }));

    if (assistantParentId !== undefined) {
      setLocalActiveLeaf(conversationId, assistantMessageId);
    }

    if (executionMode === 'cloud') {
      // A branch point is already on the server, written with the parent the
      // sync push cannot express. Queueing it would make a second writer for a
      // row that is done.
      if (userMessage && !branchPoint && !isFreeQuotaChat) {
        queueCloudTurnForSync(conversationId, [userMessage]);
      } else if (!isFreeQuotaChat) {
        markConversationForSync(conversationId);
      }
    }

    options?.onAccepted?.();

    if (userMessage && !isTemporaryChat && !conversationIsTemporary && hasMemoryCommand(content)) {
      void answerMemoryCommand(
        {
          executionMode,
          message: content,
          conversationId,
          projectId: activeProjectId,
          memoryEnabled: memorySettings.memoryEnabled,
        },
        (step) => attachTurnStep(conversationId, assistantMessageId, step),
      );
    }

    if (cancelledBeforeStream.has(conversationId)) {
      cancelledBeforeStream.delete(conversationId);
      const rowsWithAnswer = msgStore.getState().messages[conversationId] ?? [];
      msgStore.setState((state) => ({
        messages: {
          ...state.messages,
          [conversationId]: (state.messages[conversationId] ?? [])
            .filter((m) => m.id !== assistantMessageId)
            .map((m) =>
              userMessage && m.id === userMessage.id
                ? { ...m, metadata: { ...m.metadata, finishReason: 'stopped' } }
                : m,
            ),
        },
      }));
      if (assistantParentId !== undefined) {
        moveLeafOffRemovedRow(conversationId, rowsWithAnswer, assistantMessageId);
      }
      return true;
    }

    const controller = new AbortController();
    if (abortControllers.size >= MAX_ABORT_CONTROLLERS) {
      const oldestKey = abortControllers.keys().next().value;
      if (oldestKey) {
        abortControllers.get(oldestKey)?.abort();
        abortControllers.delete(oldestKey);
      }
    }
    abortControllers.set(conversationId, controller);
    streamingConversations.add(conversationId);
    if (executionMode === 'cloud') {
      cloudStreamingConversations.add(conversationId);
    }
    lastDeltaTimes.set(conversationId, Date.now());

    set({
      ...streamingFlags(),
      streamingContent: '',
      streamingReasoning: '',
      error: null,
      failureCode: null,
    });

    const ownsLocalTurn = () => abortControllers.get(conversationId) === controller;
    const hasLiveLocalAssistant = () => {
      const state = getConversationMessageStore(conversationId).getState();
      return (
        ownsLocalTurn() &&
        !controller.signal.aborted &&
        state.conversations.some((conversation) => conversation.id === conversationId) &&
        (state.messages[conversationId] ?? []).some(
          (message) =>
            message.id === assistantMessageId &&
            message.role === 'assistant' &&
            message.isStreaming,
        )
      );
    };

    try {
      if (shouldUseLocalRuntime) {
        const localMessages: LocalLlmMessage[] = ensureLocalSystemPrompt(
          historyMessages.slice(0, -1).map((message) => ({
            role:
              message.role === 'assistant' || message.role === 'system' || message.role === 'user'
                ? message.role
                : 'user',
            content: normalizeLocalMessageContent(message.content),
          })),
        );
        const localRef = await resolveLocalModelRef(requestedModel);
        if (!hasLiveLocalAssistant()) return true;
        let localStreamingRaw = '';
        let localTokenCount = 0;
        let localFirstTokenAt = 0;
        const updateLocalStream = (parsed: ParsedLocalThinking) => {
          if (parsed.hasReasoning && !thinkingStartTimes.has(conversationId)) {
            thinkingStartTimes.set(conversationId, Date.now());
          }
          if (
            thinkingStartTimes.has(conversationId) &&
            !thinkingEndTimes.has(conversationId) &&
            parsed.content.length > 0
          ) {
            thinkingEndTimes.set(conversationId, Date.now());
          }

          const thinkingStartedAt = thinkingStartTimes.get(conversationId);
          const currentMsgStore = getConversationMessageStore(conversationId);
          const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
          const updatedMsgs = msgs.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: parsed.content,
                  reasoning: parsed.hasReasoning ? parsed.reasoning : undefined,
                  isStreaming: true,
                  metadata: {
                    ...m.metadata,
                    localMode: true,
                    localModelId: localRef.modelId,
                    ...(thinkingStartedAt !== undefined ? { thinkingStartedAt } : {}),
                  },
                }
              : m,
          );

          set({
            streamingContent: parsed.content,
            streamingReasoning: parsed.hasReasoning ? parsed.reasoning : '',
          });
          currentMsgStore.setState((s) => ({
            messages: { ...s.messages, [conversationId]: updatedMsgs },
          }));
        };

        const localStartedAt = Date.now();
        const memorySampler = startPeakMemorySampler();
        let localPeakMemoryMB = 0;
        let result: Awaited<ReturnType<typeof localGenerate>>;
        try {
          result = await localGenerate(localRef.modelPath, {
            modelId: localRef.modelId,
            prompt: messageContent,
            messages: localMessages,
            requestId: assistantMessageId,
            signal: controller.signal,
            onToken: (token) => {
              if (!hasLiveLocalAssistant()) return;
              if (localFirstTokenAt === 0) localFirstTokenAt = Date.now();
              lastDeltaTimes.set(conversationId, Date.now());
              localTokenCount += 1;
              localStreamingRaw += token;
              updateLocalStream(parseCurrentTurnAssistantOutput(localStreamingRaw, content));
            },
          });
        } finally {
          localPeakMemoryMB = await memorySampler.stop();
        }
        if (!hasLiveLocalAssistant() || result.aborted) return true;
        const parsedFinal = parseCurrentTurnAssistantOutput(
          result.text.trim() || localStreamingRaw.trim(),
          content,
        );
        const finalContent =
          parsedFinal.content.trim() ||
          'The local model returned an empty response. Try again with a shorter prompt.';
        const finalReasoning = parsedFinal.hasReasoning ? parsedFinal.reasoning : undefined;
        const startedAt = thinkingStartTimes.get(conversationId);
        const thinkingEndedAt = thinkingEndTimes.get(conversationId) ?? Date.now();
        const thinkingDuration = startedAt
          ? Math.max(0, thinkingEndedAt - startedAt) / 1000
          : undefined;
        thinkingEndTimes.delete(conversationId);

        const decodeMs = localFirstTokenAt > 0 ? Date.now() - localFirstTokenAt : 0;
        const tokensPerSecond =
          decodeMs > 0 && localTokenCount > 1
            ? Math.round((localTokenCount / decodeMs) * 1000 * 10) / 10
            : undefined;
        if (tokensPerSecond !== undefined) {
          recordPerfEvent({
            ts: Date.now(),
            tokensPerSecond,
            firstTokenLatencyMs: localFirstTokenAt - localStartedAt,
            peakMemoryMB: localPeakMemoryMB,
            backend: result.runtime,
            thermalState: getThermalState(),
          });
        }

        try {
          await markLocalModelRefUsed(localRef);
        } catch (err) {
          console.warn('[chatExecutionStore] Failed to record local model usage:', err);
        }

        const currentMsgStore = getConversationMessageStore(conversationId);
        let committed = false;
        let localConvTitle = '';
        currentMsgStore.setState((state) => {
          const conversation = state.conversations.find(
            (candidate) => candidate.id === conversationId,
          );
          const messages = state.messages[conversationId];
          if (
            !ownsLocalTurn() ||
            controller.signal.aborted ||
            !conversation ||
            !messages?.some(
              (message) =>
                message.id === assistantMessageId &&
                message.role === 'assistant' &&
                message.isStreaming,
            )
          ) {
            return state;
          }
          committed = true;
          localConvTitle = conversation.title;
          return {
            messages: {
              ...state.messages,
              [conversationId]: messages.map((message) =>
                message.id === assistantMessageId
                  ? {
                      ...message,
                      content: finalContent,
                      reasoning: finalReasoning,
                      isStreaming: false,
                      ...(tokensPerSecond !== undefined ? { tokensPerSecond } : {}),
                      metadata: {
                        ...message.metadata,
                        localRuntime: result.runtime,
                        localMode: true,
                        localModelId: localRef.modelId,
                        localModelName: localRef.displayName,
                        ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                      },
                    }
                  : message,
              ),
            },
            conversations: state.conversations.map((candidate) =>
              candidate.id === conversationId
                ? {
                    ...candidate,
                    lastMessage: finalContent.slice(0, 100),
                    messageCount: (candidate.messageCount ?? 0) + turnMessageCount,
                    updatedAt: new Date().toISOString(),
                    model: candidate.model ?? requestedModel,
                    provider: candidate.provider ?? provider,
                    executionMode: candidate.executionMode ?? executionMode,
                  }
                : candidate,
            ),
          };
        });
        if (!committed) return true;

        captureArtifactsFromMessage(
          finalContent,
          assistantMessageId,
          conversationId,
          localConvTitle,
          new Date().toISOString(),
          artifactProvenance,
        );
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          error: null,
          paywallError: null,
        });

        if (parsedFinal.content.trim()) {
          captureCompletedLocalMemory();
          void announceReplyReadyInBackground(conversationId);
        }
        return true;
      }

      const toolAcc = createToolCallAccumulator();
      const turnPendingApprovals: PendingApprovalCall[] = [];
      const turnPendingInputs: PendingToolInputCall[] = [];

      const executionModelMetadata = getModelMetadataById(executionModel);
      const entitlementState = useTierStore.getState();
      const webSearchTurnedOff = useChatViewStore.getState().features.webSearch === false;
      const webSearchEnabled =
        FEATURES.webSearch &&
        !webSearchTurnedOff &&
        isCapabilityRequestable('canUseWebSearch') &&
        isWebSearchAvailable({
          provider: executionModelMetadata?.provider,
          modelSupportsNativeSearch: executionModelMetadata?.capabilities.search,
          modelSupportsTools: executionModelMetadata?.capabilities.tools,
          genericBackendConfigured: entitlementState.genericWebSearchAvailable,
        });
      const disabledConnectorIds =
        useChatViewStore.getState().disabledConnectorIdsByConversation[conversationId] ?? [];
      const researchEnabled =
        FEATURES.research &&
        (options?.research === true ||
          isResearchChosenFor(useChatViewStore.getState(), conversationId)) &&
        executionModelMetadata?.capabilities?.research === true &&
        executionModelMetadata?.capabilities?.search === true &&
        isCapabilityRequestable('canUseDeepResearch');

      const viewState = useChatViewStore.getState();
      const cloudExecutionPermitted = FEATURES.codeExecution && viewState.features.codeExecution;
      const cloudExecutionRequestable =
        cloudExecutionPermitted &&
        entitlementState.codeExecutionAvailable &&
        isCapabilityRequestable('canUseCloudExecution');
      const runCodeRequested =
        cloudExecutionRequestable &&
        executionModelMetadata?.capabilities?.codeExecution === true &&
        (viewState.runCodeByConversation[conversationId] === true ||
          options?.skillTools?.codeExecution === true);
      const officeFormat = useOutputFormatStore.getState().format;
      const officeCreationRequested =
        cloudExecutionRequestable &&
        executionModelMetadata?.capabilities?.tools === true &&
        (officeFormat !== null || options?.skillTools?.officeCreation === true);
      if (officeFormat !== null) useOutputFormatStore.getState().setFormat(null);
      const requestedWorkMode = options?.workMode ?? useChatViewStore.getState().workMode;
      const workMode = isCapabilityRequestable('canUseAgiWork') ? requestedWorkMode : 'chat';
      const composerAgiWorkGoal =
        workMode === 'agiwork' && !options?.agiWorkGoal && !resumesCardTurn
          ? buildAgiWorkGoalInput(content)
          : null;
      const agiWorkGoal = options?.agiWorkGoal ?? composerAgiWorkGoal;
      const suppliedAgiWorkPlan = workMode === 'agiwork' ? options?.agiWorkPlan : undefined;

      let cloudContentRaw = '';
      let lastParsedTags = parseCurrentTurnAssistantOutput(cloudContentRaw, content);
      const turnGeneratedFiles: GeneratedFileWire[] = [];
      const turnInteractiveCards: InteractiveCard[] = [];
      const turnCardTextOffsets: Record<string, number> = {};
      const turnNativeCitations: NativeCitation[] = [];
      const inlineCitations = createInlineCitationMarkers();
      let liveSources: ReturnType<typeof turnSourcesWithActivity> = [];
      let liveGeneratedFiles: ReturnType<typeof generatedFileMetadataFromWire> | undefined;
      let liveInteractiveCards: InteractiveCard[] | undefined;
      let turnFinishReason: string | undefined;
      let turnStreamError: StreamFailure | undefined;
      let agentActivity: AgentActivityState | undefined;
      let cloudAgentRun: ManagedCloudAgentRunReference | undefined;
      let unacknowledgedPublicText = '';
      let turnResearch: ResearchRunState | undefined;
      let turnAgiWorkPlan: AgiWorkPlanStep[] | undefined;
      let turnAgiWorkPlanReview: AgiWorkPlanReviewState | undefined;
      let turnCodeExecutionResult: CodeExecutionResult | undefined;

      const webSearchRequested = webSearchEnabled && !isFreeQuotaChat;
      const webSearchAskedInText = hasExplicitWebSearchIntent(content);
      if (webSearchRequested || webSearchAskedInText) {
        msgStore.setState((s) => ({
          messages: {
            ...s.messages,
            [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    metadata: {
                      ...m.metadata,
                      ...(webSearchRequested ? { webSearchRequested: true } : {}),
                      ...(webSearchAskedInText ? { webSearchAskedInText: true } : {}),
                    },
                  }
                : m,
            ),
          },
        }));
      }

      const thinkingEnabled =
        useModelStore.getState().thinkingEnabledPerModel[executionModel] ?? false;
      const modelReasoning = executionModelMetadata?.reasoning;
      const turnEffort = resolveTurnEffort({
        selectedEffort: agentControl.effort,
        supportedEfforts: modelReasoning?.supportedEfforts ?? [],
        reasoningControl: modelReasoning?.control,
        thinkingEnabled,
      });

      await streamChat(
        isFreeQuotaChat
          ? {
              model: executionModel,
              conversation_id: conversationId,
              assistant_message_id: assistantMessageId,
              operationId: assistantMessageId,
              ...(userMessage
                ? {
                    user_message: {
                      id: userMessage.id,
                      metadata: userMessage.metadata ?? {},
                      ...(userMessage.parentId ? { parent_id: userMessage.parentId } : {}),
                    },
                  }
                : {}),
              messages: normalizePromotionalChatHistory(historyMessages).map((message) => ({
                role: message.role as 'system' | 'user' | 'assistant',
                content: message.content as FreeQuotaMessageContent,
              })),
            }
          : {
              model: executionModel,
              messages: historyMessages,
              stream: true,
              operationId: assistantMessageId,
              ...(CLOUD_CONVERSATION_ID.test(conversationId)
                ? { conversation_id: conversationId }
                : {}),
              thinking: thinkingEnabled,
              ...(turnEffort ? { effort: turnEffort } : {}),
              ...(webSearchEnabled
                ? { web_search: true }
                : webSearchTurnedOff
                  ? { web_search: false }
                  : {}),
              ...(webSearchEnabled || SHARED_PAGE_URL.test(content) ? { web_fetch: true } : {}),
              ...(webSearchEnabled && options?.searchRequested ? { search_requested: true } : {}),
              ...(researchEnabled ? { research: true } : {}),
              ...(researchEnabled && options?.researchResume
                ? {
                    research_resume: {
                      sources: options.researchResume.sources,
                      steps: options.researchResume.steps,
                      ...(options.researchResume.approvedSteps.length > 0
                        ? { approved_steps: options.researchResume.approvedSteps }
                        : {}),
                      ...(options.researchResume.deliverable
                        ? { deliverable: options.researchResume.deliverable }
                        : {}),
                      ...(options.researchResume.guidance
                        ? { guidance: options.researchResume.guidance }
                        : {}),
                    },
                  }
                : {}),
              ...(researchEnabled && options?.researchSources
                ? {
                    research_sources: {
                      ...(options.researchSources.files ? { files: true } : {}),
                      ...(options.researchSources.allowDomains.length > 0
                        ? { allow_domains: options.researchSources.allowDomains }
                        : {}),
                      ...(options.researchSources.denyDomains.length > 0
                        ? { deny_domains: options.researchSources.denyDomains }
                        : {}),
                      ...(options.researchSources.connectors.length > 0
                        ? { connectors: options.researchSources.connectors }
                        : {}),
                    },
                  }
                : {}),
              ...(runCodeRequested
                ? { code_execution: true }
                : cloudExecutionPermitted
                  ? {}
                  : { code_execution: false }),
              ...(officeCreationRequested
                ? {
                    office_creation: true,
                    ...(officeFormat !== null ? { office_format: officeFormat } : {}),
                  }
                : cloudExecutionPermitted
                  ? {}
                  : { office_creation: false }),
              x_interactive_cards: MOBILE_INTERACTIVE_CARD_CAPABILITY,
              ...(disabledConnectorIds.length > 0
                ? { disabled_connector_ids: disabledConnectorIds }
                : {}),
              ...(workMode === 'agiwork' ? { work_mode: workMode } : {}),
              ...(workMode === 'agiwork' && agiWorkGoal ? { agi_work_goal: agiWorkGoal } : {}),
              ...(suppliedAgiWorkPlan?.length
                ? { agi_work_plan: { steps: suppliedAgiWorkPlan } }
                : {}),
              ...(composerAgiWorkGoal ? { agi_work_plan_approval: true } : {}),
              ...(options?.skillName ? { skill_name: options.skillName } : {}),
              ...(isTemporaryChat && !useSettingsStore.getState().temporaryChatPersonalized
                ? { personalization: false as const }
                : {}),
            },
        {
          onReconnecting: () => markReconnecting(set, assistantMessageId, true),
          onMemoryCitations: (citations) => {
            if (!isTurnAccountCurrent()) return;
            msgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, metadata: { ...m.metadata, memoryCitations: citations } }
                    : m,
                ),
              },
            }));
          },
          onProjectSources: (citations) => {
            if (!isTurnAccountCurrent()) return;
            msgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        metadata: {
                          ...m.metadata,
                          [PROJECT_FILE_CITATIONS_METADATA_KEY]: citations,
                        },
                      }
                    : m,
                ),
              },
            }));
          },
          onPastChatSources: (citations) => {
            if (!isTurnAccountCurrent()) return;
            msgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        metadata: { ...m.metadata, [PAST_CHAT_CITATIONS_METADATA_KEY]: citations },
                      }
                    : m,
                ),
              },
            }));
          },
          onModelSubstitution: (substitution) => {
            if (!isTurnAccountCurrent()) return;
            msgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, metadata: { ...m.metadata, ...substitution } }
                    : m,
                ),
              },
            }));
          },
          onTurnNotices: (notices) => {
            if (!isTurnAccountCurrent()) return;
            msgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, metadata: { ...m.metadata, ...notices } }
                    : m,
                ),
              },
            }));
          },
          onAttachmentsTruncated: (fileNames) => {
            const sentMessageId = userMessage?.id;
            if (!sentMessageId || !isTurnAccountCurrent()) return;
            msgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
                  m.id === sentMessageId
                    ? { ...m, metadata: { ...m.metadata, truncatedAttachments: fileNames } }
                    : m,
                ),
              },
            }));
          },
          onRunReference: (reference) => {
            if (!isTurnAccountCurrent() || controller.signal.aborted) return;
            cloudAgentRun = {
              ...reference,
              lastSequence: Math.max(
                cloudAgentRun?.lastSequence ?? -1,
                reference.lastSequence,
                agentActivity?.lastSequence ?? -1,
              ),
            };
            const firstReference = !activeCloudRuns.has(conversationId);
            activeCloudRuns.set(conversationId, { ...cloudAgentRun });
            if (firstReference) options?.onRunStarted?.(cloudAgentRun.runId);
            const currentMsgStore = getConversationMessageStore(conversationId);
            currentMsgStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] ?? []).map((message) =>
                  message.id === assistantMessageId
                    ? {
                        ...message,
                        metadata: { ...message.metadata, cloudAgentRun: { ...cloudAgentRun } },
                      }
                    : message,
                ),
              },
            }));
          },
          onDelta: (delta: StreamDelta) => {
            if (controller.signal.aborted || !isTurnAccountCurrent()) return;
            markReconnecting(set, assistantMessageId, false);

            const state = get();
            lastDeltaTimes.set(conversationId, Date.now());

            const previousParsedTags = lastParsedTags;
            let contentChunk = delta.content;
            const canonicalText =
              delta.x_agent_event?.event.type === 'text-delta'
                ? delta.x_agent_event.event.delta
                : undefined;

            if (delta.durableReplay && canonicalText !== undefined) {
              const reconciled = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              );
              unacknowledgedPublicText = reconciled.pending;
              contentChunk = reconciled.unmatchedIncoming;
            }

            if (delta.x_agent_event) {
              agentActivity = applyAgentActivityEvent(agentActivity, delta.x_agent_event);
            }

            const prevContentLength = cloudContentRaw.length;
            if (contentChunk) cloudContentRaw += contentChunk;
            const parsedTags = contentChunk
              ? parseCurrentTurnAssistantOutput(cloudContentRaw, content)
              : previousParsedTags;
            lastParsedTags = parsedTags;
            const newContent = parsedTags.content;

            if (!delta.durableReplay && contentChunk) {
              const publicDelta = newContent.startsWith(previousParsedTags.content)
                ? newContent.slice(previousParsedTags.content.length)
                : '';
              if (publicDelta) unacknowledgedPublicText += publicDelta;
            }
            if (!delta.durableReplay && canonicalText !== undefined) {
              unacknowledgedPublicText = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              ).pending;
            }

            if (parsedTags.hasReasoning && !thinkingStartTimes.has(conversationId)) {
              thinkingStartTimes.set(conversationId, Date.now());
            }
            if (
              contentChunk &&
              thinkingStartTimes.has(conversationId) &&
              !thinkingEndTimes.has(conversationId) &&
              cloudContentRaw.length > prevContentLength &&
              newContent.length > 0
            ) {
              thinkingEndTimes.set(conversationId, Date.now());
            }
            const newReasoning = parsedTags.reasoning;

            accumulateToolCallDelta(toolAcc, delta);
            const nativeCitation = nativeCitationFromDelta(delta[WEB_SEARCH_CITATION_DELTA_KEY]);
            if (nativeCitation) turnNativeCitations.push(nativeCitation);
            const toolCalls = toolCallList(toolAcc);
            if (
              nativeCitation ||
              delta.x_tool_result ||
              delta.x_search_results ||
              (delta.x_agent_event &&
                messageKindForAgentEvent(delta.x_agent_event.event.type) === 'citation')
            ) {
              liveSources = turnSourcesWithActivity(toolCalls, turnNativeCitations, agentActivity);
            }
            if (nativeCitation) {
              inlineCitations.recordCitation(nativeCitation.url, liveSources, newContent.length);
            }
            inlineCitations.recordSearchResults(delta.x_search_results);
            const displayedContent = inlineCitations.apply(newContent, liveSources, false);
            if (delta.x_code_result) {
              turnCodeExecutionResult =
                codeExecutionResultFromDelta(delta.x_code_result) ?? turnCodeExecutionResult;
            }

            const nextResearch = reduceResearchDelta(turnResearch, delta);
            if (nextResearch) turnResearch = nextResearch;

            const approvalReq = delta.x_tool_approval_request;
            if (
              approvalReq?.tool_call_id &&
              !turnPendingApprovals.some((c) => c.toolCallId === approvalReq.tool_call_id)
            ) {
              turnPendingApprovals.push({
                toolCallId: approvalReq.tool_call_id,
                name: approvalReq.name,
              });
            }
            trackPhoneDeviceStep(turnPendingApprovals, delta);
            recordToolInputRequest(turnPendingInputs, delta);

            if (delta.x_generated_files) {
              turnGeneratedFiles.push(...parseGeneratedFilesDelta(delta.x_generated_files));
              liveGeneratedFiles = generatedFileMetadataFromWire(turnGeneratedFiles);
            }

            if (delta.x_interactive_card) {
              const card = parseInteractiveCardDelta(delta.x_interactive_card);
              if (card) {
                const existing = turnInteractiveCards.findIndex((c) => c.cardId === card.cardId);
                if (existing >= 0) turnInteractiveCards[existing] = card;
                else turnInteractiveCards.push(card);
                recordCardTextOffset(turnCardTextOffsets, card.cardId, newContent);
                liveInteractiveCards = [...turnInteractiveCards];
              }
            }

            if (delta.x_agiwork_plan) {
              const plan = parseAgiWorkPlanDelta(delta.x_agiwork_plan);
              if (plan.steps) turnAgiWorkPlan = plan.steps;
              if (plan.review) turnAgiWorkPlanReview = plan.review;
            }

            if (typeof delta.finish_reason === 'string' && delta.finish_reason) {
              turnFinishReason = delta.finish_reason;
            }
            turnStreamError ??= parseStreamFailure(delta.x_stream_error);

            const thinkingStartedAt = thinkingStartTimes.get(conversationId);
            const currentMsgStore = getConversationMessageStore(conversationId);

            set({ streamingContent: displayedContent, streamingReasoning: newReasoning });
            currentMsgStore.setState((s) => {
              const msgs = s.messages[conversationId];
              if (!msgs) return s;
              const index = msgs.findIndex((m) => m.id === assistantMessageId);
              if (index < 0) return s;
              const target = msgs[index];
              const nextMsgs = [...msgs];
              nextMsgs[index] = {
                ...target,
                content: displayedContent,
                reasoning: newReasoning || undefined,
                isStreaming: true,
                ...(toolCalls.length > 0 ? { toolCalls } : {}),
                ...(liveSources.length > 0 ? { citations: liveSources } : {}),
                ...(liveInteractiveCards ? { interactiveCards: liveInteractiveCards } : {}),
                ...(thinkingStartedAt !== undefined ||
                agentActivity ||
                cloudAgentRun ||
                turnResearch ||
                turnAgiWorkPlan ||
                liveGeneratedFiles ||
                liveInteractiveCards ||
                turnCodeExecutionResult
                  ? {
                      metadata: {
                        ...target.metadata,
                        ...(turnCodeExecutionResult
                          ? { codeExecutionResult: turnCodeExecutionResult, isExecutingCode: false }
                          : {}),
                        ...(liveGeneratedFiles ? { generatedFiles: liveGeneratedFiles } : {}),
                        ...(liveInteractiveCards
                          ? {
                              interactiveCards: liveInteractiveCards,
                              interactiveCardTextOffsets: { ...turnCardTextOffsets },
                            }
                          : {}),
                        ...(thinkingStartedAt !== undefined ? { thinkingStartedAt } : {}),
                        ...(agentActivity ? { agentActivity } : {}),
                        ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                        ...(turnResearch ? { research: { ...turnResearch } } : {}),
                        ...(turnAgiWorkPlan ? { agiWorkPlan: turnAgiWorkPlan } : {}),
                        ...(turnAgiWorkPlanReview
                          ? { agiWorkPlanReview: turnAgiWorkPlanReview }
                          : {}),
                      },
                    }
                  : {}),
              };
              return { messages: { ...s.messages, [conversationId]: nextMsgs } };
            });
          },

          onDone: () => {
            markReconnecting(set, assistantMessageId, false);
            if (controller.signal.aborted || !isTurnAccountCurrent()) return;
            const startedAt = thinkingStartTimes.get(conversationId);
            const endedAt = thinkingEndTimes.get(conversationId) ?? Date.now();
            const thinkingDuration = startedAt
              ? Math.max(0, endedAt - startedAt) / 1000
              : undefined;
            thinkingStartTimes.delete(conversationId);
            thinkingEndTimes.delete(conversationId);

            const finalToolCalls = toolCallList(toolAcc);
            const finalCitations = turnSourcesWithActivity(
              finalToolCalls,
              turnNativeCitations,
              agentActivity,
            );

            const currentMsgStore = getConversationMessageStore(conversationId);
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const finalContent = inlineCitations.hasPlacements()
              ? inlineCitations.apply(lastParsedTags.content, finalCitations, true)
              : (msgs.find((m) => m.id === assistantMessageId)?.content ?? '');
            if (
              turnProducedNothing({
                content: finalContent,
                toolCallCount: finalToolCalls.length,
                generatedFileCount: turnGeneratedFiles.length,
                interactiveCardCount: turnInteractiveCards.length,
                hasResearchRun: turnResearch !== undefined,
                hasStreamError: turnStreamError !== undefined,
              })
            ) {
              turnStreamError = EMPTY_RESPONSE_FAILURE;
            }
            if (isFreeQuotaChat && turnStreamError !== undefined) {
              useFreeQuotaCatalogueStore.getState().clear();
            }
            const completedAt = new Date().toISOString();
            const convTitle =
              currentMsgStore.getState().conversations.find((c) => c.id === conversationId)
                ?.title ?? '';
            const generatedFilesMetadata = generatedFileMetadataFromWire(turnGeneratedFiles);
            const messageArtifacts = mergeDerivedAndGeneratedFileArtifacts(
              deriveChatMessageArtifacts(
                finalContent,
                conversationId,
                assistantMessageId,
                completedAt,
                artifactProvenance.scope,
              ),
              generatedFileArtifactsFromWire(turnGeneratedFiles, completedAt),
            );
            captureArtifactsFromMessage(
              finalContent,
              assistantMessageId,
              conversationId,
              convTitle,
              completedAt,
              artifactProvenance,
            );
            if (
              agentActivity?.status === 'running' &&
              turnStreamError === undefined &&
              !isStoppedFinishReason(turnFinishReason) &&
              turnPendingApprovals.length === 0 &&
              turnPendingInputs.length === 0 &&
              turnResearch === undefined &&
              turnAgiWorkPlanReview?.awaitingApproval !== true
            ) {
              agentActivity = finishAgentActivityLocally(agentActivity, {
                status: 'completed',
                completedAtMs: Date.now(),
              });
            }
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: finalContent,
                    isStreaming: false,
                    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
                    ...(messageArtifacts.length > 0 ? { artifacts: messageArtifacts } : {}),
                    ...(finalCitations.length > 0 ? { citations: finalCitations } : {}),
                    ...(turnInteractiveCards.length > 0
                      ? { interactiveCards: turnInteractiveCards }
                      : {}),
                    ...pendingToolInputPatch(cloudAgentRun?.runId, turnPendingInputs),
                    metadata: {
                      ...m.metadata,
                      ...turnSourceMetadata(finalToolCalls, turnNativeCitations),
                      ...(generatedFilesMetadata.length > 0
                        ? { generatedFiles: generatedFilesMetadata }
                        : {}),
                      ...(turnInteractiveCards.length > 0
                        ? {
                            interactiveCards: turnInteractiveCards,
                            interactiveCardTextOffsets: { ...turnCardTextOffsets },
                          }
                        : {}),
                      ...(thinkingDuration !== undefined ? { thinkingDuration } : {}),
                      ...(turnFinishReason !== undefined ? { finishReason: turnFinishReason } : {}),
                      ...(turnStreamError !== undefined ? { streamError: turnStreamError } : {}),
                      ...(agentActivity ? { agentActivity } : {}),
                      ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                      ...(turnResearch ? { research: { ...turnResearch } } : {}),
                      ...(pendingPhoneSteps(turnPendingApprovals).length > 0
                        ? { phoneDeviceSteps: pendingPhoneSteps(turnPendingApprovals) }
                        : {}),
                    },
                  }
                : m,
            );

            const preview = finalContent.slice(0, 100);

            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);
            activeCloudRuns.delete(conversationId);

            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      lastMessage: preview,
                      messageCount: (c.messageCount ?? 0) + turnMessageCount,
                      updatedAt: new Date().toISOString(),
                      model: c.model ?? requestedModel,
                      provider: c.provider ?? provider,
                      executionMode: c.executionMode ?? executionMode,
                    }
                  : c,
              ),
            }));

            if (executionMode === 'cloud') {
              pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);

              if (turnPendingApprovals.length > 0 && cloudAgentRun?.runId) {
                pendingApprovalTurns.set(
                  assistantMessageId,
                  pausedTurn(cloudAgentRun.runId, conversationId, turnPendingApprovals),
                );
              } else {
                pendingApprovalTurns.delete(assistantMessageId);
              }
            }

            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
            });

            if (turnStreamError === undefined && finalContent.trim()) {
              captureCompletedLocalMemory();
              if (!cloudAgentRun) void announceReplyReadyInBackground(conversationId);
            }
          },

          onError: (error: Error) => {
            markReconnecting(set, assistantMessageId, false);
            if (!isTurnAccountCurrent()) return;
            if (isFreeQuotaChat) useFreeQuotaCatalogueStore.getState().clear();
            thinkingStartTimes.delete(conversationId);
            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);
            activeCloudRuns.delete(conversationId);

            const currentMsgStore = getConversationMessageStore(conversationId);
            const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
            const currentContent = turnContentOf(msgs, assistantMessageId);

            if (error instanceof ApiPaywallError) {
              if (agentActivity) {
                agentActivity = finishAgentActivityLocally(agentActivity, {
                  status: 'failed',
                  completedAtMs: Date.now(),
                  error: paywallActivityErrorFromApiError(error),
                });
              }
              turnResearch =
                settleResearchRun(turnResearch, 'error', paywallActivityErrorFromApiError(error)) ??
                turnResearch;
              const updatedMsgs = msgs.map((m) =>
                m.id === assistantMessageId
                  ? settleMessageTurnState(
                      {
                        ...m,
                        content: currentContent || '',
                        isStreaming: false,
                        ...(agentActivity || cloudAgentRun || turnResearch
                          ? {
                              metadata: {
                                ...m.metadata,
                                ...(agentActivity ? { agentActivity } : {}),
                                ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                                ...(turnResearch ? { research: { ...turnResearch } } : {}),
                              },
                            }
                          : {}),
                      },
                      'failed',
                      Date.now(),
                      paywallActivityErrorFromApiError(error),
                    )
                  : m,
              );
              currentMsgStore.setState((s) => ({
                messages: { ...s.messages, [conversationId]: updatedMsgs },
              }));
              if (executionMode === 'cloud') {
                pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
              }
              set({
                ...streamingFlags(),
                streamingContent: '',
                streamingReasoning: '',
                paywallError: paywallErrorStateFromApiError(error),
              });
              return;
            }

            const providerConsentError = providerConsentErrorStateFromError(error);
            if (providerConsentError) {
              const consentMessage = providerConsentErrorMessage(providerConsentError);
              const consentMsgs = msgs.map((m) =>
                m.id === assistantMessageId
                  ? settleMessageTurnState(
                      { ...m, content: currentContent || consentMessage, isStreaming: false },
                      'failed',
                      Date.now(),
                      consentMessage,
                    )
                  : m,
              );
              currentMsgStore.setState((s) => ({
                messages: { ...s.messages, [conversationId]: consentMsgs },
              }));
              if (executionMode === 'cloud') {
                pushCloudAssistantUpdate(conversationId, consentMsgs, assistantMessageId);
              }
              set({
                ...streamingFlags(),
                streamingContent: '',
                streamingReasoning: '',
                error: consentMessage,
                paywallError: null,
                providerConsentError,
              });
              return;
            }

            if (error instanceof ApiFreeCapacityError) {
              const freeCapacityError = freeCapacityErrorStateFromApiError(error);
              const capacityMsgs = msgs.map((m) =>
                m.id === assistantMessageId
                  ? settleMessageTurnState(
                      {
                        ...m,
                        content: currentContent || FREE_CAPACITY_BUSY_MESSAGE,
                        isStreaming: false,
                      },
                      'failed',
                      Date.now(),
                      FREE_CAPACITY_BUSY_MESSAGE,
                    )
                  : m,
              );
              currentMsgStore.setState((s) => ({
                messages: { ...s.messages, [conversationId]: capacityMsgs },
              }));
              if (executionMode === 'cloud') {
                pushCloudAssistantUpdate(conversationId, capacityMsgs, assistantMessageId);
              }
              set({
                ...streamingFlags(),
                streamingContent: '',
                streamingReasoning: '',
                error: FREE_CAPACITY_BUSY_MESSAGE,
                paywallError: null,
                freeCapacityError,
              });
              return;
            }

            if (__DEV__) {
              console.warn(`[chat-stream] onError ${error?.name}: ${error?.message}`);
            }
            const connectionLost = error instanceof StreamConnectionLostError;
            const failure =
              error instanceof ApiHttpError
                ? {
                    message: withFailureReference(error.message, error.requestId),
                    code: error.code,
                  }
                : connectionLost
                  ? { message: CONNECTION_LOST_FAILURE.message, code: null }
                  : { message: GENERIC_TURN_FAILURE, code: null };
            const turnFailure: StreamFailure =
              error instanceof ApiHttpError
                ? {
                    message: error.message,
                    ...(error.code ? { code: error.code } : {}),
                    ...(error.retryAfterSeconds !== undefined
                      ? { retryAfterSeconds: error.retryAfterSeconds }
                      : {}),
                    ...(error.requestId ? { requestId: error.requestId } : {}),
                  }
                : connectionLost
                  ? { ...CONNECTION_LOST_FAILURE }
                  : { message: GENERIC_TURN_FAILURE };
            if (agentActivity) {
              agentActivity = finishAgentActivityLocally(agentActivity, {
                status: 'failed',
                completedAtMs: Date.now(),
                error: failure.message,
              });
            }
            turnResearch =
              settleResearchRun(turnResearch, 'error', failure.message) ?? turnResearch;
            const updatedMsgs = msgs.map((m) => {
              if (m.id !== assistantMessageId) return m;
              const toolCalls = settleToolCalls(m.toolCalls, 'failed');
              return {
                ...m,
                content: currentContent,
                isStreaming: false,
                ...(toolCalls === m.toolCalls ? {} : { toolCalls }),
                metadata: {
                  ...m.metadata,
                  streamError: turnFailure,
                  ...(agentActivity ? { agentActivity } : {}),
                  ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
                  ...(turnResearch ? { research: { ...turnResearch } } : {}),
                },
              };
            });
            currentMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
            if (executionMode === 'cloud') {
              pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
            }
            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
              error: failure.message,
              failureCode: failure.code ? { message: failure.message, code: failure.code } : null,
            });
          },
        },
        controller.signal,
      );
      return true;
    } catch (caughtErr) {
      if (shouldUseLocalRuntime) {
        if (!hasLiveLocalAssistant()) return true;
        const message = localSetupMessage(caughtErr);
        const currentMsgStore = getConversationMessageStore(conversationId);
        currentMsgStore.setState((state) => ({
          messages: {
            ...state.messages,
            [conversationId]: (state.messages[conversationId] ?? []).map((candidate) =>
              candidate.id === assistantMessageId
                ? {
                    ...candidate,
                    isStreaming: false,
                    metadata: { ...candidate.metadata, streamError: { message } },
                  }
                : candidate,
            ),
          },
        }));
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          error: message,
          paywallError: null,
        });
        return true;
      }

      thinkingStartTimes.delete(conversationId);
      abortControllers.delete(conversationId);
      streamingConversations.delete(conversationId);
      cloudStreamingConversations.delete(conversationId);
      activeCloudRuns.delete(conversationId);

      if (!isTurnAccountCurrent()) return true;
      if (controller.signal.aborted) {
        set({ ...streamingFlags() });
        return true;
      }
      if (isFreeQuotaChat) useFreeQuotaCatalogueStore.getState().clear();

      const currentMsgStore = getConversationMessageStore(conversationId);
      const msgs = currentMsgStore.getState().messages[conversationId] ?? [];
      const currentContent = turnContentOf(msgs, assistantMessageId);

      if (caughtErr instanceof ApiPaywallError) {
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? settleMessageTurnState(
                { ...m, content: currentContent || '', isStreaming: false },
                'failed',
                Date.now(),
                paywallActivityErrorFromApiError(caughtErr),
              )
            : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        if (executionMode === 'cloud') {
          pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
        }
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          paywallError: paywallErrorStateFromApiError(caughtErr),
        });
        return true;
      }

      if (caughtErr instanceof RemoteChatDisabledError) {
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? settleMessageTurnState(
                { ...m, content: caughtErr.message, isStreaming: false },
                'failed',
                Date.now(),
                caughtErr.message,
              )
            : m,
        );
        currentMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        if (executionMode === 'cloud') {
          pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
        }
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
          error: caughtErr.message,
          paywallError: null,
        });
        return true;
      }

      const updatedMsgs = msgs.map((m) =>
        m.id === assistantMessageId
          ? settleMessageTurnState(
              {
                ...m,
                content: currentContent || 'Failed to connect. Check your network and try again.',
                isStreaming: false,
              },
              'failed',
              Date.now(),
              'Failed to connect. Check your network and try again.',
            )
          : m,
      );
      currentMsgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: updatedMsgs },
      }));
      if (executionMode === 'cloud') {
        pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
      }
      set({
        ...streamingFlags(),
        streamingContent: '',
        streamingReasoning: '',
      });
      return true;
    } finally {
      if (!shouldUseLocalRuntime || ownsLocalTurn()) {
        thinkingStartTimes.delete(conversationId);
        thinkingEndTimes.delete(conversationId);
        lastDeltaTimes.delete(conversationId);
        if (abortControllers.get(conversationId) === controller) {
          abortControllers.delete(conversationId);
        }
        streamingConversations.delete(conversationId);
        cloudStreamingConversations.delete(conversationId);
        if (
          isTurnAccountCurrent() &&
          (!shouldUseLocalRuntime ||
            getConversationMessageStore(conversationId)
              .getState()
              .conversations.some((conversation) => conversation.id === conversationId))
        ) {
          const sweepStore = getConversationMessageStore(conversationId);
          const sweepMsgs = sweepStore.getState().messages[conversationId] ?? [];
          const stalled = stalledConversations.delete(conversationId);
          if (sweepMsgs.some((m) => m.id === assistantMessageId && m.isStreaming)) {
            const completedAtMs = Date.now();
            const settledMessages = sweepMsgs.map((m) =>
              m.id === assistantMessageId && m.isStreaming
                ? settleMessageTurnState(
                    stalled ? stoppedByUser(m) : { ...m, isStreaming: false },
                    controller.signal.aborted ? 'cancelled' : 'failed',
                    completedAtMs,
                    controller.signal.aborted ? undefined : GENERIC_TURN_FAILURE,
                  )
                : m,
            );
            sweepStore.setState((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: settledMessages,
              },
            }));
            if (executionMode === 'cloud') {
              pushCloudAssistantUpdate(conversationId, settledMessages, assistantMessageId);
            }
          }
        }
        set({ ...streamingFlags() });
        void settlePhoneDeviceSteps(conversationId, assistantMessageId);
        if (
          !shouldUseLocalRuntime ||
          (!abortControllers.has(conversationId) &&
            getConversationMessageStore(conversationId)
              .getState()
              .conversations.some((conversation) => conversation.id === conversationId))
        ) {
          flushDeferredSend(conversationId);
        }
      }
    }
  },

  resolveToolApproval: async (
    conversationId,
    assistantMessageId,
    toolCallId,
    decision,
    guidance,
  ) => {
    const set = failureScopedSet(conversationId);
    if (captureCloudAccountEpoch() === null) {
      set({
        error: CLOUD_RESUME_SIGN_IN,
        paywallError: null,
        ...streamingFlags(),
      });
      return;
    }
    if (!isApprovalTurnLive(assistantMessageId)) return;
    const turn = pendingApprovalTurns.get(assistantMessageId);
    if (!turn || turn.resolving) return;
    if (turn.conversationId !== conversationId) return;
    if (!turn.calls.some((c) => c.toolCallId === toolCallId)) return;
    if (expireIfSuperseded(conversationId, assistantMessageId)) return;

    turn.decisions.set(toolCallId, decision);
    const trimmedGuidance = guidance?.trim();
    if (trimmedGuidance) turn.guidance.set(toolCallId, trimmedGuidance);
    else turn.guidance.delete(toolCallId);

    const msgStore = getConversationMessageStore(conversationId);
    const patchToolCall = (patch: Partial<ToolCall>) => {
      msgStore.setState((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  toolCalls: (m.toolCalls ?? []).map((t) =>
                    t.toolCallId === toolCallId ? { ...t, ...patch } : t,
                  ),
                }
              : m,
          ),
        },
      }));
      const projectedMessages = msgStore.getState().messages[conversationId] ?? [];
      pushCloudAssistantUpdate(conversationId, projectedMessages, assistantMessageId);
    };

    const approving = isApprovingToolDecision(decision);
    patchToolCall({
      approvalDecision: approving ? 'approved' : 'rejected',
      approvalScope: approving ? decision : undefined,
      approvalGuidance: trimmedGuidance || undefined,
      requiresApproval: true,
    });

    if (turn.deviceResults) {
      await settlePhoneDeviceSteps(conversationId, assistantMessageId);
      return;
    }

    if (turn.decisions.size < turn.calls.length) return;
    turn.resolving = true;

    msgStore.setState((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                toolCalls: (m.toolCalls ?? []).map((t) => {
                  if (!t.toolCallId || !turn.decisions.has(t.toolCallId)) return t;
                  const callDecision = turn.decisions.get(t.toolCallId);
                  return callDecision !== undefined && isApprovingToolDecision(callDecision)
                    ? { ...t, status: 'running' as const, requiresApproval: false }
                    : {
                        ...t,
                        status: 'failed' as const,
                        requiresApproval: false,
                        output: 'You denied permission to run this tool.',
                      };
                }),
              }
            : m,
        ),
      },
    }));
    pushCloudAssistantUpdate(
      conversationId,
      msgStore.getState().messages[conversationId] ?? [],
      assistantMessageId,
    );

    await get().continuePausedCloudTurn(conversationId, assistantMessageId);
  },

  answerToolInput: async (conversationId, assistantMessageId, answers) => {
    const set = failureScopedSet(conversationId);
    const existing = pendingApprovalTurns.get(assistantMessageId);
    if (existing?.resolving) return;
    const msgStore = getConversationMessageStore(conversationId);
    const message = (msgStore.getState().messages[conversationId] ?? []).find(
      (candidate) => candidate.id === assistantMessageId,
    );
    const pausedInput = message?.pendingToolInput;
    if (!pausedInput || answers.length === 0) return;
    const pausedIds = new Set(pausedInput.toolCalls.map((call) => call.toolCallId));
    if (!answers.every((answer) => pausedIds.has(answer.toolCallId))) return;
    setToolInputSendError(assistantMessageId, null);
    if (expireIfSuperseded(conversationId, assistantMessageId)) return;

    pendingApprovalTurns.set(assistantMessageId, {
      runId: pausedInput.runId,
      conversationId,
      calls: pausedInput.toolCalls.map((call) => ({
        toolCallId: call.toolCallId,
        name: call.name,
      })),
      decisions: new Map(),
      guidance: new Map(),
      resolving: true,
      inputAnswers: answers,
      pausedInput,
    });

    await get().continuePausedCloudTurn(conversationId, assistantMessageId);
  },

  continuePausedCloudTurn: async (conversationId, assistantMessageId) => {
    const set = failureScopedSet(conversationId);
    const turn = pendingApprovalTurns.get(assistantMessageId);
    if (!turn || turn.conversationId !== conversationId) return;
    const approvalAccountEpoch = captureCloudAccountEpoch();
    if (approvalAccountEpoch === null) {
      turn.resolving = false;
      if (turn.deviceResults) turn.resultsUndelivered = true;
      const pausedInput = turn.pausedInput;
      if (pausedInput) {
        pendingApprovalTurns.delete(assistantMessageId);
        getConversationMessageStore(conversationId).setState((s) => ({
          messages: {
            ...s.messages,
            [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
              m.id === assistantMessageId ? { ...m, pendingToolInput: pausedInput } : m,
            ),
          },
        }));
        setToolInputSendError(assistantMessageId, CLOUD_RESUME_SIGN_IN);
      }
      set({
        error: CLOUD_RESUME_SIGN_IN,
        paywallError: null,
        ...streamingFlags(),
      });
      return;
    }
    const approvalArtifactProvenance: MobileArtifactProvenance = {
      scope: 'cloud',
      ownerId: approvalAccountEpoch.ownerId,
    };
    const approvalExecutionGeneration = cloudExecutionGeneration;
    const isApprovalAccountCurrent = () =>
      approvalExecutionGeneration === cloudExecutionGeneration &&
      isCloudAccountEpochCurrent(approvalAccountEpoch);
    const msgStore = getConversationMessageStore(conversationId);
    if (expireIfSuperseded(conversationId, assistantMessageId)) return;

    const controller = new AbortController();
    abortControllers.set(conversationId, controller);
    streamingConversations.add(conversationId);
    cloudStreamingConversations.add(conversationId);
    lastDeltaTimes.set(conversationId, Date.now());
    set({
      ...streamingFlags(),
      streamingContent: '',
      streamingReasoning: '',
      error: null,
      failureCode: null,
    });

    const currentMsgs = msgStore.getState().messages[conversationId] ?? [];
    const currentMessage = currentMsgs.find((m) => m.id === assistantMessageId);
    const assistantContent = currentMessage?.content ?? '';
    const seedToolCalls = currentMessage?.toolCalls
      ? currentMessage.toolCalls.map((t) => ({ ...t }))
      : [];

    msgStore.setState((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === assistantMessageId ? { ...m, isStreaming: true } : m,
        ),
      },
    }));

    const toolAcc = seedToolCallAccumulator(seedToolCalls);
    let cloudContentRaw = assistantContent;
    const priorReasoning = currentMessage?.reasoning ?? '';
    const turnGeneratedFiles: GeneratedFileWire[] = [
      ...generatedFileWireFromMetadata(currentMessage?.metadata?.generatedFiles),
    ];
    const turnInteractiveCards: InteractiveCard[] = [
      ...(currentMessage?.interactiveCards ??
        readPersistedInteractiveCards(currentMessage?.metadata)),
    ];
    const turnCardTextOffsets = storedCardTextOffsets(currentMessage?.metadata);
    const turnPendingApprovals: PendingApprovalCall[] = [];
    const turnPendingInputs: PendingToolInputCall[] = [];
    const turnNativeCitations: NativeCitation[] = storedNativeCitations(currentMessage?.metadata);
    const inlineCitations = createInlineCitationMarkers(
      parseLocalThinking(assistantContent).content,
    );
    let turnFinishReason: string | undefined;
    let turnStreamError: StreamFailure | undefined;
    let agentActivity = readAgentActivityState(currentMessage?.metadata?.agentActivity);
    let liveSources: ReturnType<typeof turnSourcesWithActivity> = [];
    const storedRun = ManagedCloudAgentRunReferenceSchema.safeParse(
      currentMessage?.metadata?.cloudAgentRun,
    );
    const resumeAfterSequence = Math.max(
      storedRun.success && storedRun.data.runId === turn.runId ? storedRun.data.lastSequence : -1,
      agentActivity?.lastSequence ?? -1,
    );
    let unacknowledgedPublicText = '';

    try {
      await resumePausedTurn(
        turn,
        {
          onReconnecting: () => markReconnecting(set, assistantMessageId, true),
          onDelta: (delta: StreamDelta) => {
            if (controller.signal.aborted || !isApprovalAccountCurrent()) return;
            markReconnecting(set, assistantMessageId, false);
            lastDeltaTimes.set(conversationId, Date.now());

            if (delta.x_agent_event) {
              agentActivity = applyAgentActivityEvent(agentActivity, delta.x_agent_event);
            }

            let contentChunk = delta.content;
            const canonicalText =
              delta.x_agent_event?.event.type === 'text-delta'
                ? delta.x_agent_event.event.delta
                : undefined;
            if (delta.durableReplay && canonicalText !== undefined) {
              const reconciled = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              );
              unacknowledgedPublicText = reconciled.pending;
              contentChunk = reconciled.unmatchedIncoming;
            }
            if (contentChunk) cloudContentRaw += contentChunk;
            if (!delta.durableReplay && contentChunk) unacknowledgedPublicText += contentChunk;
            if (!delta.durableReplay && canonicalText !== undefined) {
              unacknowledgedPublicText = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              ).pending;
            }
            const parsedTags = parseLocalThinking(cloudContentRaw);
            const newContent = parsedTags.content;
            const newReasoning = [priorReasoning, parsedTags.reasoning]
              .filter(Boolean)
              .join('\n\n');

            accumulateToolCallDelta(toolAcc, delta);
            const nativeCitation = nativeCitationFromDelta(delta[WEB_SEARCH_CITATION_DELTA_KEY]);
            if (nativeCitation) turnNativeCitations.push(nativeCitation);
            const toolCalls = toolCallList(toolAcc);
            if (
              nativeCitation ||
              delta.x_tool_result ||
              delta.x_search_results ||
              (delta.x_agent_event &&
                messageKindForAgentEvent(delta.x_agent_event.event.type) === 'citation')
            ) {
              liveSources = turnSourcesWithActivity(toolCalls, turnNativeCitations, agentActivity);
            }
            if (nativeCitation) {
              inlineCitations.recordCitation(nativeCitation.url, liveSources, newContent.length);
            }
            inlineCitations.recordSearchResults(delta.x_search_results);
            const displayedContent = inlineCitations.apply(newContent, liveSources, false);

            const approvalReq = delta.x_tool_approval_request;
            if (
              approvalReq?.tool_call_id &&
              !turnPendingApprovals.some((c) => c.toolCallId === approvalReq.tool_call_id)
            ) {
              turnPendingApprovals.push({
                toolCallId: approvalReq.tool_call_id,
                name: approvalReq.name,
              });
            }
            trackPhoneDeviceStep(turnPendingApprovals, delta);
            recordToolInputRequest(turnPendingInputs, delta);

            if (delta.x_generated_files) {
              turnGeneratedFiles.push(...parseGeneratedFilesDelta(delta.x_generated_files));
            }

            if (delta.x_interactive_card) {
              const card = parseInteractiveCardDelta(delta.x_interactive_card);
              if (card) {
                const existing = turnInteractiveCards.findIndex(
                  (entry) => entry.cardId === card.cardId,
                );
                if (existing >= 0) turnInteractiveCards[existing] = card;
                else turnInteractiveCards.push(card);
                recordCardTextOffset(turnCardTextOffsets, card.cardId, newContent);
              }
            }

            if (typeof delta.finish_reason === 'string' && delta.finish_reason) {
              turnFinishReason = delta.finish_reason;
            }
            turnStreamError ??= parseStreamFailure(delta.x_stream_error);

            const innerMsgStore = getConversationMessageStore(conversationId);
            const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...withoutAnsweredInput(m, turn),
                    content: displayedContent,
                    reasoning: newReasoning || undefined,
                    isStreaming: true,
                    ...(toolCalls.length > 0 ? { toolCalls } : {}),
                    ...(liveSources.length > 0 ? { citations: liveSources } : {}),
                    ...(agentActivity
                      ? { metadata: { ...withoutAnsweredInput(m, turn).metadata, agentActivity } }
                      : {}),
                  }
                : m,
            );
            set({ streamingContent: displayedContent, streamingReasoning: newReasoning });
            innerMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
          },

          onDone: () => {
            if (!isApprovalAccountCurrent()) return;
            const finalToolCalls = toolCallList(toolAcc);
            const finalCitations = turnSourcesWithActivity(
              finalToolCalls,
              turnNativeCitations,
              agentActivity,
            );
            const innerMsgStore = getConversationMessageStore(conversationId);
            const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
            const finalContent = inlineCitations.hasPlacements()
              ? inlineCitations.apply(
                  parseLocalThinking(cloudContentRaw).content,
                  finalCitations,
                  true,
                )
              : (msgs.find((m) => m.id === assistantMessageId)?.content ?? '');
            const completedAt = new Date().toISOString();
            const convTitle =
              innerMsgStore.getState().conversations.find((c) => c.id === conversationId)?.title ??
              '';
            const generatedFilesMetadata = generatedFileMetadataFromWire(turnGeneratedFiles);
            const messageArtifacts = mergeDerivedAndGeneratedFileArtifacts(
              deriveChatMessageArtifacts(
                finalContent,
                conversationId,
                assistantMessageId,
                completedAt,
                approvalArtifactProvenance.scope,
              ),
              generatedFileArtifactsFromWire(turnGeneratedFiles, completedAt),
            );
            captureArtifactsFromMessage(
              finalContent,
              assistantMessageId,
              conversationId,
              convTitle,
              completedAt,
              approvalArtifactProvenance,
            );

            const phoneStepsPaused = pendingPhoneSteps(turnPendingApprovals);
            if (
              agentActivity &&
              turnPendingApprovals.length === 0 &&
              turnPendingInputs.length === 0
            ) {
              agentActivity = settledTurnActivity(agentActivity, {
                toolCalls: finalToolCalls,
                streaming: false,
                hasText: /\S/.test(finalContent),
              });
            }
            const hasTurnMetadata =
              turnFinishReason !== undefined ||
              turnStreamError !== undefined ||
              agentActivity !== undefined ||
              generatedFilesMetadata.length > 0 ||
              turnInteractiveCards.length > 0 ||
              phoneStepsPaused.length > 0 ||
              finalCitations.length > 0 ||
              turn.deviceResults !== undefined;
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...withoutAnsweredInput(m, turn),
                    content: finalContent,
                    isStreaming: false,
                    ...(finalToolCalls.length > 0 ? { toolCalls: finalToolCalls } : {}),
                    ...(messageArtifacts.length > 0 ? { artifacts: messageArtifacts } : {}),
                    ...(finalCitations.length > 0 ? { citations: finalCitations } : {}),
                    ...(turnInteractiveCards.length > 0
                      ? { interactiveCards: turnInteractiveCards }
                      : {}),
                    ...pendingToolInputPatch(turn.runId, turnPendingInputs),
                    ...(hasTurnMetadata
                      ? {
                          metadata: {
                            ...withoutAnsweredInput(m, turn).metadata,
                            ...turnSourceMetadata(finalToolCalls, turnNativeCitations),
                            ...(generatedFilesMetadata.length > 0
                              ? { generatedFiles: generatedFilesMetadata }
                              : {}),
                            ...(turnInteractiveCards.length > 0
                              ? {
                                  interactiveCards: turnInteractiveCards,
                                  interactiveCardTextOffsets: { ...turnCardTextOffsets },
                                }
                              : {}),
                            ...(turnFinishReason !== undefined
                              ? { finishReason: turnFinishReason }
                              : {}),
                            ...(turnStreamError !== undefined
                              ? { streamError: turnStreamError }
                              : {}),
                            ...(agentActivity ? { agentActivity } : {}),
                            phoneDeviceSteps:
                              phoneStepsPaused.length > 0 ? phoneStepsPaused : undefined,
                          },
                        }
                      : {}),
                  }
                : m,
            );
            const preview = finalContent.slice(0, 100);

            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);

            innerMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
              conversations: s.conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, lastMessage: preview, updatedAt: new Date().toISOString() }
                  : c,
              ),
            }));

            if (turnPendingApprovals.length > 0) {
              pendingApprovalTurns.set(
                assistantMessageId,
                pausedTurn(turn.runId, conversationId, turnPendingApprovals),
              );
            } else {
              pendingApprovalTurns.delete(assistantMessageId);
            }

            pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);

            set({ ...streamingFlags(), streamingContent: '', streamingReasoning: '' });
          },

          onError: (error: Error) => {
            markReconnecting(set, assistantMessageId, false);
            if (!isApprovalAccountCurrent()) return;
            turn.resolving = false;
            abortControllers.delete(conversationId);
            streamingConversations.delete(conversationId);
            cloudStreamingConversations.delete(conversationId);

            if (__DEV__) {
              console.warn(
                `[chat-stream] resolveToolApproval onError ${error?.name}: ${error?.message}`,
              );
            }
            const innerMsgStore = getConversationMessageStore(conversationId);
            const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
            const currentContent = turnContentOf(msgs, assistantMessageId);
            const inputTurn = turn.inputAnswers !== undefined;
            const terminal = !inputTurn && isTerminalResumeError(error);
            const inactiveReason = inputTurn ? inactiveInputReason(error) : null;
            const retainDeviceResults =
              turn.deviceResults !== undefined && !terminal && !controller.signal.aborted;
            const pausedAgain =
              !terminal &&
              inactiveReason === null &&
              !controller.signal.aborted &&
              turnPendingApprovals.length > 0;
            if (pausedAgain) {
              pendingApprovalTurns.set(
                assistantMessageId,
                pausedTurn(turn.runId, conversationId, turnPendingApprovals),
              );
            } else if (retainDeviceResults) {
              turn.resultsUndelivered = true;
            } else if (turn.deviceResults || terminal || inputTurn) {
              pendingApprovalTurns.delete(assistantMessageId);
            }
            const checkpointIds = new Set(
              pausedAgain || inputTurn || (turn.deviceResults && !terminal)
                ? []
                : turn.calls.map((c) => c.toolCallId),
            );
            const updatedMsgs = msgs.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...(inactiveReason === null
                      ? m
                      : withToolInputOutcome(withoutAnsweredInput(m, turn), 'expired')),
                    content: currentContent || m.content,
                    isStreaming: false,
                    ...(inputTurn && !pausedAgain && inactiveReason === null && turn.pausedInput
                      ? { pendingToolInput: turn.pausedInput }
                      : {}),
                    toolCalls: (m.toolCalls ?? []).map((t) =>
                      t.toolCallId && checkpointIds.has(t.toolCallId)
                        ? {
                            ...t,
                            status: 'awaiting-approval' as const,
                            requiresApproval: !terminal,
                            approvalDecision: undefined,
                            output: undefined,
                          }
                        : t,
                    ),
                    ...(terminal
                      ? { metadata: { ...m.metadata, phoneDeviceSteps: undefined } }
                      : {}),
                  }
                : m,
            );
            turn.decisions.clear();
            innerMsgStore.setState((s) => ({
              messages: { ...s.messages, [conversationId]: updatedMsgs },
            }));
            pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
            if (
              inputTurn &&
              !pausedAgain &&
              inactiveReason === null &&
              turn.pausedInput &&
              !controller.signal.aborted
            ) {
              setToolInputSendError(assistantMessageId, INPUT_SEND_FAILED);
            }
            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
              error:
                inactiveReason !== null
                  ? INACTIVE_INPUT_MESSAGE
                  : error instanceof ApiHttpError
                    ? withFailureReference(error.message, error.requestId)
                    : GENERIC_TURN_FAILURE,
            });
          },
        },
        controller.signal,
        resumeAfterSequence,
      );
    } catch (caughtErr) {
      if (__DEV__ && isApprovalAccountCurrent()) {
        console.warn('[chat-stream] resolveToolApproval unexpected throw:', caughtErr);
      }
      if (!isApprovalAccountCurrent()) return;
      turn.resolving = false;
      turn.decisions.clear();
      const inputTurn = turn.inputAnswers !== undefined;
      const terminal = !inputTurn && isTerminalResumeError(caughtErr);
      const inactiveReason = inputTurn ? inactiveInputReason(caughtErr) : null;
      const pausedAgain =
        !terminal &&
        inactiveReason === null &&
        !controller.signal.aborted &&
        turnPendingApprovals.length > 0;
      if (pausedAgain) {
        pendingApprovalTurns.set(
          assistantMessageId,
          pausedTurn(turn.runId, conversationId, turnPendingApprovals),
        );
      } else if (turn.deviceResults !== undefined && !terminal && !controller.signal.aborted) {
        turn.resultsUndelivered = true;
      } else if (turn.deviceResults || terminal || inputTurn) {
        pendingApprovalTurns.delete(assistantMessageId);
      }
      if (!controller.signal.aborted) {
        const innerMsgStore = getConversationMessageStore(conversationId);
        const msgs = innerMsgStore.getState().messages[conversationId] ?? [];
        const updatedMsgs = msgs.map((m) =>
          m.id === assistantMessageId
            ? {
                ...(inactiveReason === null
                  ? m
                  : withToolInputOutcome(withoutAnsweredInput(m, turn), 'expired')),
                content: cloudContentRaw || m.content,
                isStreaming: false,
                ...(inputTurn && !pausedAgain && inactiveReason === null && turn.pausedInput
                  ? { pendingToolInput: turn.pausedInput }
                  : {}),
                toolCalls: (m.toolCalls ?? []).map((tool) =>
                  !pausedAgain &&
                  !inputTurn &&
                  tool.toolCallId &&
                  (!turn.deviceResults || terminal) &&
                  turn.calls.some((call) => call.toolCallId === tool.toolCallId)
                    ? {
                        ...tool,
                        status: 'awaiting-approval' as const,
                        requiresApproval: !terminal,
                        approvalDecision: undefined,
                        output: undefined,
                      }
                    : tool,
                ),
              }
            : m,
        );
        innerMsgStore.setState((s) => ({
          messages: { ...s.messages, [conversationId]: updatedMsgs },
        }));
        pushCloudAssistantUpdate(conversationId, updatedMsgs, assistantMessageId);
        if (inputTurn && !pausedAgain && inactiveReason === null && turn.pausedInput) {
          setToolInputSendError(assistantMessageId, INPUT_SEND_FAILED);
        }
      }
      set({
        ...streamingFlags(),
        streamingContent: '',
        streamingReasoning: '',
        ...(inactiveReason !== null ? { error: INACTIVE_INPUT_MESSAGE } : {}),
      });
    } finally {
      lastDeltaTimes.delete(conversationId);
      if (abortControllers.get(conversationId) === controller) {
        abortControllers.delete(conversationId);
      }
      streamingConversations.delete(conversationId);
      cloudStreamingConversations.delete(conversationId);
      if (
        controller.signal.aborted &&
        pendingApprovalTurns.get(assistantMessageId) === turn &&
        isApprovalAccountCurrent()
      ) {
        pendingApprovalTurns.delete(assistantMessageId);
        const stoppedStore = getConversationMessageStore(conversationId);
        const shownMessages = stoppedStore.getState().messages[conversationId] ?? [];
        const stoppedMessages = shownMessages.map((m) => {
          if (m.id !== assistantMessageId) return m;
          if (turn.inputAnswers !== undefined && m.pendingToolInput !== undefined) {
            return withToolInputOutcome(withoutAnsweredInput(m, turn), 'expired');
          }
          if (turn.deviceResults && m.metadata?.phoneDeviceSteps !== undefined) {
            return { ...m, metadata: { ...m.metadata, phoneDeviceSteps: undefined } };
          }
          return m;
        });
        if (stoppedMessages.some((m, index) => m !== shownMessages[index])) {
          stoppedStore.setState((s) => ({
            messages: { ...s.messages, [conversationId]: stoppedMessages },
          }));
          pushCloudAssistantUpdate(conversationId, stoppedMessages, assistantMessageId);
        }
      }
      if (isApprovalAccountCurrent()) {
        const sweepStore = getConversationMessageStore(conversationId);
        const sweepMsgs = sweepStore.getState().messages[conversationId] ?? [];
        const stalled = stalledConversations.delete(conversationId);
        if (sweepMsgs.some((m) => m.id === assistantMessageId && m.isStreaming)) {
          const completedAtMs = Date.now();
          const settledMessages = sweepMsgs.map((m) =>
            m.id === assistantMessageId && m.isStreaming
              ? settleMessageTurnState(
                  stalled ? stoppedByUser(m) : { ...m, isStreaming: false },
                  controller.signal.aborted ? 'cancelled' : 'failed',
                  completedAtMs,
                  controller.signal.aborted ? undefined : GENERIC_TURN_FAILURE,
                )
              : m,
          );
          sweepStore.setState((s) => ({
            messages: {
              ...s.messages,
              [conversationId]: settledMessages,
            },
          }));
          pushCloudAssistantUpdate(conversationId, settledMessages, assistantMessageId);
        }
      }
      set({ ...streamingFlags() });
      void settlePhoneDeviceSteps(conversationId, assistantMessageId);
      flushDeferredSend(conversationId);
    }
  },

  continueCloudAnswer: async (conversationId, assistantMessageId, turn) => {
    const set = failureScopedSet(conversationId);
    const unchecked =
      turn === undefined
        ? cloudAnswerToContinue(conversationId, assistantMessageId, 'stalled')
        : null;
    const mustCheckRun = unchecked !== null && hasUnfinishedRun(unchecked.answer);
    let target = mustCheckRun
      ? unchecked
      : cloudAnswerToContinue(conversationId, assistantMessageId, turn ?? 'idle');
    if (!target) return false;

    const accountEpoch = captureCloudAccountEpoch();
    const { isClerkLoaded, isClerkSignedIn } = useAuthStore.getState();
    if (accountEpoch === null || (FEATURES.auth && isClerkLoaded && !isClerkSignedIn)) {
      set({ error: 'Sign in to use AGI Cloud.', paywallError: null });
      return false;
    }

    if (mustCheckRun) {
      cloudRunChecks.add(conversationId);
      let verdict: InFlightTurnVerdict;
      try {
        verdict = await askWhetherTurnIsRunning(conversationId, new AbortController().signal);
      } catch {
        verdict = 'unknown';
      } finally {
        cloudRunChecks.delete(conversationId);
      }
      if (!isCloudAccountEpochCurrent(accountEpoch)) return false;
      if (verdict === 'running' || verdict === 'waiting') {
        set({ error: IN_FLIGHT_TURN_WAITING_MESSAGE, paywallError: null });
        return false;
      }
      if (verdict !== 'stalled' && verdict !== 'idle') {
        set({
          error: 'Could not continue the Cloud response. Check your connection and retry.',
          paywallError: null,
        });
        return false;
      }
      target = cloudAnswerToContinue(conversationId, assistantMessageId, 'stalled');
      if (!target || !hasUnfinishedRun(target.answer)) return false;
    }
    const { conversation, thread, answer, model } = target;
    const generation = cloudExecutionGeneration;
    const isAccountCurrent = () =>
      generation === cloudExecutionGeneration && isCloudAccountEpochCurrent(accountEpoch);
    const provenance: MobileArtifactProvenance = { scope: 'cloud', ownerId: accountEpoch.ownerId };

    const chatView = useChatViewStore.getState();
    const viewSystemPrompt = buildChatViewSystemPrompt(
      chatView.chatMode,
      styleForConversation(chatView, conversationId),
    );
    const disabledConnectorIds = chatView.disabledConnectorIdsByConversation[conversationId] ?? [];
    const messages: WireHistoryEntry[] = [
      ...(viewSystemPrompt ? [{ role: 'system', content: viewSystemPrompt }] : []),
      ...wireHistory(thread, 'cloud'),
      { role: 'user', content: CONTINUE_GENERATION_INSTRUCTION },
    ];

    const seedContent = answer.content;
    const priorReasoning = answer.reasoning ?? '';
    const priorFinishReason = answer.metadata?.finishReason;
    const priorStreamError = answer.metadata?.streamError;
    const controller = new AbortController();
    abortControllers.set(conversationId, controller);
    streamingConversations.add(conversationId);
    cloudStreamingConversations.add(conversationId);
    cancelledBeforeStream.delete(conversationId);
    lastDeltaTimes.set(conversationId, Date.now());

    const patchAnswer = (patch: (message: ChatMessage) => ChatMessage): ChatMessage[] => {
      const store = getConversationMessageStore(conversationId);
      const next = (store.getState().messages[conversationId] ?? []).map((m) =>
        m.id === assistantMessageId ? patch(m) : m,
      );
      store.setState((s) => ({ messages: { ...s.messages, [conversationId]: next } }));
      return next;
    };
    const releaseConversation = () => {
      abortControllers.delete(conversationId);
      streamingConversations.delete(conversationId);
      cloudStreamingConversations.delete(conversationId);
      activeCloudRuns.delete(conversationId);
    };

    patchAnswer((m) => ({
      ...m,
      isStreaming: true,
      metadata: {
        ...m.metadata,
        finishReason: undefined,
        ...(priorStreamError !== undefined ? { streamError: undefined } : {}),
      },
    }));
    set({
      ...streamingFlags(),
      streamingContent: seedContent,
      streamingReasoning: priorReasoning,
      error: null,
      failureCode: null,
      paywallError: null,
    });

    let continuationRaw = '';
    let continuationText = '';
    let continuationReasoning = '';
    let unacknowledgedPublicText = '';
    let seam: { consumed: number; repaired: string } | null = null;
    let finishReason: string | undefined;
    let streamError: StreamFailure | undefined;
    let cloudAgentRun: ManagedCloudAgentRunReference | undefined;

    const continuation = (final: boolean): string => {
      if (!seam) {
        if (!final && continuationText.length < SEAM_INSPECTION_WINDOW) return '';
        seam = {
          consumed: continuationText.length,
          repaired: repairContinuationSeam(seedContent, continuationText),
        };
      }
      return seam.repaired + continuationText.slice(seam.consumed);
    };
    const reasoning = () =>
      [priorReasoning, continuationReasoning].filter(Boolean).join('\n\n') || undefined;

    try {
      await streamChat(
        {
          model,
          messages,
          stream: true,
          operationId: uuidv7(),
          ...(CLOUD_CONVERSATION_ID.test(conversationId)
            ? { conversation_id: conversationId }
            : {}),
          ...(useChatViewStore.getState().features.webSearch === false
            ? { web_search: false }
            : {}),
          ...(disabledConnectorIds.length > 0
            ? { disabled_connector_ids: disabledConnectorIds }
            : {}),
          ...(conversation.temporary === true &&
          !useSettingsStore.getState().temporaryChatPersonalized
            ? { personalization: false as const }
            : {}),
        },
        {
          onReconnecting: () => markReconnecting(set, assistantMessageId, true),
          onRunReference: (reference) => {
            if (controller.signal.aborted || !isAccountCurrent()) return;
            const run = {
              ...reference,
              lastSequence: Math.max(cloudAgentRun?.lastSequence ?? -1, reference.lastSequence),
            };
            cloudAgentRun = run;
            activeCloudRuns.set(conversationId, { ...run });
            patchAnswer((m) => ({ ...m, metadata: { ...m.metadata, cloudAgentRun: { ...run } } }));
          },
          onDelta: (delta: StreamDelta) => {
            if (controller.signal.aborted || !isAccountCurrent()) return;
            markReconnecting(set, assistantMessageId, false);
            lastDeltaTimes.set(conversationId, Date.now());

            let chunk = delta.content;
            const canonicalText =
              delta.x_agent_event?.event.type === 'text-delta'
                ? delta.x_agent_event.event.delta
                : undefined;
            if (delta.durableReplay && canonicalText !== undefined) {
              const reconciled = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              );
              unacknowledgedPublicText = reconciled.pending;
              chunk = reconciled.unmatchedIncoming;
            }
            if (chunk) {
              const previousText = continuationText;
              continuationRaw += chunk;
              const parsed = parseLocalThinking(continuationRaw);
              // The parser trims leading whitespace, which here is the model's
              // own word or paragraph boundary with the text it continues.
              const leading = parsed.hasReasoning ? '' : (/^\s+/.exec(continuationRaw)?.[0] ?? '');
              continuationText = leading + parsed.content;
              continuationReasoning = parsed.reasoning;
              if (!delta.durableReplay && continuationText.startsWith(previousText)) {
                unacknowledgedPublicText += continuationText.slice(previousText.length);
              }
            }
            if (!delta.durableReplay && canonicalText !== undefined) {
              unacknowledgedPublicText = reconcileManagedCloudPublicText(
                unacknowledgedPublicText,
                canonicalText,
              ).pending;
            }
            if (typeof delta.finish_reason === 'string' && delta.finish_reason) {
              finishReason = delta.finish_reason;
            }
            streamError ??= parseStreamFailure(delta.x_stream_error);

            const content = seedContent + continuation(false);
            const nextReasoning = reasoning();
            set({ streamingContent: content, streamingReasoning: nextReasoning ?? '' });
            patchAnswer((m) => ({ ...m, content, reasoning: nextReasoning, isStreaming: true }));
          },
          onDone: () => {
            markReconnecting(set, assistantMessageId, false);
            if (controller.signal.aborted || !isAccountCurrent()) return;
            const added = continuation(true);
            releaseConversation();
            const failed = streamError !== undefined || !added.trim();
            const content = seedContent + added;
            const completedAt = new Date().toISOString();
            let artifacts: NonNullable<ChatMessage['artifacts']> = [];
            if (added) {
              const conversationTitle =
                getConversationMessageStore(conversationId)
                  .getState()
                  .conversations.find((c) => c.id === conversationId)?.title ?? '';
              artifacts = mergeDerivedAndGeneratedFileArtifacts(
                deriveChatMessageArtifacts(
                  content,
                  conversationId,
                  assistantMessageId,
                  completedAt,
                  provenance.scope,
                ),
                generatedFileArtifactsFromWire(
                  generatedFileWireFromMetadata(answer.metadata?.generatedFiles),
                  completedAt,
                ),
              );
              captureArtifactsFromMessage(
                content,
                assistantMessageId,
                conversationId,
                conversationTitle,
                completedAt,
                provenance,
              );
            }
            const settled = patchAnswer((m) => ({
              ...m,
              content,
              reasoning: reasoning(),
              isStreaming: false,
              ...(artifacts.length > 0 ? { artifacts } : {}),
              metadata: {
                ...m.metadata,
                finishReason: failed ? priorFinishReason : finishReason,
                ...(failed && priorStreamError !== undefined
                  ? { streamError: priorStreamError }
                  : {}),
                ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
              },
            }));
            if (added) {
              getConversationMessageStore(conversationId).setState((s) => ({
                conversations: s.conversations.map((c) =>
                  c.id === conversationId
                    ? { ...c, lastMessage: content.slice(0, 100), updatedAt: completedAt }
                    : c,
                ),
              }));
              pushCloudAssistantUpdate(conversationId, settled, assistantMessageId);
            }
            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
              ...(failed
                ? {
                    error: streamError
                      ? withFailureReference(streamError.message, streamError.requestId)
                      : CONTINUE_FAILED_MESSAGE,
                  }
                : {}),
            });
          },
          onError: (error: Error) => {
            markReconnecting(set, assistantMessageId, false);
            if (controller.signal.aborted || !isAccountCurrent()) return;
            releaseConversation();
            const added = continuation(true);
            const interruptedFailure =
              error instanceof StreamConnectionLostError
                ? { ...CONNECTION_LOST_FAILURE }
                : priorStreamError;
            const settled = patchAnswer((m) => ({
              ...m,
              content: seedContent + added,
              reasoning: reasoning(),
              isStreaming: false,
              metadata: {
                ...m.metadata,
                finishReason: priorFinishReason,
                ...(interruptedFailure !== undefined ? { streamError: interruptedFailure } : {}),
                ...(cloudAgentRun ? { cloudAgentRun: { ...cloudAgentRun } } : {}),
              },
            }));
            if (added) pushCloudAssistantUpdate(conversationId, settled, assistantMessageId);
            set({
              ...streamingFlags(),
              streamingContent: '',
              streamingReasoning: '',
              ...continuationFailure(error),
            });
          },
        },
        controller.signal,
        { ignorePickerSpeed: true, purpose: 'continue' },
      );
      return true;
    } catch (caughtErr) {
      if (!isAccountCurrent()) return true;
      if (!controller.signal.aborted) set(continuationFailure(caughtErr));
      return true;
    } finally {
      lastDeltaTimes.delete(conversationId);
      if (abortControllers.get(conversationId) === controller) {
        abortControllers.delete(conversationId);
      }
      streamingConversations.delete(conversationId);
      cloudStreamingConversations.delete(conversationId);
      if (isAccountCurrent()) {
        const stillStreaming = (
          getConversationMessageStore(conversationId).getState().messages[conversationId] ?? []
        ).some((m) => m.id === assistantMessageId && m.isStreaming);
        if (stillStreaming) {
          const settled = patchAnswer((m) => ({
            ...m,
            isStreaming: false,
            metadata: {
              ...m.metadata,
              finishReason: controller.signal.aborted ? 'stopped' : priorFinishReason,
              ...(!controller.signal.aborted && priorStreamError !== undefined
                ? { streamError: priorStreamError }
                : {}),
            },
          }));
          pushCloudAssistantUpdate(conversationId, settled, assistantMessageId);
        }
      }
      set({ ...streamingFlags() });
      flushDeferredSend(conversationId);
    }
  },

  stopStreaming: () => {
    const finishStop = (currentId: string | null) => {
      const targetId = currentId && streamingConversations.has(currentId) ? currentId : null;

      if (!targetId) {
        const cid = currentId;
        if (cid) {
          activeCloudRuns.delete(cid);
          cancelledBeforeStream.add(cid);
          const ownerStore = getConversationMessageStore(cid);
          const msgs = ownerStore.getState().messages[cid] ?? [];
          const hasStreaming = msgs.some((m) => m.isStreaming);
          if (hasStreaming) {
            const stoppedAssistantIds = new Set(
              msgs
                .filter((message) => message.isStreaming && message.role === 'assistant')
                .map((message) => message.id),
            );
            const completedAtMs = Date.now();
            const stoppedMessages = msgs.map((m) =>
              m.isStreaming
                ? settleMessageTurnState(stoppedByUser(m), 'cancelled', completedAtMs)
                : m,
            );
            ownerStore.setState((s) => ({
              messages: {
                ...s.messages,
                [cid]: stoppedMessages,
              },
            }));
            const conversation = ownerStore
              .getState()
              .conversations.find((candidate) => candidate.id === cid);
            if (conversation && executionModeForConversation(conversation) === 'cloud') {
              queueCloudTurnForSync(
                cid,
                stoppedMessages.filter((message) => stoppedAssistantIds.has(message.id)),
              );
              void syncNow();
            }
          }
        }
        set({
          ...streamingFlags(),
          streamingContent: '',
          streamingReasoning: '',
        });
        return;
      }

      thinkingStartTimes.delete(targetId);
      thinkingEndTimes.delete(targetId);
      lastDeltaTimes.delete(targetId);
      const ctrl = abortControllers.get(targetId);
      activeCloudRuns.delete(targetId);
      if (ctrl) {
        ctrl.abort();
        abortControllers.delete(targetId);
      }
      streamingConversations.delete(targetId);

      const ownerStore = getConversationMessageStore(targetId);
      const msgs = ownerStore.getState().messages[targetId] ?? [];
      const stoppedAssistantIds = new Set(
        msgs
          .filter((message) => message.isStreaming && message.role === 'assistant')
          .map((message) => message.id),
      );
      const completedAtMs = Date.now();
      const stoppedMessages = msgs.map((m) =>
        m.isStreaming ? settleMessageTurnState(stoppedByUser(m), 'cancelled', completedAtMs) : m,
      );
      ownerStore.setState((s) => ({
        messages: {
          ...s.messages,
          [targetId]: stoppedMessages,
        },
      }));
      const conversation = ownerStore
        .getState()
        .conversations.find((candidate) => candidate.id === targetId);
      if (conversation && executionModeForConversation(conversation) === 'cloud') {
        queueCloudTurnForSync(
          targetId,
          stoppedMessages.filter((message) => stoppedAssistantIds.has(message.id)),
        );
        void syncNow();
      }

      set({
        ...streamingFlags(),
        streamingContent: '',
        streamingReasoning: '',
      });
    };

    const runConversationId = getMsgStore().getState().currentConversationId;
    const activeRun = runConversationId ? activeCloudRuns.get(runConversationId) : undefined;
    if (!runConversationId || !activeRun) {
      finishStop(runConversationId);
      return;
    }
    void cancelMobileCloudAgentRun(activeRun.runId).catch(() => {
      failureScopedSet(runConversationId)({
        error: 'Could not stop the Cloud task. Check its activity before retrying.',
      });
    });
    finishStop(runConversationId);
  },

  retryMessage: (conversationId, messageId, modelOverride) => {
    const set = failureScopedSet(conversationId, () => ({ kind: 'regenerate', messageId }));
    const state = get();
    if (streamingConversations.has(conversationId)) return;

    const msgStore = getConversationMessageStore(conversationId);
    const conversation = msgStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    const branches = keepsEarlierVersions(conversation);
    const rows = msgStore.getState().messages[conversationId];
    if (!rows) return;
    const msgs = branches
      ? visibleThreadFor(withThreadParents(conversationId, rows), conversation)
      : rows;

    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return;

    const target = msgs[msgIndex];
    if (!target) return;
    let userMsg: (typeof msgs)[number] | null = null;
    let assistantMsg: (typeof msgs)[number] | undefined;
    if (target.role === 'assistant') {
      assistantMsg = target;
      userMsg = msgIndex > 0 ? (msgs[msgIndex - 1] ?? null) : null;
    } else if (target.role === 'user') {
      userMsg = target;
      const next = msgs[msgIndex + 1];
      assistantMsg = next && next.role === 'assistant' ? next : undefined;
    } else {
      return;
    }
    const undeliveredTurn = assistantMsg ? undeliveredDeviceTurn(assistantMsg.id) : null;
    if (assistantMsg && undeliveredTurn) {
      undeliveredTurn.resultsUndelivered = false;
      undeliveredTurn.resolving = true;
      get()
        .continuePausedCloudTurn(conversationId, assistantMsg.id)
        .catch((err: unknown) => {
          console.warn('[chatExecutionStore] Device result delivery failed:', err);
          set({ error: 'Retry failed. Please try again.' });
        });
      return;
    }
    if (!userMsg || userMsg.role !== 'user') return;
    const userIndex = rows.findIndex((m) => m.id === userMsg.id);
    if (userIndex < 0) return;

    const retriesFailure =
      assistantMsg === undefined ||
      assistantMsg.status === 'error' ||
      assistantMsg.metadata?.['streamError'] !== undefined;
    const currentAttempts = retriesFailure ? (state.retryAttempts[messageId] ?? 0) : 0;
    const nextAttempt = currentAttempts + 1;

    if (nextAttempt > MAX_RETRY_ATTEMPTS) {
      Alert.alert(
        'Retry Limit Reached',
        `This message failed ${MAX_RETRY_ATTEMPTS} times. Try sending a new message.`,
        [{ text: 'OK' }],
      );
      return;
    }

    const backoffMs = nextAttempt > 1 ? 1000 * Math.pow(2, nextAttempt - 2) : 0;
    const userContent = userMsg.content;
    // The question included these files, so a retry that drops them asks a
    // different question and the answer stops making sense. Already-uploaded
    // assets are reused rather than sent again.
    const userAttachments = restoreComposerAttachments(userMsg.attachments);
    const bannerChoice = takeBannerModelChoice(conversationId);
    const userModel =
      modelOverride ?? bannerChoice ?? userMsg.model ?? assistantMsg?.model ?? DEFAULT_AUTO_MODE_ID;
    const {
      skillName: retrySkillName,
      codeExecution: retryCodeExecution,
      officeCreation: retryOfficeCreation,
    } = replayToSendOptions(sendReplayOf(userMsg.metadata));
    const retrySkill = retrySkillName
      ? {
          skillName: retrySkillName,
          skillTools: {
            codeExecution: retryCodeExecution === true,
            officeCreation: retryOfficeCreation === true,
          },
        }
      : {};
    const isCloudRetry =
      conversation !== undefined && executionModeForConversation(conversation) === 'cloud';
    const retryAccountEpoch = isCloudRetry ? captureCloudAccountEpoch() : null;
    const isRetryCurrent = () => !isCloudRetry || isCloudAccountEpochCurrent(retryAccountEpoch);
    if (!isRetryCurrent()) return;

    const anchorMessageId = userMsg.id;
    const removedCount = rows.length - userIndex;
    const countedRemoved = target.role === 'assistant' ? removedCount : 0;
    const trimmedMsgs = rows.slice(0, userIndex);
    const replaceAndRetry = async () => {
      if (!isRetryCurrent()) return;
      if (branches) {
        const linearRows = msgStore.getState().messages[conversationId] ?? rows;
        const leafBefore = activeLeafOf(conversationId);
        // Stamped only now, so the answer already on screen has a question to
        // hang off and the new answer becomes its sibling, and so a retry
        // abandoned before this point leaves no parents behind.
        const stampedRows = ensureLocalThreadParents(conversationId);
        try {
          await get().sendMessage(conversationId, userContent, userModel, userAttachments, {
            ...retrySkill,
            regenerateParentMessageId: anchorMessageId,
            retryOfMessageId: anchorMessageId,
          });
        } finally {
          forgetUnusedThreadParents(conversationId, linearRows, stampedRows, leafBefore);
        }
        return;
      }

      const replacedRows = rows.slice(userIndex);
      const replacedIds = new Set(replacedRows.map((message) => message.id));
      const adjustMessageCount =
        (delta: number) =>
        <T extends { id: string; messageCount?: number }>(candidate: T): T =>
          candidate.id === conversationId
            ? { ...candidate, messageCount: Math.max(0, (candidate.messageCount ?? 0) + delta) }
            : candidate;

      msgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: trimmedMsgs },
        conversations: s.conversations.map(adjustMessageCount(-countedRemoved)),
      }));

      let accepted = false;
      try {
        await get().sendMessage(conversationId, userContent, userModel, userAttachments, {
          ...retrySkill,
          retryOfMessageId: anchorMessageId,
          onAccepted: () => {
            accepted = true;
            removeArtifactsOfMessages(replacedRows);
            if (!isCloudRetry) return;
            void deleteCloudMessagesRemote(
              conversationId,
              replacedRows.map((message) => message.id),
              retryAccountEpoch,
            ).catch(() => {
              if (isRetryCurrent()) {
                failureScopedSet(conversationId)({
                  error:
                    'The earlier Cloud response could not be removed. It may reappear after the next sync.',
                });
              }
            });
          },
        });
      } finally {
        if (!accepted && isRetryCurrent()) {
          msgStore.setState((s) => ({
            messages: {
              ...s.messages,
              [conversationId]: [
                ...(s.messages[conversationId] ?? []).filter(
                  (message) => !replacedIds.has(message.id),
                ),
                ...replacedRows,
              ],
            },
            conversations: s.conversations.map(adjustMessageCount(countedRemoved)),
          }));
        }
      }
    };

    const runRetry = () => {
      replaceAndRetry().catch((err: unknown) => {
        console.warn('[chatExecutionStore] Retry failed:', err);
        if (isRetryCurrent()) set({ error: 'Retry failed. Please try again.' });
      });
    };

    const startRetry = () => {
      if (!isRetryCurrent()) return;
      if (retriesFailure) {
        set((s) => ({ retryAttempts: { ...s.retryAttempts, [messageId]: nextAttempt } }));
      }
      if (backoffMs > 0) {
        setTimeout(runRetry, backoffMs);
      } else {
        runRetry();
      }
    };

    confirmBeforeRewrite(conversationId, (assistantMsg ?? userMsg).id, 'regenerate', startRetry);
  },

  resumeResearch: async (conversationId, assistantMessageId, decision, steps, choices, answers) => {
    const set = failureScopedSet(conversationId);
    if (streamingConversations.has(conversationId)) return;

    const msgStore = getConversationMessageStore(conversationId);
    const conversation = msgStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    const branches =
      conversation !== undefined &&
      executionModeForConversation(conversation) === 'cloud' &&
      isThreadingCapableConversation(conversation);
    const rows = branches
      ? ensureLocalThreadParents(conversationId)
      : msgStore.getState().messages[conversationId];
    if (!rows) return;
    const msgs = branches ? visibleThreadFor(rows, conversation) : rows;

    const assistantIndex = msgs.findIndex((m) => m.id === assistantMessageId);
    const assistantMsg = assistantIndex >= 0 ? msgs[assistantIndex] : undefined;
    if (!assistantMsg || assistantMsg.role !== 'assistant') return;
    const research = readResearchRunState(assistantMsg.metadata?.research);
    if (!research) return;

    if (decision === 'cancel') {
      if (research.phase !== 'awaiting_approval') return;
      const cancelled: ResearchRunState = {
        ...research,
        phase: 'interrupted',
        label: 'Research plan cancelled',
      };
      const cancelledRows = rows.map((m) =>
        m.id === assistantMessageId
          ? { ...m, metadata: { ...m.metadata, research: cancelled } }
          : m,
      );
      msgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: cancelledRows },
      }));
      if (conversation && executionModeForConversation(conversation) === 'cloud') {
        pushCloudAssistantUpdate(conversationId, cancelledRows, assistantMessageId);
      }
      return;
    }

    if (decision === 'retry' && research.phase === 'complete') {
      const question = assistantIndex > 0 ? msgs[assistantIndex - 1] : undefined;
      if (question?.role !== 'user') return;
      await get().sendMessage(
        conversationId,
        question.content,
        question.model ?? assistantMsg.model ?? DEFAULT_AUTO_MODE_ID,
        undefined,
        { research: true },
      );
      return;
    }

    const resume = {
      ...researchResumePayload(steps ? { ...research, steps } : research),
      ...(choices ? { deliverable: choices.deliverable } : {}),
      ...(decision === 'start' && answers?.trim() ? { guidance: answers.trim() } : {}),
    };
    const runSources = choices?.sources ?? research.runConfig?.sources;
    const researchSources =
      runSources && hasResearchSourceChoice(runSources) ? runSources : undefined;
    if (decision === 'start') {
      if (research.phase !== 'awaiting_approval' || resume.approvedSteps.length === 0) return;
    } else if (!isResearchRunResumable(research)) {
      return;
    }

    const userMsg = assistantIndex > 0 ? msgs[assistantIndex - 1] : undefined;
    if (!userMsg || userMsg.role !== 'user') return;
    const userIndex = rows.findIndex((m) => m.id === userMsg.id);
    if (userIndex < 0) return;

    const userModel = userMsg.model ?? assistantMsg.model ?? DEFAULT_AUTO_MODE_ID;
    const isCloudResume =
      conversation !== undefined && executionModeForConversation(conversation) === 'cloud';
    const resumeAccountEpoch = isCloudResume ? captureCloudAccountEpoch() : null;
    const isResumeCurrent = () => !isCloudResume || isCloudAccountEpochCurrent(resumeAccountEpoch);
    if (!isResumeCurrent()) return;

    if (branches) {
      await get().sendMessage(conversationId, userMsg.content, userModel, undefined, {
        regenerateParentMessageId: userMsg.id,
        research: true,
        researchResume: resume,
        ...(researchSources ? { researchSources } : {}),
      });
      return;
    }

    if (isCloudResume) {
      try {
        await deleteCloudMessagesRemote(
          conversationId,
          rows.slice(userIndex).map((message) => message.id),
          resumeAccountEpoch,
        );
      } catch {
        if (isResumeCurrent()) {
          set({ error: 'Could not replace the Cloud response. Check your connection and retry.' });
        }
        return;
      }
    }

    if (!isResumeCurrent()) return;

    const trimmedMsgs = rows.slice(0, userIndex);
    const removedCount = rows.length - userIndex;
    msgStore.setState((s) => ({
      messages: { ...s.messages, [conversationId]: trimmedMsgs },
      conversations: s.conversations.map((candidate) =>
        candidate.id === conversationId
          ? {
              ...candidate,
              messageCount: Math.max(0, (candidate.messageCount ?? 0) - removedCount),
            }
          : candidate,
      ),
    }));

    await get().sendMessage(conversationId, userMsg.content, userModel, undefined, {
      research: true,
      researchResume: resume,
      ...(researchSources ? { researchSources } : {}),
    });
  },

  respondToInteractiveCard: async (conversationId, assistantMessageId, cardId, payload) => {
    const set = failureScopedSet(conversationId);
    if (streamingConversations.has(conversationId)) return false;
    const inFlightKey = `${assistantMessageId}:${cardId}`;
    if (interactiveCardResponsesInFlight.has(inFlightKey)) return false;
    interactiveCardResponsesInFlight.add(inFlightKey);
    const accountEpoch = captureCloudAccountEpoch();
    try {
      let settled: InteractiveCard | null;
      try {
        settled = parseInteractiveCardDelta(
          await api.post<unknown>(INTERACTIVE_CARD_RESPONSE_PATH, {
            conversation_id: conversationId,
            message_id: assistantMessageId,
            card_id: cardId,
            response: payload,
          }),
        );
      } catch {
        return false;
      }
      if (!settled?.recognized || !isCloudAccountEpochCurrent(accountEpoch)) return false;
      const settledCard = settled;

      const msgStore = getConversationMessageStore(conversationId);
      const rows = msgStore.getState().messages[conversationId] ?? [];
      const message = rows.find((m) => m.id === assistantMessageId);
      if (!message) return false;
      const cards = (
        message.interactiveCards ?? readPersistedInteractiveCards(message.metadata)
      ).map((card) => (card.cardId === settledCard.cardId ? settledCard : card));
      const resumes =
        clarifyCardNeedsResume(settledCard) && message.metadata?.interactiveCardsResumed !== true;
      const nextRows = rows.map((m) =>
        m.id === assistantMessageId
          ? {
              ...m,
              interactiveCards: cards,
              metadata: {
                ...m.metadata,
                interactiveCards: cards,
                ...(resumes ? { interactiveCardsResumed: true } : {}),
              },
            }
          : m,
      );
      msgStore.setState((s) => ({ messages: { ...s.messages, [conversationId]: nextRows } }));
      pushCloudAssistantUpdate(conversationId, nextRows, assistantMessageId);

      const turn = resumes ? settledClarifyTurn(cards) : null;
      if (turn) {
        const thread = historyMessagesForConversation(conversationId, 'cloud');
        const answeredIndex = thread.findIndex((m) => m.id === assistantMessageId);
        const question = thread
          .slice(0, Math.max(0, answeredIndex))
          .reverse()
          .find((m) => m.role === 'user');
        void get().sendMessage(
          conversationId,
          turn,
          question?.model ?? message.model ?? DEFAULT_AUTO_MODE_ID,
          undefined,
          { interactiveCardResume: true },
        );
      }
      return true;
    } finally {
      interactiveCardResponsesInFlight.delete(inFlightKey);
    }
  },

  resolveAgiWorkPlan: async (conversationId, assistantMessageId, decision) => {
    const set = failureScopedSet(conversationId);
    if (streamingConversations.has(conversationId)) return;
    if (agiWorkPlanDecisionsInFlight.has(assistantMessageId)) return;

    const msgStore = getConversationMessageStore(conversationId);
    const conversation = msgStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    const isCloud =
      conversation !== undefined && executionModeForConversation(conversation) === 'cloud';
    const branches = isCloud && isThreadingCapableConversation(conversation);
    const rows = branches
      ? ensureLocalThreadParents(conversationId)
      : msgStore.getState().messages[conversationId];
    if (!rows) return;
    const msgs = branches ? visibleThreadFor(rows, conversation) : rows;

    const assistantIndex = msgs.findIndex((m) => m.id === assistantMessageId);
    const assistantMsg = assistantIndex >= 0 ? msgs[assistantIndex] : undefined;
    if (!assistantMsg || assistantMsg.role !== 'assistant') return;
    const steps = readAgiWorkPlanSteps(assistantMsg.metadata?.agiWorkPlan);
    const review = readAgiWorkPlanReview(assistantMsg.metadata?.agiWorkPlanReview);
    if (!steps || !review) return;

    if (decision.kind === 'cancel') {
      const cancelledRows = rows.map((m) =>
        m.id === assistantMessageId
          ? {
              ...m,
              metadata: {
                ...m.metadata,
                agiWorkPlan: steps.map((step) => ({ ...step, status: 'cancelled' as const })),
                agiWorkPlanReview: { ...review, awaitingApproval: false },
              },
            }
          : m,
      );
      msgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: cancelledRows },
      }));
      if (!isCloud) return;
      pushCloudAssistantUpdate(conversationId, cancelledRows, assistantMessageId);
      const run = ManagedCloudAgentRunReferenceSchema.safeParse(
        assistantMsg.metadata?.cloudAgentRun,
      );
      if (!run.success) return;
      const accountEpoch = captureCloudAccountEpoch();
      try {
        await cancelCloudRun(run.data.runId);
      } catch (error) {
        if (isCloudRunGone(error) || !isCloudAccountEpochCurrent(accountEpoch)) return;
        set({ error: describeCloudRunError(error, CLOUD_RUN_CANCEL_ERROR) });
      }
      return;
    }

    const userMsg = assistantIndex > 0 ? msgs[assistantIndex - 1] : undefined;
    if (!userMsg || userMsg.role !== 'user') return;
    const userModel = userMsg.model ?? assistantMsg.model ?? DEFAULT_AUTO_MODE_ID;

    agiWorkPlanDecisionsInFlight.add(assistantMessageId);
    try {
      if (decision.kind === 'retry') {
        const step = steps[decision.fromIndex];
        if (!step) return;
        await get().sendMessage(
          conversationId,
          agiWorkPlanRetryMessage(decision.fromIndex, step),
          userModel,
          undefined,
          {
            workMode: 'agiwork',
            agiWorkGoal: review.goal,
            agiWorkPlan: steps.slice(decision.fromIndex).map((entry) => entry.description),
          },
        );
        return;
      }

      const planOptions: SendMessageOptions = {
        workMode: 'agiwork',
        agiWorkGoal: review.goal,
        agiWorkPlan: decision.steps,
      };
      const userAttachments = restoreComposerAttachments(userMsg.attachments);
      const accountEpoch = isCloud ? captureCloudAccountEpoch() : null;
      const isDecisionCurrent = () => !isCloud || isCloudAccountEpochCurrent(accountEpoch);

      if (branches) {
        await get().sendMessage(conversationId, userMsg.content, userModel, userAttachments, {
          ...planOptions,
          regenerateParentMessageId: userMsg.id,
        });
        return;
      }

      const userIndex = rows.findIndex((m) => m.id === userMsg.id);
      if (userIndex < 0) return;

      if (isCloud) {
        try {
          await deleteCloudMessagesRemote(
            conversationId,
            rows.slice(userIndex).map((message) => message.id),
            accountEpoch,
          );
        } catch {
          if (isDecisionCurrent()) {
            set({
              error: 'Could not replace the Cloud response. Check your connection and retry.',
            });
          }
          return;
        }
      }

      if (!isDecisionCurrent()) return;

      const removedCount = rows.length - userIndex;
      msgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: rows.slice(0, userIndex) },
        conversations: s.conversations.map((candidate) =>
          candidate.id === conversationId
            ? {
                ...candidate,
                messageCount: Math.max(0, (candidate.messageCount ?? 0) - removedCount),
              }
            : candidate,
        ),
      }));

      await get().sendMessage(
        conversationId,
        userMsg.content,
        userModel,
        userAttachments,
        planOptions,
      );
    } finally {
      agiWorkPlanDecisionsInFlight.delete(assistantMessageId);
    }
  },

  editMessage: (conversationId, messageId, newContent, attachments) => {
    const set = failureScopedSet(conversationId);
    const state = get();

    if (streamingConversations.has(conversationId)) {
      Alert.alert(
        'Cannot Edit',
        'Please wait for the current response to finish before editing a message.',
        [{ text: 'OK' }],
      );
      return false;
    }

    if (state.isEditing) return false;

    const msgStore = getConversationMessageStore(conversationId);
    const conversation = msgStore
      .getState()
      .conversations.find((candidate) => candidate.id === conversationId);
    const branches = keepsEarlierVersions(conversation);
    const msgs = msgStore.getState().messages[conversationId];
    if (!msgs) return false;

    const msgIndex = msgs.findIndex((m) => m.id === messageId);
    if (msgIndex < 0) return false;

    const targetMsg = msgs[msgIndex];
    if (!targetMsg || targetMsg.role !== 'user') return false;

    const userModel = targetMsg.model ?? DEFAULT_AUTO_MODE_ID;
    const editedAttachments = restoreComposerAttachments(attachments ?? targetMsg.attachments);
    const isCloudEdit =
      conversation !== undefined && executionModeForConversation(conversation) === 'cloud';
    const accountEpoch = isCloudEdit ? captureCloudAccountEpoch() : null;
    const isEditCurrent = () => !isCloudEdit || isCloudAccountEpochCurrent(accountEpoch);

    if (!isEditCurrent()) return false;

    set({ isEditing: true });

    const trimmedMsgs = msgs.slice(0, msgIndex);
    void (async () => {
      if (branches) {
        // Stamped before the edited row's own parent is read: on a conversation
        // that has never branched there is no parent yet, and null there would
        // silently mean "root sibling" instead of "beside this question".
        const leafBefore = activeLeafOf(conversationId);
        const stampedRows = ensureLocalThreadParents(conversationId);
        const editedParentId = stampedRows.find((row) => row.id === messageId)?.parentId ?? null;
        try {
          await get().sendMessage(conversationId, newContent, userModel, editedAttachments, {
            branchParentId: editedParentId,
          });
        } finally {
          forgetUnusedThreadParents(conversationId, msgs, stampedRows, leafBefore);
        }
        return;
      }

      const removedTail = msgs.slice(msgIndex);
      msgStore.setState((s) => ({
        messages: { ...s.messages, [conversationId]: trimmedMsgs },
      }));
      let accepted = false;
      try {
        await get().sendMessage(conversationId, newContent, userModel, editedAttachments, {
          onAccepted: () => {
            accepted = true;
            removeArtifactsOfMessages(removedTail);
            if (!isCloudEdit) return;
            void deleteCloudMessagesRemote(
              conversationId,
              removedTail.map((message) => message.id),
              accountEpoch,
            ).catch(() => {
              if (isEditCurrent()) {
                set({
                  error:
                    'The earlier Cloud messages could not be removed. They may reappear after the next sync.',
                });
              }
            });
          },
        });
      } finally {
        if (!accepted && isEditCurrent()) {
          msgStore.setState((s) => ({
            messages: {
              ...s.messages,
              [conversationId]: reinsertRemovedTail(
                s.messages[conversationId] ?? [],
                trimmedMsgs,
                removedTail,
              ),
            },
          }));
        }
      }
    })()
      .catch((err) => {
        if (!isEditCurrent()) return;
        set({
          error: isCloudEdit
            ? 'Could not replace the Cloud message. Check your connection and retry.'
            : 'Could not replace the Local message. Please try again.',
        });
      })
      .finally(() => {
        if (isEditCurrent()) set({ isEditing: false });
      });
    return true;
  },
}));
