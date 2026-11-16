import { FEATURES } from '@/lib/v1FeatureFlags';
import {
  paywallErrorStateFromApiError,
  useChatExecutionStore,
  useChatStore,
  useChatViewStore,
} from '@/stores/chatStore';
import { useAuthStore } from '@/src/features/auth/store';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
} from '@/src/features/auth/services/cloudAccountSession';
import { useTierStore } from '@/src/features/billing/store';
import { useModelStore } from '@/src/features/model-picker/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { enterMediaMode } from '@/src/features/chat/actions/mediaMode';
import { resolveMobileImageGenerationRequest } from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';
import { runImageGenerationTurn } from '@/src/features/chat/actions/runImageGenerationTurn';
import {
  MediaGenerationAdmissionError,
  mediaGenerationFailureMessage,
} from '@/src/features/chat/actions/mediaGenerationError';
import type { Attachment } from '@/src/features/chat/components/AttachmentPreview';
import { toUserMessage } from '@/services/userMessage';
import type { MediaMode } from '@/stores/chat/chatViewStore';
import {
  IMAGE_CREATION_UNAVAILABLE,
  imageConversationTitle,
  type ImageCreationResult,
} from './startImageCreation';
import {
  IMAGE_REFERENCES_UNAVAILABLE,
  resolveImageReferenceModel,
  withImageReferenceModel,
} from './imageReferenceModel';
import { ReferenceImageTooLargeError } from './services/imageReference';

const ACCOUNT_CHANGED = 'The active AGI Cloud account changed. Try again.';
const CHAT_NOT_STARTED = 'Something went wrong. Please try again.';

function blocked(message: string): ImageCreationResult {
  return { status: 'blocked', message };
}

function restoreMediaMode(previous: MediaMode): void {
  const view = useChatViewStore.getState();
  if (view.mediaMode !== previous) view.setMediaMode(previous);
}

export async function startImageReferenceCreation({
  prompt,
  references,
  isOnline,
  open,
}: {
  prompt: string;
  references: readonly Attachment[];
  isOnline: boolean;
  open: (conversationId: string) => void;
}): Promise<ImageCreationResult> {
  const text = prompt.trim();
  const referenceModel = resolveImageReferenceModel();
  if (referenceModel.status === 'unavailable') return blocked(IMAGE_REFERENCES_UNAVAILABLE);

  const previousMode = useChatViewStore.getState().mediaMode;
  if (!enterMediaMode('image')) return blocked(IMAGE_CREATION_UNAVAILABLE);

  const { tier, grantedCapabilities } = useTierStore.getState();
  const { isClerkSignedIn, clerkUserId } = useAuthStore.getState();
  const request = withImageReferenceModel(referenceModel.modelId, () =>
    resolveMobileImageGenerationRequest({
      executionMode: useChatAppModeStore.getState().appMode,
      text,
      mediaMode: 'image',
      selection: useModelStore.getState().selectedModel,
      subscriptionTier: tier,
      // No fileSize: readReferenceImageBase64 shrinks a large photo to fit, so that read is the size check.
      attachments: references.map(({ uri, mimeType, fileName }) => ({ uri, mimeType, fileName })),
      globalImageGenerationEnabled: FEATURES.imageGen,
      imageGenerationEnabled: useChatStore.getState().features.imageGen,
      isClerkSignedIn,
      ownerId: clerkUserId,
      grantedCapabilities,
      isOnline,
    }),
  );
  if (request.status !== 'ready') {
    restoreMediaMode(previousMode);
    return blocked(
      request.status === 'blocked' ? request.alert.message : IMAGE_CREATION_UNAVAILABLE,
    );
  }

  const account = captureCloudAccountEpoch();
  if (!account || account.ownerId !== clerkUserId) {
    restoreMediaMode(previousMode);
    return blocked(ACCOUNT_CHANGED);
  }
  let conversationId: string;
  try {
    conversationId = await useChatStore
      .getState()
      .createConversation(imageConversationTitle(request.prompt));
  } catch (error) {
    restoreMediaMode(previousMode);
    return blocked(
      toUserMessage(error instanceof Error && error.cause ? error.cause : error, CHAT_NOT_STARTED),
    );
  }
  if (!isCloudAccountEpochCurrent(account)) {
    restoreMediaMode(previousMode);
    return blocked(ACCOUNT_CHANGED);
  }

  open(conversationId);
  useChatViewStore.getState().resetMediaChoice('image');

  const chat = useChatStore.getState();
  let started = false;
  let referenceFailure: string | null = null;
  void runImageGenerationTurn({
    conversationId,
    displayText: text,
    prompt: request.prompt,
    model: request.model,
    transparentBackground: request.transparentBackground,
    operation: request.operation,
    sourceImage: request.sourceImage,
    referenceImages: request.referenceImages,
    ownerId: request.ownerId,
    onStarted: () => {
      started = true;
    },
    begin: chat.beginImageGeneration,
    complete: chat.completeImageGeneration,
    fail: (failedConversationId, assistantMessageId, message, retryAt) =>
      chat.failImageGeneration(
        failedConversationId,
        assistantMessageId,
        referenceFailure ?? message,
        retryAt,
      ),
    remove: chat.deleteMessage,
    onPaywall: (error) => {
      useChatExecutionStore
        .getState()
        .setPaywallError(paywallErrorStateFromApiError(error), conversationId);
    },
    onUnexpectedError: (error) => {
      console.warn('[ImagesScreen] Image generation with photos failed:', error);
      if (error instanceof ReferenceImageTooLargeError) referenceFailure = error.message;
      useChatExecutionStore
        .getState()
        .setSendError(
          referenceFailure ??
            (!started && error instanceof MediaGenerationAdmissionError
              ? error.userMessage
              : mediaGenerationFailureMessage('image')),
          { conversationId },
        );
    },
  });
  return { status: 'started', conversationId };
}
