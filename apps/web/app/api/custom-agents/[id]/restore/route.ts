import { NextRequest, NextResponse } from 'next/server';

import {
  AgentRestoreRequestSchema,
  ManagedCloudAgentResponseSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openAgentWrite,
  presentAgent,
  readAgentBody,
  readAgentId,
  type AgentRouteContext,
} from '@/lib/agents/agent-route';
import { restoreAgentVersion } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handlePost(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const { version } = await readAgentBody(request, AgentRestoreRequestSchema);
  const row = await restoreAgentVersion(db, userId, agentId, version);
  return NextResponse.json(
    ManagedCloudAgentResponseSchema.parse({ agent: await presentAgent(userId, row) }),
  );
}

export const POST = withErrorHandler(handlePost);
