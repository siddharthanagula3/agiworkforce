import { NextRequest, NextResponse } from 'next/server';

import { AgentVersionListResponseSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openAgentRead,
  readAgentId,
  serviceDb,
  type AgentRouteContext,
} from '@/lib/agents/agent-route';
import { listAgentVersions, requireOwnedAgent } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  await requireOwnedAgent(db, userId, agentId);
  return NextResponse.json(
    AgentVersionListResponseSchema.parse({
      versions: await listAgentVersions(db, serviceDb(), userId, agentId),
    }),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export const GET = withErrorHandler(handleGet);
