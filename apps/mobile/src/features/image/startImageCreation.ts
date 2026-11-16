import { FEATURES } from '@/lib/v1FeatureFlags';
import { toUserMessage } from '@/services/userMessage';
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
import {
  resolveMobileImageGenerationRequest,
  type MobileImageGenerationRequestDecision,
} from '@/src/features/chat/actions/resolveMobileImageGenerationRequest';
import { runImageGenerationTurn } from '@/src/features/chat/actions/runImageGenerationTurn';
import {
  freeImageOfferFor,
  FREE_IMAGE_OFFER_UNKNOWN_ALERT,
} from '@/src/features/chat/actions/freeImageOffer';
import {
  MediaGenerationAdmissionError,
  mediaGenerationFailureMessage,
} from '@/src/features/chat/actions/mediaGenerationError';
import { resolveOnAcceptedSend } from '@/src/features/chat/utils/sendDispatch';
import type { MediaMode } from '@/stores/chat/chatViewStore';

export const IMAGE_CREATION_UNAVAILABLE = 'Image creation is unavailable right now.';
export const IMAGE_CREATION_NOT_ON_ACCOUNT = 'Image creation isn’t available on this account.';
export const IMAGE_REQUEST_NOT_SENT = 'Image request could not be sent. Please try again.';
const IMAGE_PROMPT_MISSING = 'Describe the image you want.';
const ACCOUNT_CHANGED = 'The active AGI Cloud account changed. Try again.';
const CHAT_NOT_STARTED = 'Something went wrong. Please try again.';
const CONVERSATION_TITLE_LENGTH = 40;

export type ImageCreationResult =
  { status: 'started'; conversationId: string } | { status: 'blocked'; message: string };

export function imageConversationTitle(prompt: string): string {
  return prompt.length > CONVERSATION_TITLE_LENGTH
    ? prompt.slice(0, CONVERSATION_TITLE_LENGTH).trim() + '...'
    : prompt;
}

function blocked(message: string): ImageCreationResult {
  return { status: 'blocked', message };
}

function restoreMediaMode(previous: MediaMode): void {
  const view = useChatViewStore.getState();
  if (view.mediaMode !== previous) view.setMediaMode(previous);
}

async function createImageConversation(
  title: string,
): Promise<{ conversationId: string } | { message: string }> {
  try {
    return { conversationId: await useChatStore.getState().createConversation(title) };
  } catch (error) {
    return {
      message: toUserMessage(
        error instanceof Error && error.cause ? error.cause : error,
        CHAT_NOT_STARTED,
      ),
    };
  }
}

async function startFreeImage(
  request: Extract<MobileImageGenerationRequestDecision, { status: 'blocked' }>,
  open: (conversationId: string) => void,
): Promise<ImageCreationResult> {
  const account = captureCloudAccountEpoch();
  if (!account || account.ownerId !== useAuthStore.getState().clerkUserId) {
    return blocked(FREE_IMAGE_OFFER_UNKNOWN_ALERT.message);
  }
  const offer = await freeImageOfferFor(request, account);
  if (!isCloudAccountEpochCurrent(account)) return blocked(ACCOUNT_CHANGED);
  if (offer.status === 'unknown') return blocked(FREE_IMAGE_OFFER_UNKNOWN_ALERT.message);
  if (offer.status !== 'offered') return blocked(IMAGE_CREATION_NOT_ON_ACCOUNT);

  const created = await createImageConversation(imageConversationTitle(offer.prompt));
  if ('message' in created) return blocked(created.message);
  const { conversationId } = created;
  if (!isCloudAccountEpochCurrent(account)) return blocked(ACCOUNT_CHANGED);

  const accepted = await resolveOnAcceptedSend(
    (onAccepted) =>
      useChatStore
        .getState()
        .sendMessage(conversationId, offer.prompt, offer.model, undefined, { onAccepted }),
    (error) => console.warn('[ImagesScreen] Free image request failed:', error),
  );
  if (!accepted) {
    void useChatStore.getState().discardUnsentConversation(conversationId);
    return blocked(IMAGE_REQUEST_NOT_SENT);
  }
  open(conversationId);
  useChatViewStore.getState().resetMediaChoice('image');
  return { status: 'started', conversationId };
}

