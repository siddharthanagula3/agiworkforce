import { classifyTaskLocally } from '@agiworkforce/routing';
import type { RoutingAttachment, RoutingTaskType } from '@agiworkforce/routing';
import type { UserInput } from '@agiworkforce/types';

function attachmentFromInput(input: UserInput): RoutingAttachment | undefined {
  if (input.type === 'image') {
    const mime = /^data:([^;,]+)/i.exec(input.image_url)?.[1] ?? 'image/unknown';
    return { mime, type: 'image' };
  }
  if (input.type === 'local_image') return { mime: 'image/unknown', type: 'image' };
  return undefined;
}

/**
 * Classify only the current presentation input. Conversation continuity and
 * route selection stay in the Rust app-server, which owns the persisted
 * developer session shared by CLI and VS Code.
 */
export function classifyDeveloperTurn(
  text: string,
  inputs: readonly UserInput[] = [],
): RoutingTaskType {
  const attachments = inputs
    .map(attachmentFromInput)
    .filter((attachment): attachment is RoutingAttachment => attachment !== undefined);
  return classifyTaskLocally(text, [], attachments).type;
}
