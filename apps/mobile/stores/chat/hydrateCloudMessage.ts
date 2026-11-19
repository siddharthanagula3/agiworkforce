import {
  ManagedCloudAgentRunReferenceSchema,
  readPersistedCloudToolApproval,
  TOOL_APPROVAL_SCOPE_DECISIONS,
} from '@agiworkforce/cloud-contracts';
import type { LifecycleStatus, LifecycleStatusAlias, ToolStatus } from '@agiworkforce/types';
import { getDurableGeneratedImagePath } from '@/src/features/image/services/imagegen';
import { attachmentsFromPersistedMetadata } from '@/stores/chat/messageAttachments';
import { sourcesFromPersistedMetadata } from '@/src/features/chat/utils/messageSources';
import { statusStepsFromMetadata, toolCallsFromStoredTimeline } from './toolTimelineMetadata';
import type { ChatMessage, PendingToolInput, PendingToolInputCall } from '@/types/chat';

const PROMPT_LIMIT = 4_000;
const MEDIA_URL_LIMIT = 2_048;
const AWAITING_INPUT = 'awaiting_input' satisfies LifecycleStatus;
const REJECTED_CALL_STATUS = 'failed' satisfies ToolStatus;
const APPROVED_CALL_STATUS = 'succeeded' satisfies ToolStatus;
const PENDING_APPROVAL_STATUS = 'awaiting-approval' satisfies ToolStatus;

type Metadata = Record<string, unknown> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, limit: number): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : undefined;
}

export function pendingToolInputFromMetadata(metadata: Metadata): PendingToolInput | undefined {
  const run = ManagedCloudAgentRunReferenceSchema.safeParse(metadata?.['cloudAgentRun']);
  const tools = metadata?.['tools'];
  if (!run.success || !Array.isArray(tools)) return undefined;
  const toolCalls: PendingToolInputCall[] = tools.flatMap((entry) =>
    isRecord(entry) &&
    entry['status'] === AWAITING_INPUT &&
    typeof entry['toolCallId'] === 'string' &&
    entry['toolCallId'].length > 0 &&
    typeof entry['name'] === 'string' &&
    isRecord(entry['inputRequests'])
      ? [
          {
            toolCallId: entry['toolCallId'],
            name: entry['name'],
            connectorId: typeof entry['connectorId'] === 'string' ? entry['connectorId'] : '',
            round: 0,
            inputRequests: entry['inputRequests'],
          },
        ]
      : [],
  );
  return toolCalls.length > 0
    ? { runId: run.data.runId, requestedAt: new Date(0).toISOString(), toolCalls }
    : undefined;
}

type GeneratedImageFields = Pick<
  ChatMessage,
  | 'type'
  | 'imageUrl'
  | 'imageGenPersisted'
  | 'imageGenPrompt'
  | 'revisedPrompt'
  | 'imageAspectRatio'
  | 'isGeneratingImage'
  | 'imageGenStatus'
  | 'imageGenProgress'
  | 'imageGenError'
>;

export function hydrateGeneratedImageFields(metadata: Metadata): GeneratedImageFields {
  const rawImageUrl = metadata?.['imageUrl'];
  const imageUrl =
    metadata?.['toolType'] === 'image-generation' && typeof rawImageUrl === 'string'
      ? getDurableGeneratedImagePath({ url: rawImageUrl })
      : null;
  if (!imageUrl) {
    return {
      type: undefined,
      imageUrl: undefined,
      imageGenPersisted: undefined,
      imageGenPrompt: undefined,
      revisedPrompt: undefined,
      imageAspectRatio: undefined,
      isGeneratingImage: undefined,
      imageGenStatus: undefined,
      imageGenProgress: undefined,
      imageGenError: undefined,
    };
  }

  return {
    type: 'image',
    imageUrl,
    imageGenPersisted: true,
    imageGenPrompt: boundedText(metadata?.['imageGenPrompt'], PROMPT_LIMIT),
    revisedPrompt: boundedText(metadata?.['revisedPrompt'], PROMPT_LIMIT),
    imageAspectRatio: boundedText(metadata?.['imageGenAspect'], 16),
    isGeneratingImage: false,
    imageGenStatus: 'completed',
    imageGenProgress: 100,
    imageGenError: undefined,
  };
}

