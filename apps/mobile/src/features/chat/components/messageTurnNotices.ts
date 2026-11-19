import { hasUnavailableWebSearch, type AgentActivityState } from '@agiworkforce/client-runtime';
import {
  describeSecretRedactionNotice,
  isFreeRouteLane,
  readPersistedRouteLane,
} from '@agiworkforce/cloud-contracts';
import { resolveModelEscalation } from '@agiworkforce/unified-chat/model-escalation';
import {
  turnAttemptedSearch,
  turnRanAnyTool,
  webSearchNoticeFor,
  type WebSearchNotice,
} from '@agiworkforce/unified-chat/web-search-notice';
import type { ChatMessage } from '@/types/chat';

export const WEB_SEARCH_NOTICE_TEXT: Record<WebSearchNotice, string> = {
  'no-results':
    "Web search didn't return results for this turn, so the answer relies on the model's own knowledge.",
  'memory-grounded':
    'This answer came from your saved memories, not the web. Ask to search the web for current sources.',
  'not-invoked':
    "The answer used the model's own knowledge. Ask to search the web for current sources.",
};

export const WEB_SEARCH_NOTICE_ACTION: Record<
  WebSearchNotice,
  { label: string; accessibilityLabel: string }
> = {
  'no-results': { label: 'Retry', accessibilityLabel: 'Retry this response with web search' },
  'memory-grounded': {
    label: 'Search the web',
    accessibilityLabel: 'Send this turn again with a web search required',
  },
  'not-invoked': {
    label: 'Search the web',
    accessibilityLabel: 'Send this turn again with a web search required',
  },
};

function stringField(metadata: ChatMessage['metadata'], key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : null;
}

export function modelEscalationLine(message: ChatMessage): string | null {
  return (
    resolveModelEscalation({
      movedFromModelId: stringField(message.metadata, 'movedFromModel'),
      movedReason: stringField(message.metadata, 'movedReason'),
      servedModelId: message.model ?? stringField(message.metadata, 'model'),
    })?.line ?? null
  );
}

export function secretRedactionNotice(metadata: ChatMessage['metadata']): string | null {
  const count = metadata?.['secretRedactionCount'];
  return describeSecretRedactionNotice(
    typeof count === 'number' || typeof count === 'string' ? count : null,
  );
}

export function answeredOnFreePool(metadata: ChatMessage['metadata']): boolean {
  return isFreeRouteLane(readPersistedRouteLane(metadata));
}

export interface WebSearchNoticeInput {
  message: ChatMessage;
  activity: AgentActivityState | undefined;
  awaitingApproval: boolean;
  producedNoVisibleOutput: boolean;
  rendersResearchPlan: boolean;
  hasStreamError: boolean;
  declinedSearch: boolean;
  memoryCitationCount: number;
  sourceCount: number;
}

export function webSearchNoticeForMessage(input: WebSearchNoticeInput): WebSearchNotice | null {
  const { message, activity } = input;
  const toolCalls = message.toolCalls ?? [];
  const toolNames = toolCalls.map((tool) => tool.name);
  return webSearchNoticeFor({
    isUser: message.role === 'user',
    streaming: message.isStreaming === true,
    awaitingApproval: input.awaitingApproval,
    webSearchRequested: message.metadata?.['webSearchRequested'] === true,
    webSearchAskedInText: message.metadata?.['webSearchAskedInText'] === true,
    producedNoVisibleOutput: input.producedNoVisibleOutput,
    rendersResearchPlan: input.rendersResearchPlan,
    hasStreamError: input.hasStreamError,
    declinedSearch: input.declinedSearch,
    webSearchUnavailable: hasUnavailableWebSearch(activity),
    toolAwaitingApproval: toolCalls.some((tool) => tool.status === 'awaiting-approval'),
    attemptedSearch: turnAttemptedSearch(activity, toolNames),
    ranAnyTool: turnRanAnyTool(activity, toolNames),
    memoryCitationCount: input.memoryCitationCount,
    sourceCount: input.sourceCount,
  });
}
