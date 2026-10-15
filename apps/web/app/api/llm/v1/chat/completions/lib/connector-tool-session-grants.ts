import 'server-only';

import {
  TOOL_APPROVAL_RISK_TIERS,
  type ToolApprovalDecisionWire,
  type ToolApprovalRiskTier,
  isConnectorCategoryToolName,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { TRUST_MODE_CONTRACTS, type PrivacyMode } from '@agiworkforce/types';
import { logger } from '@/lib/logger';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import {
  connectorToolRiskTier,
  isDestructiveConnectorTool,
  type ToolAnnotations,
} from './tool-metadata';

/** Every chat-completions turn runs under Managed Cloud; Local and BYOK never reach it. */
export const CHAT_COMPLETIONS_TRUST_BOUNDARY: PrivacyMode = TRUST_MODE_CONTRACTS.managed.mode;

export function managedConversationGrantScope(
  conversationId: string | null | undefined,
  temporary: boolean,
): Pick<ConnectorToolSessionScope, 'conversationId' | 'trustBoundary'> | undefined {
  return conversationId && !temporary
    ? { conversationId, trustBoundary: CHAT_COMPLETIONS_TRUST_BOUNDARY }
    : undefined;
}

export interface ConnectorToolSessionScope {
  userId: string;
  conversationId: string;
  organizationId: string | null;
  trustBoundary: PrivacyMode;
}

export interface ConnectorToolSessionGrant {
  connectorId: string;
  toolName: string;
  destructive: boolean;
  riskTier: ToolApprovalRiskTier;
}

export type ConnectorToolSessionGrants = ReadonlyMap<string, ToolApprovalRiskTier>;

export const NO_SESSION_GRANTS: ConnectorToolSessionGrants = new Map();

function grantKey(connectorId: string, toolName: string): string {
  return connectorId + ' ' + toolName;
}

const PG_UNDEFINED_TABLE = '42P01';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE
  );
}

/**
 * A grant that cannot be read is not an allowance, so a failed read yields no
 * grants and every connector tool asks as it did before the grant was made.
 */
export async function loadConnectorToolSessionGrants(
  db: DatabaseAdapter,
  scope: ConnectorToolSessionScope,
): Promise<ConnectorToolSessionGrants> {
  try {
    const rows = await db.query<{
      connector_id: string;
      tool_name: string;
      risk_tier: string;
    }>(
      `select grant_row.connector_id, grant_row.tool_name, grant_row.risk_tier
         from public.connector_tool_session_grants grant_row
         join public.web_conversations conversation
           on conversation.id = grant_row.conversation_id
          and conversation.user_id = grant_row.user_id
        where grant_row.user_id = $1 and grant_row.conversation_id = $2
          and grant_row.trust_boundary = $3
          and conversation.organization_id is not distinct from $4::uuid
          and conversation.deleted_at is null
          and conversation.is_temporary = false`,
      [scope.userId, scope.conversationId, scope.trustBoundary, scope.organizationId],
    );
    const grants = new Map<string, ToolApprovalRiskTier>();
    for (const row of rows) {
      const risk = TOOL_APPROVAL_RISK_TIERS.find((tier) => tier === row.risk_tier);
      if (risk) grants.set(grantKey(row.connector_id, row.tool_name), risk);
    }
    return grants;
  } catch (error) {
    if (!isUndefinedTable(error)) {
      logger.warn(
        { error: error instanceof Error ? error.message : error, userId: scope.userId },
        '[connector-session-grants] grants unavailable; every connector tool asks',
      );
    }
    return NO_SESSION_GRANTS;
  }
}

