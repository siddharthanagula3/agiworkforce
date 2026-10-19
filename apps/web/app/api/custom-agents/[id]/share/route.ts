import { NextRequest, NextResponse } from 'next/server';

import {
  AGENT_SHARE_PEOPLE_MAX,
  AgentShareRequestSchema,
  AgentShareResponseSchema,
  type AgentShareResponse,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openAgentRead,
  openAgentWrite,
  readAgentBody,
  readAgentId,
  serviceDb,
  type AgentRouteContext,
} from '@/lib/agents/agent-route';
import {
  readAgentAccess,
  requireOwnedAgent,
  shareAgent,
  type AgentRow,
} from '@/lib/services/custom-agent-service';
import { listWorkspaceMembers } from '@/lib/services/organization-member-admin-service';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';

export const runtime = 'nodejs';

async function shareState(
  db: Parameters<typeof readAgentAccess>[0],
  userId: string,
  row: AgentRow,
): Promise<AgentShareResponse> {
  if (!row.organization_id) {
    return { visibility: row.visibility, workspaceName: null, members: [] };
  }
  const [access, page, organizations] = await Promise.all([
    readAgentAccess(db, row.id),
    listWorkspaceMembers(serviceDb(), row.organization_id, {
      limit: AGENT_SHARE_PEOPLE_MAX,
      afterId: null,
      email: null,
    }),
    serviceDb().query<{ name: string | null }>(
      `select name from public.organizations where id = $1 limit 1`,
      [row.organization_id],
    ),
  ]);
  return {
    visibility: row.visibility,
    workspaceName: organizations[0]?.name ?? null,
    members: page.data
      .filter((member) => member.userId !== userId)
      .map((member) => ({
        userId: member.userId,
        name: member.name ?? member.email ?? member.userId,
        email: member.email,
        hasAccess: access.has(member.userId),
      })),
  };
}

async function handleGet(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const row = await requireOwnedAgent(db, userId, agentId);
  return NextResponse.json(AgentShareResponseSchema.parse(await shareState(db, userId, row)), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

async function handlePut(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const input = await readAgentBody(request, AgentShareRequestSchema);
  const row = await shareAgent(db, userId, agentId, input);
  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'agent_shared',
    detail: {
      resourceType: 'agent',
      resourceId: agentId,
      status: input.visibility,
      count: input.visibility === 'people' ? input.userIds.length : 0,
    },
  });
  return NextResponse.json(AgentShareResponseSchema.parse(await shareState(db, userId, row)));
}

export const GET = withErrorHandler(handleGet);
export const PUT = withErrorHandler(handlePut);
