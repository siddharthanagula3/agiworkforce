import { NextRequest, NextResponse } from 'next/server';

import {
  AgentUpdateRequestSchema,
  ManagedCloudAgentResponseSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openAgentRead,
  openAgentWrite,
  presentAgent,
  readAgentBody,
  readAgentId,
  type AgentRouteContext,
} from '@/lib/agents/agent-route';
import {
  deleteAgent,
  requireReadableAgent,
  updateAgentDraft,
} from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const row = await requireReadableAgent(db, agentId);
  return NextResponse.json(
    ManagedCloudAgentResponseSchema.parse({ agent: await presentAgent(userId, row) }),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handlePatch(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const patch = await readAgentBody(request, AgentUpdateRequestSchema);
  const row = await updateAgentDraft(db, userId, agentId, patch);
  return NextResponse.json(
    ManagedCloudAgentResponseSchema.parse({ agent: await presentAgent(userId, row) }),
  );
}

async function handleDelete(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  await deleteAgent(db, userId, agentId);
  return new NextResponse(null, { status: 204 });
}

export const GET = withErrorHandler(handleGet);
export const PATCH = withErrorHandler(handlePatch);
export const DELETE = withErrorHandler(handleDelete);
