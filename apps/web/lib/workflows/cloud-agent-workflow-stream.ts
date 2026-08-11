import 'server-only';

import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';

import { extractManagedAgentEventEnvelopes } from '@/app/api/llm/v1/chat/completions/lib/managed-agent-stream';
import { extractAssistantInteractiveCardDeltas } from '@/app/api/llm/v1/chat/completions/lib/interactive-card-stream';

export interface ProjectedCloudAgentWorkflowEvent {
  /** Only canonical activity is journalled; cards persist via tool receipts. */
  envelope?: AgentEventEnvelope;
  sse: string;
}

/**
 * Reduce a mixed legacy/canonical tool-loop chunk to replayable deltas consumed
 * by every Cloud client. Public text is projected beside its canonical envelope;
 * validated cards are forwarded while their durable tool receipt remains the
 * settlement-time persistence source.
 */
export function projectCloudAgentWorkflowChunk(
  chunk: Uint8Array,
): ProjectedCloudAgentWorkflowEvent[] {
  const activity = extractManagedAgentEventEnvelopes(chunk).map((envelope) => ({
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
  const cards = extractAssistantInteractiveCardDeltas(chunk).map((card) => ({
    sse: `data: ${JSON.stringify({
      choices: [{ delta: { x_interactive_card: { card } }, index: 0 }],
    })}\n\n`,
  }));
  return [...activity, ...cards];
}
