import { NextRequest, NextResponse } from 'next/server';

import {
  AgentCreateRequestSchema,
  ManagedCloudAgentListResponseSchema,
  ManagedCloudAgentResponseSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import {
  openAgentRead,
  openAgentWrite,
  presentAgent,
  presentAgents,
  readAgentBody,
} from '@/lib/agents/agent-route';
import { createAgent, listAgentRows } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handleList(request: NextRequest) {
  const opened = await openAgentRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId, organizationId } = opened.scope;
  const rows = await listAgentRows(db, userId, organizationId);
  return NextResponse.json(
    ManagedCloudAgentListResponseSchema.parse({ agents: await presentAgents(userId, rows) }),
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function handleCreate(request: NextRequest) {
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId, organizationId } = opened.scope;
  const input = await readAgentBody(request, AgentCreateRequestSchema);
  const row = await createAgent(db, userId, organizationId, input);
  return NextResponse.json(
    ManagedCloudAgentResponseSchema.parse({ agent: await presentAgent(userId, row) }),
    { status: 201 },
  );
}

export const GET = withErrorHandler(handleList);
export const POST = withErrorHandler(handleCreate);
