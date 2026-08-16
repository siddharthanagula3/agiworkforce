import { classifyTaskLocally } from '@agiworkforce/routing';
import type { RoutingAttachment, RoutingTaskType } from '@agiworkforce/routing';
import type { UserInput } from '@agiworkforce/types';

export function isAutoRoutingModel(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized === 'auto' || normalized.startsWith('auto-');
}

function attachmentFromInput(input: UserInput): RoutingAttachment | undefined {
  if (input.type === 'image') {
    const mime = /^data:([^;,]+)/i.exec(input.image_url)?.[1] ?? 'image/unknown';
    return { mime, type: 'image' };
  }
  if (input.type === 'local_image') return { mime: 'image/unknown', type: 'image' };
  return undefined;
}

export function classifyDeveloperTurn(
  text: string,
  inputs: readonly UserInput[] = [],
): RoutingTaskType {
  const attachments = inputs
    .map(attachmentFromInput)
    .filter((attachment): attachment is RoutingAttachment => attachment !== undefined);
  return classifyTaskLocally(text, [], attachments).type;
}