function refusedRequestResult(
  request: Exclude<MobileImageGenerationRequestDecision, { status: 'ready' }>,
  open: (conversationId: string) => void,
): Promise<ImageCreationResult> | ImageCreationResult {
  if (request.status === 'not_requested') return blocked(IMAGE_CREATION_UNAVAILABLE);
  if (request.code !== 'plan_required') return blocked(request.alert.message);
  return request.prompt ? startFreeImage(request, open) : blocked(IMAGE_CREATION_NOT_ON_ACCOUNT);
}

export async function startImageCreation({
  prompt,
  isOnline,
  open,
}: {
  prompt: string;
  isOnline: boolean;
  open: (conversationId: string) => void;
}): Promise<ImageCreationResult> {
  const text = prompt.trim();
  if (!text) return blocked(IMAGE_PROMPT_MISSING);

  const previousMode = useChatViewStore.getState().mediaMode;
  if (!enterMediaMode('image')) return blocked(IMAGE_CREATION_UNAVAILABLE);

  const { tier, grantedCapabilities } = useTierStore.getState();
  const { isClerkSignedIn, clerkUserId } = useAuthStore.getState();
  const request = resolveMobileImageGenerationRequest({
    executionMode: useChatAppModeStore.getState().appMode,
    text,
    mediaMode: 'image',
    selection: useModelStore.getState().selectedModel,
    subscriptionTier: tier,
    attachments: [],
    globalImageGenerationEnabled: FEATURES.imageGen,
    imageGenerationEnabled: useChatStore.getState().features.imageGen,
    isClerkSignedIn,
    ownerId: clerkUserId,
    grantedCapabilities,
    isOnline,
  });

  if (request.status !== 'ready') {
    const result = await refusedRequestResult(request, open);
    if (result.status === 'blocked') restoreMediaMode(previousMode);
    return result;
  }

  const account = captureCloudAccountEpoch();
  if (!account || account.ownerId !== clerkUserId) {
    restoreMediaMode(previousMode);
    return blocked(ACCOUNT_CHANGED);
  }
  const created = await createImageConversation(imageConversationTitle(request.prompt));
  if ('message' in created) {
    restoreMediaMode(previousMode);
    return blocked(created.message);
  }
  const { conversationId } = created;
  if (!isCloudAccountEpochCurrent(account)) {
    restoreMediaMode(previousMode);
    return blocked(ACCOUNT_CHANGED);
  }

  open(conversationId);
  useChatViewStore.getState().resetMediaChoice('image');

  const chat = useChatStore.getState();
  let started = false;
  void runImageGenerationTurn({
    conversationId,
    displayText: text,
    prompt: request.prompt,
    model: request.model,
    transparentBackground: request.transparentBackground,
    ownerId: request.ownerId,
    onStarted: () => {
      started = true;
    },
    begin: chat.beginImageGeneration,
    complete: chat.completeImageGeneration,
    fail: chat.failImageGeneration,
    remove: chat.deleteMessage,
    onPaywall: (error) => {
      useChatExecutionStore
        .getState()
        .setPaywallError(paywallErrorStateFromApiError(error), conversationId);
    },
    onUnexpectedError: (error) => {
      console.warn('[ImagesScreen] Image generation failed:', error);
      useChatExecutionStore
        .getState()
        .setSendError(
          !started && error instanceof MediaGenerationAdmissionError
            ? error.userMessage
            : mediaGenerationFailureMessage('image'),
          { conversationId },
        );
    },
  });
  return { status: 'started', conversationId };
}
