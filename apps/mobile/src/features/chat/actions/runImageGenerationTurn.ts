import type { ManagedMediaImageOperation } from '@agiworkforce/cloud-contracts';
import type { MessageAttachment } from '@/types/chat';
import { ApiPaywallError } from '@/services/api';
import { CLOUD_SIGN_IN_MESSAGE } from '@/services/apiErrors';
import { readReferenceImageBase64 } from '@/src/features/image/services/imageReference';
import type { MobileImageReferenceAttachment } from './resolveMobileImageGenerationRequest';
import {
  MediaGenerationAdmissionError,
  MEDIA_USAGE_LIMIT_MESSAGE,
  isUsageLimitRefusal,
  mediaGenerationFailureMessage,
} from './mediaGenerationError';
import {
  generateImage,
  getDurableGeneratedImagePath,
  getGeneratedImageUri,
  type GeneratedImage,
  type ImageGenRequest,
  type ImageGenResponse,
} from '@/src/features/image/services/imagegen';

import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

const CLOUD_CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ImageTurnCompletion {
  imageUrl: string;
  persisted: boolean;
  persistenceWarning?: string;
  revisedPrompt?: string;
  model?: string;
  aspectRatio?: string;
}

export interface RunImageGenerationTurnInput {
  conversationId: string;
  displayText: string;
  prompt: string;
  model: string;
  aspectRatio?: ImageGenRequest['aspect_ratio'];
  transparentBackground?: boolean;
  operation?: ManagedMediaImageOperation;
  sourceImage?: MobileImageReferenceAttachment;
  sourceImageBase64?: string;
  maskImageBase64?: string;
  referenceImages?: MobileImageReferenceAttachment[];
  ownerId: string;
  onStarted?: () => void;
  begin: (
    conversationId: string,
    displayText: string,
    prompt: string,
    model: string,
    attachments?: MessageAttachment[],
  ) => string;
  complete: (
    conversationId: string,
    assistantMessageId: string,
    result: ImageTurnCompletion,
  ) => void;
  fail: (conversationId: string, assistantMessageId: string, message: string) => void;
  remove: (conversationId: string, assistantMessageId: string) => void;
  onPaywall: (error: ApiPaywallError) => void;
  onUnexpectedError?: (error: unknown) => void;
}

export interface ImageGenerationTurnDependencies {
  generate: (
    request: ImageGenRequest,
    options?: { operationId?: string },
  ) => Promise<ImageGenResponse>;
  getUri: (image: GeneratedImage | undefined) => string | null;
  getDurablePath?: (image: GeneratedImage | undefined) => string | null;
  readReferenceImage?: (uri: string) => Promise<string>;
  timeoutMs?: number;
}

export const IMAGE_GENERATION_TIMEOUT_MS = 180_000;

const IMAGE_GENERATION_TIMEOUT_MESSAGE =
  'Image generation timed out. Retry to run it again, or try a shorter prompt.';

