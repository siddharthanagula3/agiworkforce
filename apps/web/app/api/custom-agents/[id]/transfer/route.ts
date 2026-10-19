import { NextRequest, NextResponse } from 'next/server';

import { AgentTransferRequestSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openAgentWrite,
  readAgentBody,
  readAgentId,
  type AgentRouteContext,
} from '@/lib/agents/agent-route';
import { transferAgent } from '@/lib/services/custom-agent-service';
import { recordWorkspaceAuditEvent } from '@/lib/workspace-audit';

export const runtime = 'nodejs';

async function handlePost(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const { newOwnerId } = await readAgentBody(request, AgentTransferRequestSchema);
  await transferAgent(db, userId, agentId, newOwnerId);
  await recordWorkspaceAuditEvent(db, request, {
    userId,
    eventType: 'agent_ownership_transferred',
    detail: { resourceType: 'agent', resourceId: agentId, targetUserId: newOwnerId },
  });
  return new NextResponse(null, { status: 204 });
}

export const POST = withErrorHandler(handlePost);
