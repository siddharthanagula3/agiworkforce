import { NextRequest, NextResponse } from 'next/server';

import {
  AgentCreateRequestSchema,
  AgentImportRequestSchema,
  ManagedCloudAgentResponseSchema,
} from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { AgentMarkdownError, agentFromSubagentMarkdown } from '@/lib/agents/agent-markdown';
import { openAgentWrite, presentAgent, readAgentBody } from '@/lib/agents/agent-route';
import { createAgent } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handlePost(request: NextRequest) {
  const opened = await openAgentWrite(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId, organizationId } = opened.scope;
  const { markdown } = await readAgentBody(request, AgentImportRequestSchema);
  let imported;
  try {
    imported = AgentCreateRequestSchema.parse(agentFromSubagentMarkdown(markdown));
  } catch (error) {
    if (error instanceof AgentMarkdownError) throw createError.validation(error.message);
    throw createError.validation('The file is not an agent definition this product can read.');
  }
  const row = await createAgent(db, userId, organizationId, imported);
  return NextResponse.json(
    ManagedCloudAgentResponseSchema.parse({ agent: await presentAgent(userId, row) }),
    { status: 201 },
  );
}

export const POST = withErrorHandler(handlePost);
