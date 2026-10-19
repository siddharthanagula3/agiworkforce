import { NextRequest, NextResponse } from 'next/server';

import { AgentActivityResponseSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { openAgentRead, readAgentId, type AgentRouteContext } from '@/lib/agents/agent-route';
import { readAgentActivity } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId, organizationId } = opened.scope;
  return NextResponse.json(
    AgentActivityResponseSchema.parse(await readAgentActivity(db, userId, organizationId, agentId)),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);
