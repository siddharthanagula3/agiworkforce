import type { McpAppCardBody } from '@agiworkforce/types';
import { mcpAppPlainResultText, type McpAppToolResult } from '@agiworkforce/unified-chat/mcp-app';
import { api } from '@/services/api';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

export const MCP_APP_PAYLOAD_PATH = '/api/mcp-apps/payload';

interface McpAppPayload {
  connectorId: string;
  resourceUri: string;
  toolName: string;
  toolResult: McpAppToolResult;
}

function readPayload(value: unknown): McpAppPayload | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const result = record['toolResult'];
  if (
    typeof record['connectorId'] !== 'string' ||
    typeof record['resourceUri'] !== 'string' ||
    typeof record['toolName'] !== 'string' ||
    !result ||
    typeof result !== 'object' ||
    !Array.isArray((result as Record<string, unknown>)['content'])
  ) {
    return null;
  }
  return value as McpAppPayload;
}

export async function fetchMcpAppResultText(
  body: Pick<McpAppCardBody, 'payloadId' | 'connectorId' | 'resourceUri' | 'toolName'>,
): Promise<string | null> {
  const accountEpoch = captureCloudAccountEpoch();
  const value = await api.get<unknown>(
    `${MCP_APP_PAYLOAD_PATH}/${encodeURIComponent(body.payloadId)}`,
    { accountEpoch },
  );
  const payload = readPayload(value);
  if (
    !payload ||
    !isCloudAccountEpochCurrent(accountEpoch) ||
    payload.connectorId !== body.connectorId ||
    payload.resourceUri !== body.resourceUri ||
    payload.toolName !== body.toolName
  ) {
    return null;
  }
  return mcpAppPlainResultText(payload.toolResult);
}
