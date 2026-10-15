import {
  chatAttachmentAcceptAttribute,
  isSupportedChatAttachment,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
} from '@agiworkforce/cloud-contracts';
import { getModelMetadataById } from '@agiworkforce/types';
import {
  collectTurnCitations,
  type Attachment,
  type ChatAttachmentPolicy,
  type ChatMessage,
  type TauriAttachmentPayload,
  type ToolCall,
} from '@agiworkforce/unified-chat';

type WebSearch = NonNullable<ChatMessage['webSearchResults']>[number];

/** Searches kept per turn, and results kept per search, in saved history. */
export const MAX_STORED_SEARCHES = 20;
export const MAX_STORED_SEARCH_RESULTS = 20;

export const LOCAL_CHAT_ATTACHMENT_POLICY: ChatAttachmentPolicy = {
  accept: chatAttachmentAcceptAttribute(),
  maxFiles: MAX_CHAT_ATTACHMENT_COUNT,
  maxTotalBytes: MAX_CHAT_ATTACHMENT_BYTES,
  validate: (file: File) =>
    isSupportedChatAttachment(file.name, file.type)
      ? null
      : `${file.name} is not supported. Attach an image, PDF, or text/code file instead.`,
};

/**
 * The native runtime passes images only to a model the generated catalog marks
 * as vision-capable and drops them otherwise (`model_likely_supports_vision`).
 * Asking before the send turns that silent drop into a choice the user makes.
 * With no model chosen the route decides, so nothing is claimed here.
 */
export function unreadableImageNotice(
  model: string | undefined,
  attachments: readonly TauriAttachmentPayload[] | undefined,
): string | null {
  const images = attachments?.filter((attachment) => attachment.type === 'image').length ?? 0;
  if (images === 0 || !model) return null;
  const metadata = getModelMetadataById(model);
  if (metadata?.capabilities.vision === true) return null;
  const subject = images === 1 ? 'the attached image' : `the ${images} attached images`;
  return `${metadata?.name ?? model} cannot read images, so ${subject} would be ignored. Choose a model that supports images, or remove ${images === 1 ? 'it' : 'them'} and send again.`;
}

/** Tool output kept in history per call; the full result stays in what the tool produced. */
export const MAX_STORED_TOOL_RESULT_CHARS = 20_000;

function clip(text: string | undefined): string | undefined {
  if (text === undefined || text.length <= MAX_STORED_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_STORED_TOOL_RESULT_CHARS)}\n… [output shortened in saved history]`;
}

/** Collects what a Local turn rendered beyond its text so it can be stored with the reply. */
export class TurnDetailRecorder {
  private readonly calls = new Map<string, ToolCall>();
  private readonly searches = new Map<string, WebSearch>();
  private thinkingText = '';

  recordCall(id: string, name: string, args: Record<string, unknown>): void {
    this.calls.set(id, { id, name, args, status: 'running' });
  }

  recordResult(id: string, name: string, output?: string, error?: string): void {
    const call = this.calls.get(id) ?? { id, name, args: {} };
    this.calls.set(id, {
      ...call,
      status: error ? 'failed' : 'completed',
      ...(output !== undefined ? { result: clip(output) } : {}),
      ...(error ? { error: clip(error) } : {}),
    });
  }

  appendThinking(delta: string): void {
    this.thinkingText += delta;
  }

  recordSearch(search: WebSearch): void {
    if (!this.searches.has(search.id) && this.searches.size >= MAX_STORED_SEARCHES) return;
    this.searches.set(search.id, {
      ...search,
      results: search.results.slice(0, MAX_STORED_SEARCH_RESULTS),
    });
  }

  sources(): WebSearch[] | null {
    return this.searches.size > 0 ? [...this.searches.values()] : null;
  }

  toolCalls(): ToolCall[] | null {
    return this.calls.size > 0 ? [...this.calls.values()] : null;
  }

  thinking(): string | null {
    return this.thinkingText.trim() ? this.thinkingText : null;
  }
}

export function storedAttachmentList(files: readonly File[] | undefined): Attachment[] | null {
  if (!files || files.length === 0) return null;
  return files.map((file, index) => ({
    id: `${index}:${file.name}`,
    name: file.name,
    type: file.type.startsWith('image/') ? 'image' : 'file',
    size: file.size,
  }));
}

export interface RawMessageDetail {
  tool_calls?: unknown;
  thinking?: string | null;
  attachments?: unknown;
  sources?: unknown;
  feedback?: string | null;
  compaction?: string | null;
}

function storedSearches(value: unknown): WebSearch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): WebSearch[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const search = candidate as Record<string, unknown>;
    if (typeof search['id'] !== 'string' || !Array.isArray(search['results'])) return [];
    const results = search['results'].flatMap((entry): WebSearch['results'] => {
      if (!entry || typeof entry !== 'object') return [];
      const result = entry as Record<string, unknown>;
      if (typeof result['url'] !== 'string' || typeof result['title'] !== 'string') return [];
      return [
        {
          url: result['url'],
          title: result['title'],
          ...(typeof result['snippet'] === 'string' ? { snippet: result['snippet'] } : {}),
        },
      ];
    });
    return [
      {
        id: search['id'],
        query: typeof search['query'] === 'string' ? search['query'] : '',
        results,
        resultCount: results.length,
      },
    ];
  });
}

function isToolCall(value: unknown): value is ToolCall {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate['id'] === 'string' && typeof candidate['name'] === 'string';
}

function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['name'] === 'string' &&
    typeof candidate['type'] === 'string'
  );
}

/** Restores the stored turn detail onto a reloaded message, dropping rows that no longer parse. */
export function messageDetailFromRow(
  raw: RawMessageDetail,
): Pick<ChatMessage, 'toolCalls' | 'thinking' | 'attachments' | 'citations' | 'metadata'> {
  const toolCalls = Array.isArray(raw.tool_calls)
    ? raw.tool_calls.filter(isToolCall).map((call) => ({
        ...call,
        args: call.args && typeof call.args === 'object' ? call.args : {},
        // A reloaded turn is finished; a call stored mid-run never completed.
        status: call.status === 'running' || call.status === 'pending' ? 'failed' : call.status,
      }))
    : [];
  const attachments = Array.isArray(raw.attachments) ? raw.attachments.filter(isAttachment) : [];
  const citations = collectTurnCitations(undefined, storedSearches(raw.sources));
  const metadata = {
    ...(raw.feedback === 'up' || raw.feedback === 'down' ? { feedback: raw.feedback } : {}),
    ...(raw.compaction === 'summarized' || raw.compaction === 'summary'
      ? { compaction: raw.compaction }
      : {}),
  };
  return {
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(raw.thinking ? { thinking: raw.thinking } : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
    ...(citations.length > 0 ? { citations } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

type HistoryTurn = { role: 'user' | 'assistant'; content: string };

/**
 * The earlier turns of a temporary chat for the native request. The native
 * runtime adds the current turn itself, so a trailing copy of it is dropped.
 */
export function temporaryHistoryTurns(
  history: ReadonlyArray<{ role: string; content: string }> | undefined,
  currentContent: string,
): HistoryTurn[] {
  const turns = (history ?? []).flatMap<HistoryTurn>((turn) =>
    (turn.role === 'user' || turn.role === 'assistant') && turn.content.trim()
      ? [{ role: turn.role, content: turn.content }]
      : [],
  );
  const last = turns.at(-1);
  if (last?.role === 'user' && last.content === currentContent) turns.pop();
  return turns;
}
