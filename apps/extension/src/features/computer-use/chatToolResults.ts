import {
  parseFormObservationReference,
  type FormObservationReference,
} from '../browser-tools/documentBridge';
import {
  CallerToolResumeRequestSchema,
  type CallerToolResumeRequest,
} from '@agiworkforce/cloud-contracts';
import { MAX_CHAT_TOOL_RESULT_CHARS } from './chatBrowserTools';

export type ChatToolCursor = Omit<CallerToolResumeRequest, 'tool_results' | 'observations'>;
export interface ChatToolResult {
  toolCallId: string;
  content: string;
  observation?: FormObservationReference | null;
}

export function validChatToolResults(
  results: readonly ChatToolResult[],
  cursor?: ChatToolCursor,
): boolean {
  if (
    results.some(
      (result) =>
        result.observation !== undefined &&
        (!cursor ||
          (result.observation !== null && !parseFormObservationReference(result.observation))),
    )
  )
    return false;
  if (!cursor)
    return results.every((result) => result.content.length <= MAX_CHAT_TOOL_RESULT_CHARS);
  return CallerToolResumeRequestSchema.safeParse({
    ...cursor,
    tool_results: results.map((result) => ({
      tool_call_id: result.toolCallId,
      content: result.content,
    })),
  }).success;
}

export function prepareChatToolResults(
  results: readonly ChatToolResult[],
  cursor?: ChatToolCursor,
): ChatToolResult[] {
  if (!cursor && results.some((result) => result.observation !== undefined))
    throw new Error('Form observations require an owned caller checkpoint.');
  const prepared = results.map((result) => ({
    toolCallId: result.toolCallId,
    content: cursor ? result.content : result.content.slice(0, MAX_CHAT_TOOL_RESULT_CHARS),
    ...(cursor && result.observation !== undefined
      ? {
          observation:
            result.observation === null
              ? null
              : (parseFormObservationReference(result.observation) ?? result.observation),
        }
      : {}),
  }));
  if (!validChatToolResults(prepared, cursor))
    throw new Error(
      'The complete browser results could not fit the continuation contract. Check the page before retrying.',
    );
  return prepared;
}
