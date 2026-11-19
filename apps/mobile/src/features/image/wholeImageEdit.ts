import {
  MANAGED_MEDIA_IMAGE_ASPECT_RATIOS,
  type ManagedMediaImageAspectRatio,
} from '@agiworkforce/cloud-contracts';
import { getImageAspectOptionsForModel } from '@agiworkforce/types';
import type { ImageEditTurnRequest } from '@/src/features/chat/actions/runImageGenerationTurn';

export type ImageWholeEdit =
  | { operation: 'edit'; prompt: string; sourceBase64: string; aspectRatio?: string }
  | { operation: 'variation'; prompt: string; sourceBase64: string; aspectRatio?: string }
  | { operation: 'reshape'; prompt: string; aspectRatio: string };

export interface ImageShapeOption {
  id: ManagedMediaImageAspectRatio;
  label: string;
}

export const VARIATION_DISPLAY_TEXT = 'Make a variation';
export const VARIATION_FALLBACK_PROMPT = 'Make a variation of this image.';

function managedAspectRatio(value: string | undefined): ManagedMediaImageAspectRatio | undefined {
  return MANAGED_MEDIA_IMAGE_ASPECT_RATIOS.find((ratio) => ratio === value);
}

export function wholeImageChangePrompt(imagePrompt: string | undefined, change: string): string {
  const base = imagePrompt?.trim().replace(/[.\s]+$/, '');
  return base ? `${base}. Edit: ${change.trim()}` : change.trim();
}

export function variationPrompt(imagePrompt: string | undefined): string {
  return imagePrompt?.trim() || VARIATION_FALLBACK_PROMPT;
}

export function imageShapeOptions(
  modelId: string | undefined,
  currentAspectRatio: string | undefined,
): ImageShapeOption[] {
  return getImageAspectOptionsForModel(modelId).flatMap((option) => {
    const id = managedAspectRatio(option.id);
    return id && id !== currentAspectRatio ? [{ id, label: option.label }] : [];
  });
}

export function wholeImageEditRequest(input: {
  edit: ImageWholeEdit;
  conversationId: string;
  ownerId: string;
  model: string;
}): ImageEditTurnRequest {
  const { edit, conversationId, ownerId, model } = input;
  const base = { conversationId, ownerId, model, prompt: edit.prompt };
  if (edit.operation === 'reshape') {
    const reshaped = managedAspectRatio(edit.aspectRatio);
    return {
      ...base,
      displayText: `Make it ${edit.aspectRatio}`,
      replayOnRetry: true,
      ...(reshaped ? { aspectRatio: reshaped } : {}),
    };
  }
  const aspectRatio = managedAspectRatio(edit.aspectRatio);
  return {
    ...base,
    displayText: edit.operation === 'variation' ? VARIATION_DISPLAY_TEXT : edit.prompt,
    operation: edit.operation,
    sourceImageBase64: edit.sourceBase64,
    ...(aspectRatio ? { aspectRatio } : {}),
  };
}
