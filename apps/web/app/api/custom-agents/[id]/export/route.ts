import { NextRequest, NextResponse } from 'next/server';

import { AgentConfigSchema } from '@agiworkforce/cloud-contracts';

import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { agentSlug, agentToSubagentMarkdown } from '@/lib/agents/agent-markdown';
import { openAgentRead, readAgentId, type AgentRouteContext } from '@/lib/agents/agent-route';
import { effectiveAgentConfig, requireReadableAgent } from '@/lib/services/custom-agent-service';

export const runtime = 'nodejs';

async function handleGet(request: NextRequest, context: AgentRouteContext) {
  const agentId = await readAgentId(context);
  const opened = await openAgentRead(request);
  if ('limited' in opened) return opened.limited;
  const { db, userId } = opened.scope;
  const row = await requireReadableAgent(db, agentId);
  const config = effectiveAgentConfig(row, userId);
  if (!config) throw createError.notFound('Agent not found');
  return new NextResponse(agentToSubagentMarkdown(AgentConfigSchema.parse(config)), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${agentSlug(config.name)}.md"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export const GET = withErrorHandler(handleGet);
