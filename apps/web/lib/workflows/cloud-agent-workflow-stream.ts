import 'server-only';

import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import type { InteractiveCard } from '@agiworkforce/types';
import {
  parseAgentEventDelta,
  parseGeneratedFilesDelta,
  parseInteractiveCardDelta,
  type GeneratedFileWire,
} from '@agiworkforce/cloud-contracts';

export interface ProjectedCloudAgentWorkflowEvent {
  envelope?: AgentEventEnvelope;
  sse: string;
}

interface WorkflowStreamChoiceDelta {
  x_agent_event?: unknown;
  x_interactive_card?: unknown;
  x_generated_files?: unknown;
  content?: unknown;
  tool_calls?: unknown;
  [key: string]: unknown;
}

interface WorkflowStreamPayload {
  choices?: Array<{ delta?: WorkflowStreamChoiceDelta }>;
}

const RECONSTRUCTED_DELTA_KEYS = new Set([
  'x_agent_event',
  'x_interactive_card',
  'x_generated_files',
]);
const DUPLICATED_ANSWER_DELTA_KEYS = new Set(['content', 'tool_calls']);

function agentEventLine(envelope: AgentEventEnvelope): string {
  return `data: ${JSON.stringify({
    choices: [
      {
        delta: {
          ...(envelope.event.type === 'text-delta' ? { content: envelope.event.delta } : {}),
          x_agent_event: envelope,
        },
        index: 0,
      },
    ],
  })}\n\n`;
}

function interactiveCardLine(card: InteractiveCard): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { x_interactive_card: { card } }, index: 0 }],
  })}\n\n`;
}

function generatedFilesLine(files: GeneratedFileWire[]): string {
  return `data: ${JSON.stringify({
    choices: [{ delta: { x_generated_files: { files } }, index: 0 }],
  })}\n\n`;
}

// A canonical `x_agent_event`/`x_interactive_card`/`x_generated_files` delta
// is rebuilt from its parsed, validated shape; every other delta key is
// forwarded byte-for-byte in the order it arrived rather than enumerated, so
// an activity delta type added later is never silently dropped here again.
// `content`/`tool_calls` are the one exception: those duplicate the text a
// canonical `x_agent_event` already carries for the same token.
export function projectCloudAgentWorkflowChunk(
  chunk: Uint8Array,
): ProjectedCloudAgentWorkflowEvent[] {
  const text = new TextDecoder().decode(chunk);
  const projected: ProjectedCloudAgentWorkflowEvent[] = [];
  const generatedFiles: GeneratedFileWire[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

    let payload: WorkflowStreamPayload;
    try {
      payload = JSON.parse(line.slice(6)) as WorkflowStreamPayload;
    } catch {
      continue;
    }

    for (const choice of payload.choices ?? []) {
      const delta = choice.delta;
      if (!delta) continue;

      const envelope = parseAgentEventDelta(delta.x_agent_event);
      if (envelope) {
        projected.push({ envelope, sse: agentEventLine(envelope) });
        continue;
      }

      const card = parseInteractiveCardDelta(delta.x_interactive_card);
      if (card) {
        projected.push({ sse: interactiveCardLine(card) });
        continue;
      }

      if (delta.x_generated_files !== undefined) {
        generatedFiles.push(...parseGeneratedFilesDelta(delta.x_generated_files));
        continue;
      }

      const isForwardable = Object.keys(delta).some(
        (key) => !RECONSTRUCTED_DELTA_KEYS.has(key) && !DUPLICATED_ANSWER_DELTA_KEYS.has(key),
      );
      if (isForwardable) projected.push({ sse: `${line}\n\n` });
    }
  }

  if (generatedFiles.length > 0) {
    projected.push({ sse: generatedFilesLine(generatedFiles) });
  }

  return projected;
}
