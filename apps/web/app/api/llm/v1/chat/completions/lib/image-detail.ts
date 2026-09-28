import 'server-only';

import { getModelMetadataById } from '@agiworkforce/types';

export const IMAGE_DETAIL_VALUES = ['auto', 'low', 'high', 'original'] as const;

export type ImageDetailValue = (typeof IMAGE_DETAIL_VALUES)[number];

const AUTO_DETAIL: ImageDetailValue = 'auto';
const DEFAULT_DETAIL_VALUES: readonly string[] = ['auto', 'low', 'high'];

interface ImageDetailMessage {
  content: string | ReadonlyArray<{ image_url?: { detail?: ImageDetailValue } | undefined }>;
}

export interface ImageDetailRefusal {
  detail: ImageDetailValue;
  accepted: readonly string[];
}

export function unsupportedImageDetail(
  messages: readonly ImageDetailMessage[],
  modelId: string,
): ImageDetailRefusal | null {
  const accepted = getModelMetadataById(modelId)?.imageInput?.detailValues ?? DEFAULT_DETAIL_VALUES;
  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      const detail = part.image_url?.detail;
      if (!detail || detail === AUTO_DETAIL || accepted.includes(detail)) continue;
      return { detail, accepted };
    }
  }
  return null;
}

export function imageDetailRefusalMessage(refusal: ImageDetailRefusal): string {
  const values = refusal.accepted.map((value) => `"${value}"`);
  const list =
    values.length > 1 ? `${values.slice(0, -1).join(', ')} or ${values.at(-1)}` : (values[0] ?? '');
  return `The selected model does not accept image detail "${refusal.detail}". Use ${list}.`;
}
