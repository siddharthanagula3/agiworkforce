import 'server-only';

import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

import { extractManagedAgentEventEnvelopes } from '@/app/api/llm/v1/chat/completions/lib/managed-agent-stream';

export interface ProjectedCloudAgentWorkflowEvent {
  envelope: AgentEventEnvelope;
  sse: string;
}

/**
 * Reduce a mixed legacy/canonical tool-loop chunk to the single replayable
 * contract consumed by every Cloud client. Public text is projected beside
 * its canonical envelope so rendering and journal replay share one sequence.
 */
export function projectCloudAgentWorkflowChunk(
  chunk: Uint8Array,
): ProjectedCloudAgentWorkflowEvent[] {
  return extractManagedAgentEventEnvelopes(chunk).map((envelope) => ({
    envelope,
    sse: `data: ${JSON.stringify({
      choices: [
        {
          delta: {
            ...(envelope.event.type === 'text-delta' ? { content: envelope.event.delta } : {}),
            x_agent_event: envelope,
          },
          index: 0,
        },
      ],
    })}\n\n`,
  }));
}