export async function insertConnectorToolSessionGrants(
  db: Pick<DatabaseAdapter, 'query'>,
  scope: ConnectorToolSessionScope,
  grants: readonly ConnectorToolSessionGrant[],
): Promise<void> {
  for (const grant of grants) {
    await db.query(
      `delete from public.connector_tool_session_grants grant_row
        using public.web_conversations conversation
        where grant_row.user_id = $1 and grant_row.conversation_id = $2
          and grant_row.connector_id = $3 and grant_row.tool_name = $4
          and grant_row.trust_boundary = $5
          and conversation.id = grant_row.conversation_id
          and conversation.user_id = grant_row.user_id
          and conversation.organization_id is not distinct from $6::uuid
          and conversation.deleted_at is null
          and conversation.is_temporary = false`,
      [
        scope.userId,
        scope.conversationId,
        grant.connectorId,
        grant.toolName,
        scope.trustBoundary,
        scope.organizationId,
      ],
    );
    const inserted = await db.query<{ id: string }>(
      `insert into public.connector_tool_session_grants
         (user_id, conversation_id, connector_id, tool_name, trust_boundary, destructive, risk_tier)
       select $1, conversation.id, $3, $4, $5, $6, $7
         from public.web_conversations conversation
        where conversation.id = $2 and conversation.user_id = $1
          and conversation.organization_id is not distinct from $8::uuid
          and conversation.deleted_at is null
          and conversation.is_temporary = false
       on conflict (user_id, conversation_id, connector_id, tool_name, trust_boundary)
         do nothing
       returning id`,
      [
        scope.userId,
        scope.conversationId,
        grant.connectorId,
        grant.toolName,
        scope.trustBoundary,
        grant.destructive,
        grant.riskTier,
        scope.organizationId,
      ],
    );
    if (inserted.length !== 1)
      throw new Error('The conversation is unavailable for a saved tool permission.');
  }
}

export async function revokeConnectorSessionGrants(
  db: DatabaseAdapter,
  scope: Pick<ConnectorToolSessionScope, 'userId' | 'organizationId'>,
  connectorId: string,
  toolName: string | null,
): Promise<number> {
  try {
    const removed = await db.query<{ id: string }>(
      `delete from public.connector_tool_session_grants grant_row
        using public.web_conversations conversation
        where grant_row.user_id = $1 and grant_row.connector_id = $2
          and ($4::text is null or grant_row.tool_name = $4)
          and conversation.id = grant_row.conversation_id
          and conversation.user_id = grant_row.user_id
          and conversation.organization_id is not distinct from $3::uuid
       returning grant_row.id`,
      [
        scope.userId,
        connectorId,
        scope.organizationId,
        toolName && !isConnectorCategoryToolName(toolName) ? toolName : null,
      ],
    );
    return removed.length;
  } catch (error) {
    if (isUndefinedTable(error)) return 0;
    throw error;
  }
}

export interface ScopedToolApproval extends ConnectorToolSessionGrant {
  toolCallId: string;
  scope: 'session' | 'always';
  critical: boolean;
}

export type ScopedToolApprovalPlan =
  { ok: true; scoped: ScopedToolApproval[] } | { ok: false; message: string };

/**
 * Which decisions outlive their call, checked before anything is written. Only
 * a connector tool has a verdict to remember, a conversation grant needs the
 * conversation it is scoped to, and a critical tool is never allowed always.
 * Annotations are the server's own hints and only ever raise the tier.
 */
export function planScopedToolApprovals(
  decisions: readonly ToolApprovalDecisionWire[],
  pendingCalls: readonly { id: string; qualifiedName: string }[],
  conversationId: string | null,
  annotationsFor: (qualifiedName: string) => ToolAnnotations | undefined = () => undefined,
): ScopedToolApprovalPlan {
  const scoped: ScopedToolApproval[] = [];
  for (const { tool_call_id: toolCallId, decision } of decisions) {
    if (decision !== 'approved-for-session' && decision !== 'approved-always') continue;
    const call = pendingCalls.find((candidate) => candidate.id === toolCallId);
    const parsed = call ? parseQualifiedToolName(call.qualifiedName) : null;
    if (!call || !parsed) {
      return { ok: false, message: 'Only a connector tool can be allowed beyond this call.' };
    }
    const annotations = annotationsFor(call.qualifiedName);
    const riskTier = connectorToolRiskTier(parsed.serverId, parsed.toolName, annotations);
    const critical = riskTier === 'critical';
    if (decision === 'approved-always' && critical) {
      return {
        ok: false,
        message:
          'This tool can delete or send data that cannot be recovered, so it asks every time and cannot be allowed always.',
      };
    }
    if (decision === 'approved-for-session' && !conversationId) {
      return {
        ok: false,
        message: 'Allowing a tool for a conversation needs a saved conversation.',
      };
    }
    scoped.push({
      toolCallId,
      scope: decision === 'approved-always' ? 'always' : 'session',
      connectorId: parsed.serverId,
      toolName: parsed.toolName,
      destructive: isDestructiveConnectorTool(parsed.serverId, parsed.toolName, annotations),
      riskTier,
      critical,
    });
  }
  return { ok: true, scoped };
}
