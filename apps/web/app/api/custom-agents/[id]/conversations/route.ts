import { NextRequest, NextResponse } from 'next/server';

import { AgentConversationResponseSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { openAgentWrite, readAgentId, type AgentRouteContext } from '@/lib/agents/agent-route';
import { agentUnavailableReason } from '@/lib/agents/agent-turn-config';
import { createAgentConversation, requireReadableAgent } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handlePost(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId, organizationId } = opened.scope;
  const row = await requireReadableAgent(db, agentId);
  const unavailable = agentUnavailableReason(row);
  if (unavailable) throw createError.conflict(unavailable);
  const conversationId = await createAgentConversation(db, userId, organizationId, row);
  return NextResponse.json(AgentConversationResponseSchema.parse({ conversationId }), {
    status: 201,
  });
}

export const POST = withErrorHandler(handlePost);