class ImageGenerationTimeout extends Error {}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ImageGenerationTimeout(IMAGE_GENERATION_TIMEOUT_MESSAGE)),
      timeoutMs,
    );
  });
  return Promise.race([work, expiry]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export type ImageGenerationTurnOutcome = {
  status: 'completed' | 'failed' | 'paywall' | 'cancelled';
  assistantMessageId: string | null;
};

let cloudImageGeneration = 0;

export function clearCloudImageGenerationState(): void {
  cloudImageGeneration += 1;
}

const defaultDependencies: ImageGenerationTurnDependencies = {
  generate: generateImage,
  getUri: getGeneratedImageUri,
  getDurablePath: getDurableGeneratedImagePath,
  readReferenceImage: readReferenceImageBase64,
};

export async function runImageGenerationTurn(
  input: RunImageGenerationTurnInput,
  dependencies: ImageGenerationTurnDependencies = defaultDependencies,
): Promise<ImageGenerationTurnOutcome> {
  const accountEpoch = captureCloudAccountEpoch();
  if (!accountEpoch) {
    input.onUnexpectedError?.(new MediaGenerationAdmissionError(CLOUD_SIGN_IN_MESSAGE));
    return { status: 'failed', assistantMessageId: null };
  }
  if (accountEpoch.ownerId !== input.ownerId) {
    input.onUnexpectedError?.(
      new MediaGenerationAdmissionError(
        'The active AGI Cloud account changed before image generation started.',
      ),
    );
    return { status: 'failed', assistantMessageId: null };
  }
  const generation = cloudImageGeneration;
  const isAccountCurrent = () =>
    generation === cloudImageGeneration && isCloudAccountEpochCurrent(accountEpoch);
  const referenceAttachment: MessageAttachment | null = input.sourceImage
    ? {
        url: input.sourceImage.uri,
        mimeType: input.sourceImage.mimeType,
        fileName: input.sourceImage.fileName,
        ...(input.sourceImage.fileSize !== undefined
          ? { fileSize: input.sourceImage.fileSize }
          : {}),
      }
    : null;
  const assistantMessageId = referenceAttachment
    ? input.begin(input.conversationId, input.displayText, input.prompt, input.model, [
        referenceAttachment,
      ])
    : input.begin(input.conversationId, input.displayText, input.prompt, input.model);
  input.onStarted?.();

  try {
    const referenceOperation =
      (input.sourceImage || input.sourceImageBase64) &&
      input.operation &&
      input.operation !== 'generate'
        ? input.operation
        : null;
    let referenceBase64: string | null = input.sourceImageBase64 ?? null;
    let guideImagesBase64: string[] = [];
    if (referenceOperation && input.sourceImage) {
      try {
        const readImage = dependencies.readReferenceImage ?? readReferenceImageBase64;
        referenceBase64 = await readImage(input.sourceImage.uri);
        guideImagesBase64 = await Promise.all(
          (input.referenceImages ?? []).map((image) => readImage(image.uri)),
        );
      } catch (error) {
        if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };
        input.onUnexpectedError?.(error);
        input.fail(
          input.conversationId,
          assistantMessageId,
          'The reference image could not be read from this device.',
        );
        return { status: 'failed', assistantMessageId };
      }
    }
    if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };
    const result = await withTimeout(
      dependencies.generate(
        {
          prompt: input.prompt,
          model: input.model,
          ...(CLOUD_CONVERSATION_ID.test(input.conversationId)
            ? { conversation_id: input.conversationId }
            : {}),
          ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
          ...(input.transparentBackground ? { transparent_background: true } : {}),
          ...(referenceOperation && referenceBase64
            ? { operation: referenceOperation, source_image: { b64_json: referenceBase64 } }
            : {}),
          ...(referenceOperation && referenceBase64 && input.maskImageBase64
            ? { mask_image: { b64_json: input.maskImageBase64 } }
            : {}),
          ...(referenceOperation && referenceBase64 && guideImagesBase64.length > 0
            ? { reference_images: guideImagesBase64.map((b64_json) => ({ b64_json })) }
            : {}),
        },
        { operationId: assistantMessageId },
      ),
      dependencies.timeoutMs ?? IMAGE_GENERATION_TIMEOUT_MS,
    );
    if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };
    const image = result.images?.[0];
    const imageUrl = dependencies.getUri(image);
    if (result.success === false || !imageUrl) {
      input.fail(
        input.conversationId,
        assistantMessageId,
        'AGI Cloud did not return an image. Try again.',
      );
      return { status: 'failed', assistantMessageId };
    }

    const durablePath = (dependencies.getDurablePath ?? getDurableGeneratedImagePath)(image);
    const persisted = result.persisted !== false && durablePath !== null;
    input.complete(input.conversationId, assistantMessageId, {
      imageUrl: durablePath ?? imageUrl,
      persisted,
      ...(!persisted
        ? {
            persistenceWarning:
              'This image is available for this session only because AGI Cloud media storage is not configured. Try again after storage is available to save it.',
          }
        : {}),
      revisedPrompt: image?.revisedPrompt,
      model: result.model,
      aspectRatio: input.aspectRatio,
    });
    return { status: 'completed', assistantMessageId };
  } catch (error) {
    if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };
    if (error instanceof ApiPaywallError) {
      input.remove(input.conversationId, assistantMessageId);
      input.onPaywall(error);
      return { status: 'paywall', assistantMessageId };
    }

    if (isUsageLimitRefusal(error)) {
      input.fail(input.conversationId, assistantMessageId, MEDIA_USAGE_LIMIT_MESSAGE);
      return { status: 'failed', assistantMessageId };
    }

    if (error instanceof ImageGenerationTimeout) {
      input.fail(input.conversationId, assistantMessageId, IMAGE_GENERATION_TIMEOUT_MESSAGE);
      return { status: 'failed', assistantMessageId };
    }

    input.onUnexpectedError?.(error);
    input.fail(input.conversationId, assistantMessageId, mediaGenerationFailureMessage('image'));
    return { status: 'failed', assistantMessageId };
  }
}