function imageFieldsShownOnThisPhone(
  existing: ChatMessage | undefined,
): GeneratedImageFields | null {
  if (
    !existing ||
    (existing.isGeneratingImage !== true &&
      existing.imageGenStatus === undefined &&
      existing.imageUrl === undefined)
  ) {
    return null;
  }
  return {
    type: existing.type,
    imageUrl: existing.imageUrl,
    imageGenPersisted: existing.imageGenPersisted,
    imageGenPrompt: existing.imageGenPrompt,
    revisedPrompt: existing.revisedPrompt,
    imageAspectRatio: existing.imageAspectRatio,
    isGeneratingImage: existing.isGeneratingImage,
    imageGenStatus: existing.imageGenStatus,
    imageGenProgress: existing.imageGenProgress,
    imageGenError: existing.imageGenError,
  };
}

function hydratedImageFields(
  metadata: Metadata,
  existing: ChatMessage | undefined,
): GeneratedImageFields {
  const stored = hydrateGeneratedImageFields(metadata);
  if (stored.imageUrl) return stored;
  return imageFieldsShownOnThisPhone(existing) ?? stored;
}

const STORED_VIDEO_STATUSES: ReadonlySet<NonNullable<ChatMessage['videoGenStatus']>> = new Set([
  'queued',
  'processing',
  'completed',
  'failed',
] as const satisfies readonly (LifecycleStatus | LifecycleStatusAlias)[]);

type GeneratedVideoFields = Partial<
  Pick<
    ChatMessage,
    | 'type'
    | 'videoUrl'
    | 'videoThumbnailUrl'
    | 'videoGenStatus'
    | 'videoGenProgress'
    | 'videoGenError'
    | 'videoGenPrompt'
    | 'videoTaskId'
    | 'isGeneratingVideo'
  >
>;

/** The video fields web stores on a video-generation turn, read back for the phone. */
export function hydrateGeneratedVideoFields(metadata: Metadata): GeneratedVideoFields {
  if (metadata?.['toolType'] !== 'video-generation') return {};
  const rawStatus = metadata['videoStatus'];
  const status =
    typeof rawStatus === 'string' &&
    STORED_VIDEO_STATUSES.has(rawStatus as NonNullable<ChatMessage['videoGenStatus']>)
      ? (rawStatus as NonNullable<ChatMessage['videoGenStatus']>)
      : undefined;
  const videoUrl = boundedText(metadata['videoUrl'], MEDIA_URL_LIMIT);
  const progress = metadata['videoProgress'];
  return {
    type: 'video',
    ...(videoUrl ? { videoUrl } : {}),
    ...(boundedText(metadata['thumbnailUrl'], MEDIA_URL_LIMIT)
      ? { videoThumbnailUrl: boundedText(metadata['thumbnailUrl'], MEDIA_URL_LIMIT) }
      : {}),
    ...(status ? { videoGenStatus: status } : videoUrl ? { videoGenStatus: 'completed' } : {}),
    ...(typeof progress === 'number' && Number.isFinite(progress)
      ? { videoGenProgress: Math.min(100, Math.max(0, progress)) }
      : {}),
    ...(boundedText(metadata['videoError'], PROMPT_LIMIT)
      ? { videoGenError: boundedText(metadata['videoError'], PROMPT_LIMIT) }
      : {}),
    ...(boundedText(metadata['videoPrompt'], PROMPT_LIMIT)
      ? { videoGenPrompt: boundedText(metadata['videoPrompt'], PROMPT_LIMIT) }
      : {}),
    ...(boundedText(metadata['videoTaskId'], 200)
      ? { videoTaskId: boundedText(metadata['videoTaskId'], 200) }
      : {}),
    isGeneratingVideo: status === 'queued' || status === 'processing',
  };
}

export function hydrateApprovalToolCalls(
  existing: ChatMessage | undefined,
  metadata: Metadata,
): ChatMessage['toolCalls'] {
  const rawProjection = metadata?.['cloudApproval'];
  if (rawProjection === null) {
    return existing?.toolCalls?.map((call) =>
      call.requiresApproval
        ? {
            ...call,
            requiresApproval: false,
            status:
              call.approvalDecision === 'rejected' ? REJECTED_CALL_STATUS : APPROVED_CALL_STATUS,
          }
        : call,
    );
  }

  const persisted = readPersistedCloudToolApproval(metadata);
  if (!persisted) {
    return existing?.toolCalls;
  }

  const existingById = new Map(
    (existing?.toolCalls ?? []).map((call) => [call.toolCallId ?? call.id, call]),
  );
  return persisted.projection.calls.map((call) => ({
    ...(existingById.get(call.toolCallId) ?? {}),
    id: call.toolCallId,
    toolCallId: call.toolCallId,
    name: call.name,
    ...(call.input !== undefined ? { input: call.input } : {}),
    status: PENDING_APPROVAL_STATUS,
    requiresApproval: true,
    ...(call.approvalDecision ? { approvalDecision: call.approvalDecision } : {}),
    ...(call.approvalDecision === 'approved' && call.approvalScope
      ? { approvalScope: TOOL_APPROVAL_SCOPE_DECISIONS[call.approvalScope] }
      : {}),
  }));
}

