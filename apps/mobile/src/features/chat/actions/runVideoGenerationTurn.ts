import { ApiPaywallError } from '@/services/api';
import { CLOUD_SIGN_IN_MESSAGE } from '@/services/apiErrors';
import {
  MediaGenerationAdmissionError,
  MEDIA_USAGE_LIMIT_MESSAGE,
  isUsageLimitRefusal,
  mediaGenerationFailureMessage,
} from './mediaGenerationError';
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

const CLOUD_CONVERSATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  durationSecs?: number;
  ownerId: string;
  onStarted?: () => void;
  begin: (conversationId: string, displayText: string, prompt: string, model: string) => string;
  taskCreated?: (conversationId: string, assistantMessageId: string, taskId: string) => void;
  isCancelRequested?: (conversationId: string, assistantMessageId: string) => boolean;
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
      onTaskCreated?: (taskId: string) => void;
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
    input.onUnexpectedError?.(new MediaGenerationAdmissionError(CLOUD_SIGN_IN_MESSAGE));
    return { status: 'failed', assistantMessageId: null };
  }
  if (accountEpoch.ownerId !== input.ownerId) {
    input.onUnexpectedError?.(
      new MediaGenerationAdmissionError(
        'The active AGI Cloud account changed before video generation started.',
      ),
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
  input.onStarted?.();

  const isStopRequested = () =>
    input.isCancelRequested?.(input.conversationId, assistantMessageId) === true;

  try {
    const result = await dependencies.generate(
      {
        prompt: input.prompt,
        model: input.model,
        ...(CLOUD_CONVERSATION_ID.test(input.conversationId)
          ? { conversation_id: input.conversationId }
          : {}),
        ...(input.aspectRatio ? { aspect_ratio: input.aspectRatio } : {}),
        ...(input.resolution ? { resolution: input.resolution } : {}),
        ...(input.durationSecs ? { duration_secs: input.durationSecs } : {}),
      },
      {
        onTaskCreated: (taskId) => {
          input.taskCreated?.(input.conversationId, assistantMessageId, taskId);
        },
        onProgress: (progress, status) => {
          if (!isAccountCurrent()) return;
          input.progress?.(input.conversationId, assistantMessageId, progress, status);
        },
        shouldCancel: () => !isAccountCurrent() || isStopRequested(),
      },
    );
    if (!isAccountCurrent() || isStopRequested())
      return { status: 'cancelled', assistantMessageId };

    input.complete(input.conversationId, assistantMessageId, {
      videoUrl: result.videoUrl,
      ...(result.thumbnailUrl ? { thumbnailUrl: result.thumbnailUrl } : {}),
      model: input.model,
    });
    return { status: 'completed', assistantMessageId };
  } catch (error) {
    if (!isAccountCurrent() || isStopRequested())
      return { status: 'cancelled', assistantMessageId };
    if (error instanceof ApiPaywallError) {
      input.remove(input.conversationId, assistantMessageId);
      input.onPaywall(error);
      return { status: 'paywall', assistantMessageId };
    }

    if (isUsageLimitRefusal(error)) {
      input.fail(input.conversationId, assistantMessageId, MEDIA_USAGE_LIMIT_MESSAGE);
      return { status: 'failed', assistantMessageId };
    }

    input.onUnexpectedError?.(error);
    input.fail(input.conversationId, assistantMessageId, mediaGenerationFailureMessage('video'));
    return { status: 'failed', assistantMessageId };
  }
}
