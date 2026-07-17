import { ApiPaywallError } from '@/services/api';
import {
  generateImage,
  getGeneratedImageUri,
  type GeneratedImage,
  type ImageGenRequest,
  type ImageGenResponse,
} from '@/src/features/image/services/imagegen';

interface ImageTurnCompletion {
  imageUrl: string;
  revisedPrompt?: string;
  model?: string;
}

export interface RunImageGenerationTurnInput {
  conversationId: string;
  displayText: string;
  prompt: string;
  model: string;
  begin: (
    conversationId: string,
    displayText: string,
    prompt: string,
    model: string,
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
}

export type ImageGenerationTurnOutcome = {
  status: 'completed' | 'failed' | 'paywall';
  assistantMessageId: string;
};

const defaultDependencies: ImageGenerationTurnDependencies = {
  generate: generateImage,
  getUri: getGeneratedImageUri,
};

/** Shared state-transition action for image turns used by both chat screens. */
export async function runImageGenerationTurn(
  input: RunImageGenerationTurnInput,
  dependencies: ImageGenerationTurnDependencies = defaultDependencies,
): Promise<ImageGenerationTurnOutcome> {
  const assistantMessageId = input.begin(
    input.conversationId,
    input.displayText,
    input.prompt,
    input.model,
  );

  try {
    const result = await dependencies.generate({ prompt: input.prompt, model: input.model });
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

    input.complete(input.conversationId, assistantMessageId, {
      imageUrl,
      revisedPrompt: image?.revisedPrompt,
      model: result.model,
    });
    return { status: 'completed', assistantMessageId };
  } catch (error) {
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