function withStoredTimeline(
  toolCalls: ChatMessage['toolCalls'],
  metadata: Metadata,
): ChatMessage['toolCalls'] {
  const stored = toolCallsFromStoredTimeline(metadata);
  if (!stored) return toolCalls;
  const shown = new Set((toolCalls ?? []).flatMap((call) => [call.id, call.toolCallId ?? call.id]));
  const missing = stored.filter(
    (call) => !shown.has(call.id) && !(call.toolCallId && shown.has(call.toolCallId)),
  );
  return missing.length > 0 ? [...(toolCalls ?? []), ...missing] : toolCalls;
}

function storedReasoning(message: ChatMessage, metadata: Metadata): Partial<ChatMessage> {
  if (message.role !== 'assistant' || message.reasoning) return {};
  const reasoning = metadata?.['thinkingContent'];
  return typeof reasoning === 'string' && reasoning.trim().length > 0 ? { reasoning } : {};
}

function storedThinkingTimes(metadata: Metadata): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const patch: Record<string, unknown> = {};
  const seconds = metadata['thinkingDurationSeconds'];
  if (typeof metadata['thinkingDuration'] !== 'number' && typeof seconds === 'number') {
    if (Number.isFinite(seconds) && seconds >= 0) patch['thinkingDuration'] = seconds;
  }
  const startedAt = metadata['thinkingStartedAt'];
  if (typeof startedAt === 'string') {
    const ms = Date.parse(startedAt);
    if (Number.isFinite(ms)) patch['thinkingStartedAt'] = ms;
  }
  return Object.keys(patch).length > 0 ? { ...metadata, ...patch } : undefined;
}

function withoutFinishReason(metadata: Metadata): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata ?? {}).filter(([key]) => key !== 'finishReason'),
  );
}

/**
 * One reading of a stored Cloud row for every path that loads one (opening a
 * chat and the sync pull), so a reopened chat, or the same chat on another
 * phone, shows what the live turn showed.
 */
export function hydrateStoredCloudMessage(
  message: ChatMessage,
  existing?: ChatMessage,
): ChatMessage {
  const metadata = isRecord(message.metadata) ? message.metadata : undefined;
  const approvalCalls = hydrateApprovalToolCalls(existing ?? message, metadata);
  const toolCalls =
    message.role === 'assistant' ? withStoredTimeline(approvalCalls, metadata) : approvalCalls;
  const steps =
    message.role === 'assistant' && message.steps === undefined
      ? statusStepsFromMetadata(metadata)
      : undefined;
  const attachments =
    message.role === 'user' ? attachmentsFromPersistedMetadata(metadata) : undefined;
  const sources = message.role === 'assistant' ? sourcesFromPersistedMetadata(metadata) : [];
  const thinkingMetadata = storedThinkingTimes(metadata);
  // A cancelled turn is stored truncated with no finishReason key; a failure stores null.
  const serverRecordedCancel =
    metadata !== undefined && !('finishReason' in metadata) && metadata['truncated'] === true;
  const localFinishReason =
    message.role === 'assistant' &&
    metadata?.['finishReason'] == null &&
    (existing?.content === message.content ||
      (serverRecordedCancel && existing?.metadata?.finishReason === 'stopped'))
      ? existing?.metadata?.finishReason
      : undefined;
  const hydratedMetadata =
    typeof localFinishReason === 'string'
      ? { ...(thinkingMetadata ?? metadata), finishReason: localFinishReason }
      : metadata?.['finishReason'] === null
        ? withoutFinishReason(thinkingMetadata ?? metadata)
        : thinkingMetadata;
  return {
    ...message,
    ...(attachments ? { attachments } : {}),
    ...(sources.length > 0 ? { citations: sources } : {}),
    ...(toolCalls ? { toolCalls } : {}),
    ...(steps ? { steps } : {}),
    ...hydratedImageFields(metadata, existing),
    ...hydrateGeneratedVideoFields(metadata),
    ...storedReasoning(message, metadata),
    ...(hydratedMetadata ? { metadata: hydratedMetadata } : {}),
    pendingToolInput: pendingToolInputFromMetadata(metadata),
  };
}
