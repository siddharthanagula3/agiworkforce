import { beforeEach, describe, expect, it } from 'vitest';
import {
  imageTranscriptMutationKeys,
  useImageTranscriptRecoveryStore,
  type ImagePromptTranscriptRecovery,
  type ImageResultTranscriptRecovery,
} from './image-transcript-recovery-store';

const USER_MESSAGE_ID = '00000000-0000-4000-8000-000000000501';
const ASSISTANT_MESSAGE_ID = '00000000-0000-4000-8000-000000000502';

const promptRecovery: ImagePromptTranscriptRecovery = {
  phase: 'prompt',
  status: 'failed',
  conversationId: '00000000-0000-4000-8000-000000000503',
  userMessageId: USER_MESSAGE_ID,
  assistantMessageId: ASSISTANT_MESSAGE_ID,
  prompt: 'synthetic prompt',
  requestedAspect: 'auto',
  imageRequest: {},
};

const resultRecovery: ImageResultTranscriptRecovery = {
  phase: 'result',
  status: 'failed',
  conversationId: promptRecovery.conversationId,
  assistantMessageId: ASSISTANT_MESSAGE_ID,
  metadata: {
    toolType: 'image-generation',
    imageUrl: '/api/files/00000000-0000-4000-8000-000000000504',
  },
};

describe('image transcript recovery store', () => {
  beforeEach(() => {
    useImageTranscriptRecoveryStore.getState().reset();
  });

  it('atomically locks every row in a prompt recovery until the owner releases it', () => {
    const store = useImageTranscriptRecoveryStore.getState();
    const keys = imageTranscriptMutationKeys(promptRecovery);

    expect(store.tryAcquireMutation(keys)).toBe(true);
    expect(useImageTranscriptRecoveryStore.getState().isMutationInFlight(USER_MESSAGE_ID)).toBe(
      true,
    );
    expect(
      useImageTranscriptRecoveryStore.getState().isMutationInFlight(ASSISTANT_MESSAGE_ID),
    ).toBe(true);
    expect(useImageTranscriptRecoveryStore.getState().tryAcquireMutation([USER_MESSAGE_ID])).toBe(
      false,
    );

    useImageTranscriptRecoveryStore.getState().releaseMutation(keys);
    expect(useImageTranscriptRecoveryStore.getState().tryAcquireMutation(keys)).toBe(true);
  });

  it('keeps exact recovery payloads until their assistant or prompt row is removed', () => {
    useImageTranscriptRecoveryStore.getState().setRecovery(promptRecovery);
    expect(useImageTranscriptRecoveryStore.getState().recoveries[ASSISTANT_MESSAGE_ID]).toEqual(
      promptRecovery,
    );

    useImageTranscriptRecoveryStore.getState().removeRecoveriesForMessages([USER_MESSAGE_ID]);
    expect(useImageTranscriptRecoveryStore.getState().recoveries).toEqual({});

    useImageTranscriptRecoveryStore.getState().setRecovery(resultRecovery);
    useImageTranscriptRecoveryStore.getState().removeRecoveriesForMessages([ASSISTANT_MESSAGE_ID]);
    expect(useImageTranscriptRecoveryStore.getState().recoveries).toEqual({});
  });
});
