import {
  ListConversationToolGrantsResponseSchema,
  RevokeConversationToolGrantResponseSchema,
  conversationToolGrantPath,
  conversationToolGrantsPath,
  type ConversationToolGrant,
} from '@agiworkforce/cloud-contracts';
import { parseQualifiedConnectorTool } from '@agiworkforce/unified-chat/connector-step-sentence';
import { api } from '@/services/api';
import { ApiHttpError } from '@/services/apiErrors';

export const CHAT_TOOL_GRANT_GONE = 'This tool is no longer allowed in this chat.';
export const CHAT_TOOL_GRANT_REVOKE_FAILED = 'Could not stop allowing this tool. Try again.';

const inFlight = new Map<string, Promise<ConversationToolGrant[]>>();

function listChatToolGrants(conversationId: string): Promise<ConversationToolGrant[]> {
  const pending = inFlight.get(conversationId);
  if (pending) return pending;
  const request = api
    .get<unknown>(conversationToolGrantsPath(conversationId))
    .then((body) => ListConversationToolGrantsResponseSchema.parse(body).grants)
    .finally(() => inFlight.delete(conversationId));
  inFlight.set(conversationId, request);
  return request;
}

export function isChatGrantableTool(toolName: string): boolean {
  return parseQualifiedConnectorTool(toolName) !== null;
}

export async function findChatToolGrant(
  conversationId: string,
  toolName: string,
): Promise<ConversationToolGrant | null> {
  const tool = parseQualifiedConnectorTool(toolName);
  if (!tool) return null;
  const grants = await listChatToolGrants(conversationId);
  return (
    grants.find(
      (grant) => grant.connectorId === tool.serverId && grant.toolName === tool.toolName,
    ) ?? null
  );
}

export type StopAllowingOutcome = 'stopped' | 'gone';

export async function stopAllowingChatTool(
  conversationId: string,
  toolName: string,
): Promise<StopAllowingOutcome> {
  const grant = await findChatToolGrant(conversationId, toolName);
  if (!grant) return 'gone';
  try {
    RevokeConversationToolGrantResponseSchema.parse(
      await api.delete<unknown>(conversationToolGrantPath(conversationId, grant.id)),
    );
    return 'stopped';
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 404) return 'gone';
    throw error;
  }
}
