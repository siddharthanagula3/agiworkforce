import { ApiPaywallError } from '@/services/api';
import {
  generateVideo,
  type GeneratedVideo,
  type VideoGenRequest,
  type VideoGenStatusResponse,
} from '@/src/features/video';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';

interface VideoTurnCompletion {
  videoUrl: string;
  thumbnailUrl?: string;
  model?: string;
}

export interface RunVideoGenerationTurnInput {
  conversationId: string;
  displayText: string;
  prompt: string;
  model: string;
  aspectRatio?: VideoGenRequest['aspect_ratio'];
  resolution?: VideoGenRequest['resolution'];
  ownerId: string;
  begin: (conversationId: string, displayText: string, prompt: string, model: string) => string;
  progress?: (
    conversationId: string,
    assistantMessageId: string,
    progress: number | undefined,
    status: VideoGenStatusResponse['status'],
  ) => void;
  complete: (
    conversationId: string,
    assistantMessageId: string,
    result: VideoTurnCompletion,
  ) => void;
  fail: (conversationId: string, assistantMessageId: string, message: string) => void;
  remove: (conversationId: string, assistantMessageId: string) => void;
  onPaywall: (error: ApiPaywallError) => void;
  onUnexpectedError?: (error: unknown) => void;
}

export interface VideoGenerationTurnDependencies {
  generate: (
    request: VideoGenRequest,
    options: {
      onProgress?: (progress: number | undefined, status: VideoGenStatusResponse['status']) => void;
      shouldCancel?: () => boolean;
    },
  ) => Promise<GeneratedVideo>;
}

export type VideoGenerationTurnOutcome = {
  status: 'completed' | 'failed' | 'paywall' | 'cancelled';
  assistantMessageId: string | null;
};

let cloudVideoGeneration = 0;

export function clearCloudVideoGenerationState(): void {
  cloudVideoGeneration += 1;
}

const defaultDependencies: VideoGenerationTurnDependencies = {
  generate: generateVideo,
};

export async function runVideoGenerationTurn(
  input: RunVideoGenerationTurnInput,
  dependencies: VideoGenerationTurnDependencies = defaultDependencies,
): Promise<VideoGenerationTurnOutcome> {
  const accountEpoch = captureCloudAccountEpoch();
  if (!accountEpoch) {
    input.onUnexpectedError?.(
      new Error('Sign in to an active AGI Cloud account before generating video.'),
    );
    return { status: 'failed', assistantMessageId: null };
  }
  if (accountEpoch.ownerId !== input.ownerId) {
    input.onUnexpectedError?.(
      new Error('The active AGI Cloud account changed before video generation started.'),
    );
    return { status: 'failed', assistantMessageId: null };
  }
  const generation = cloudVideoGeneration;
  const isAccountCurrent = () =>
    generation === cloudVideoGeneration && isCloudAccountEpochCurrent(accountEpoch);
  const assistantMessageId = input.begin(
    input.conversationId,
    input.displayText,
    input.prompt,
    input.model,
  );

  try {
    const result = await dependencies.generate(
      {
        prompt: input.prompt,
        model: input.model,
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
      },
      {
        onProgress: (progress, status) => {
          if (!isAccountCurrent()) return;
          input.progress?.(input.conversationId, assistantMessageId, progress, status);
        },
        shouldCancel: () => !isAccountCurrent(),
      },
    );
    if (!isAccountCurrent()) return { status: 'cancelled', assistantMessageId };

    input.complete(input.conversationId, assistantMessageId, {
      videoUrl: result.videoUrl,
      ...(result.thumbnailUrl ? { thumbnailUrl: result.thumbnailUrl } : {}),
      model: input.model,
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
