import 'server-only';

import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { parseGeneratedFilesDelta } from '@agiworkforce/cloud-contracts';

import { extractManagedAgentEventEnvelopes } from '@/app/api/llm/v1/chat/completions/lib/managed-agent-stream';
import { extractAssistantInteractiveCardDeltas } from '@/app/api/llm/v1/chat/completions/lib/interactive-card-stream';

export interface ProjectedCloudAgentWorkflowEvent {
  envelope?: AgentEventEnvelope;
  sse: string;
}

function extractGeneratedFilesDeltas(
  chunk: Uint8Array,
): ReturnType<typeof parseGeneratedFilesDelta> {
  const text = new TextDecoder().decode(chunk);
  const files: ReturnType<typeof parseGeneratedFilesDelta> = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const payload = JSON.parse(line.slice(6)) as {
        choices?: Array<{ delta?: { x_generated_files?: unknown } }>;
      };
      for (const choice of payload.choices ?? []) {
        files.push(...parseGeneratedFilesDelta(choice.delta?.x_generated_files));
      }
    } catch {
      continue;
    }
  }
  return files;
}

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
  const generatedFiles = extractGeneratedFilesDeltas(chunk);
  const files =
    generatedFiles.length > 0
      ? [
          {
            sse: `data: ${JSON.stringify({
              choices: [{ delta: { x_generated_files: { files: generatedFiles } }, index: 0 }],
            })}\n\n`,
          },
        ]
      : [];
  return [...activity, ...cards, ...files];
}
