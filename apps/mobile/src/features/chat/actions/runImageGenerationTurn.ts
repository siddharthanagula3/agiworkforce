import type { ManagedMediaImageOperation } from '@agiworkforce/cloud-contracts';
import type { MessageAttachment } from '@/types/chat';
import { ApiPaywallError } from '@/services/api';
import { readReferenceImageBase64 } from '@/src/features/image/services/imageReference';
import type { MobileImageReferenceAttachment } from './resolveMobileImageGenerationRequest';
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

interface ImageTurnCompletion {
  imageUrl: string;
  persisted: boolean;
  persistenceWarning?: string;
  revisedPrompt?: string;
  model?: string;
}

export interface RunImageGenerationTurnInput {
  conversationId: string;
  displayText: string;
  prompt: string;
  model: string;
  aspectRatio?: ImageGenRequest['aspect_ratio'];
  operation?: ManagedMediaImageOperation;
  sourceImage?: MobileImageReferenceAttachment;
  ownerId: string;
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
  generate: (request: ImageGenRequest) => Promise<ImageGenResponse>;
  getUri: (image: GeneratedImage | undefined) => string | null;
  getDurablePath?: (image: GeneratedImage | undefined) => string | null;
  readReferenceImage?: (uri: string) => Promise<string>;
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
    input.onUnexpectedError?.(
      new Error('Sign in to an active AGI Cloud account before generating an image.'),
    );
    return { status: 'failed', assistantMessageId: null };
  }
  if (accountEpoch.ownerId !== input.ownerId) {
    input.onUnexpectedError?.(
      new Error('The active AGI Cloud account changed before image generation started.'),
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

  try {
    const referenceOperation =
      input.sourceImage && input.operation && input.operation !== 'generate'
        ? input.operation
        : null;
    const referenceBase64 =
      referenceOperation && input.sourceImage
        ? await (dependencies.readReferenceImage ?? readReferenceImageBase64)(input.sourceImage.uri)
        : null;
    if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };
    const result = await dependencies.generate({
      prompt: input.prompt,
      model: input.model,
      ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
      ...(referenceOperation && referenceBase64
        ? { operation: referenceOperation, source_image: { b64_json: referenceBase64 } }
        : {}),
    });
    if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };
    const image = result.images?.[0];
    const imageUrl = dependencies.getUri(image);
    if (result.success === false || !imageUrl) {
      input.fail(
        input.conversationId,
        assistantMessageId,
        result.error ?? 'AGI Cloud did not return an image.',
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
    });
    return { status: 'completed', assistantMessageId };
  } catch (error) {
    if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };
    if (error instanceof ApiPaywallError) {
      input.remove(input.conversationId, assistantMessageId);
      input.onPaywall(error);
      return { status: 'paywall', assistantMessageId };
    }

    input.onUnexpectedError?.(error);
    input.fail(
      input.conversationId,
      assistantMessageId,
      error instanceof Error ? error.message : String(error),
    );
    return { status: 'failed', assistantMessageId };
  }
}
