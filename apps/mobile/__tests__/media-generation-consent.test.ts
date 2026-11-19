const mockMmkvValues = new Map<string, string>();
jest.mock('../lib/mmkv', () => ({
  ...jest.requireActual('../lib/mmkv'),
  storage: {
    getString: (key: string) => mockMmkvValues.get(key),
    set: (key: string, value: string) => mockMmkvValues.set(key, value),
    delete: (key: string) => mockMmkvValues.delete(key),
  },
}));

const mockPost = jest.fn();
const mockGet = jest.fn();
jest.mock('@/services/api', () => ({
  api: {
    post: (...args: unknown[]) => mockPost(...args),
    get: (...args: unknown[]) => mockGet(...args),
  },
  ApiPaywallError: class extends Error {},
}));

const mockEnsureCloudSendConsent = jest.fn();
jest.mock('@/services/llmGate', () => ({
  ...jest.requireActual('@/services/llmGate'),
  ensureCloudSendConsent: () => mockEnsureCloudSendConsent(),
}));

jest.mock('@/lib/v1FeatureFlags', () => ({ FEATURES: { imageGen: true } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '12345678-abcd-4abc-8abc-1234567890ab' }));

import { CloudProviderConsentDeclinedError } from '../services/llmGate';
import { recordCloudProviderConsent } from '../services/providerConsent';
import { generateImage } from '../src/features/image/services/imagegen';
import { generateVideo, startVideoGeneration } from '../src/features/video/services/videogen';
import { runImageGenerationTurn } from '../src/features/chat/actions/runImageGenerationTurn';
import { runVideoGenerationTurn } from '../src/features/chat/actions/runVideoGenerationTurn';
import { sharingWithProvidersAllowed } from '../src/features/chat/actions/mediaGenerationConsent';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const OWNER = 'media-consent-owner';

function turnCallbacks() {
  return {
    begin: jest.fn(() => 'assistant-1'),
    complete: jest.fn(),
    fail: jest.fn(),
    remove: jest.fn(),
    onPaywall: jest.fn(),
    onUnexpectedError: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMmkvValues.clear();
  __resetCloudAccountSessionForTests();
  activateCloudAccount(OWNER);
  mockEnsureCloudSendConsent.mockResolvedValue(undefined);
  mockPost.mockResolvedValue({ success: true, images: [] });
});

describe('making a picture before sharing with AI providers is allowed', () => {
  it('sends nothing and hands the Not now answer back to the caller', async () => {
    const declined = new CloudProviderConsentDeclinedError();
    mockEnsureCloudSendConsent.mockRejectedValue(declined);

    await expect(generateImage({ prompt: 'A lighthouse at dawn' })).rejects.toBe(declined);

    expect(mockPost).not.toHaveBeenCalled();
  });

  it('sends the same request as before once sharing is allowed', async () => {
    await generateImage({ prompt: 'A lighthouse at dawn' }, { operationId: 'operation-1' });

    expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/media/image/generate',
      { prompt: 'A lighthouse at dawn', async: true },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    );
  });
});

describe('making a video before sharing with AI providers is allowed', () => {
  it('starts no task and hands the Not now answer back to the caller', async () => {
    const declined = new CloudProviderConsentDeclinedError();
    mockEnsureCloudSendConsent.mockRejectedValue(declined);
    const onTaskCreated = jest.fn();

    await expect(startVideoGeneration({ prompt: 'A kite over the sea' })).rejects.toBe(declined);
    await expect(generateVideo({ prompt: 'A kite over the sea' }, { onTaskCreated })).rejects.toBe(
      declined,
    );

    expect(mockPost).not.toHaveBeenCalled();
    expect(onTaskCreated).not.toHaveBeenCalled();
  });

  it('starts the same task as before once sharing is allowed', async () => {
    mockPost.mockResolvedValue({ task_id: 'task-1', status: 'queued' });

    await expect(startVideoGeneration({ prompt: 'A kite over the sea' })).resolves.toEqual({
      task_id: 'task-1',
      status: 'queued',
    });

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      '/api/media/video/generate',
      { prompt: 'A kite over the sea' },
      { headers: { 'Idempotency-Key': expect.any(String) } },
    );
  });
});

describe('asking to share before a picture or video turn starts', () => {
  it.each([
    ['picture', runImageGenerationTurn],
    ['video', runVideoGenerationTurn],
  ] as const)(
    'asks before the %s is added to the chat and adds nothing on Not now',
    async (_kind, run) => {
      mockEnsureCloudSendConsent.mockRejectedValue(new CloudProviderConsentDeclinedError());
      const callbacks = turnCallbacks();

      const outcome = await run({
        conversationId: 'conversation-1',
        displayText: 'A lighthouse at dawn',
        prompt: 'A lighthouse at dawn',
        model: 'fixture-media-model',
        ownerId: OWNER,
        ...callbacks,
      });

      expect(outcome).toEqual({ status: 'declined', assistantMessageId: null });
      expect(callbacks.begin).not.toHaveBeenCalled();
      expect(callbacks.remove).not.toHaveBeenCalled();
      expect(callbacks.fail).not.toHaveBeenCalled();
      expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
      expect(mockPost).not.toHaveBeenCalled();
    },
  );

  const turnInput = {
    conversationId: 'conversation-1',
    displayText: 'A lighthouse at dawn',
    prompt: 'A lighthouse at dawn',
    model: 'fixture-media-model',
    ownerId: OWNER,
  };

  it('adds the picture to the chat at once when sharing was already allowed', async () => {
    recordCloudProviderConsent();
    const callbacks = turnCallbacks();

    const pending = runImageGenerationTurn({ ...turnInput, ...callbacks });

    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    await pending;
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('adds the video to the chat at once when sharing was already allowed', async () => {
    recordCloudProviderConsent();
    mockPost.mockResolvedValue({ task_id: 'task-1', status: 'queued' });
    const callbacks = turnCallbacks();

    const pending = runVideoGenerationTurn({
      ...turnInput,
      ...callbacks,
      isCancelRequested: () => true,
    });

    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    await pending;
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('keeps the question out of the time a picture is given to arrive', async () => {
    let answer: () => void = () => undefined;
    mockEnsureCloudSendConsent
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            answer = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const callbacks = turnCallbacks();

    const pending = runImageGenerationTurn(
      {
        conversationId: 'conversation-1',
        displayText: 'A lighthouse at dawn',
        prompt: 'A lighthouse at dawn',
        model: 'fixture-image-model',
        ownerId: OWNER,
        ...callbacks,
      },
      {
        generate: generateImage,
        getUri: () => 'file:///lighthouse.png',
        timeoutMs: 1,
        sharingAllowed: sharingWithProvidersAllowed,
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    answer();

    await expect(pending).resolves.toEqual({
      status: 'completed',
      assistantMessageId: 'assistant-1',
    });
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

describe('a picture or video turn whose request finds sharing not allowed', () => {
  it('takes the picture placeholder away and shows no failure', async () => {
    mockEnsureCloudSendConsent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new CloudProviderConsentDeclinedError());
    const callbacks = turnCallbacks();

    const outcome = await runImageGenerationTurn({
      conversationId: 'conversation-1',
      displayText: 'A lighthouse at dawn',
      prompt: 'A lighthouse at dawn',
      model: 'fixture-image-model',
      ownerId: OWNER,
      ...callbacks,
    });

    expect(outcome).toEqual({ status: 'declined', assistantMessageId: null });
    expect(mockPost).not.toHaveBeenCalled();
    expect(callbacks.remove).toHaveBeenCalledWith('conversation-1', 'assistant-1');
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
  });

  it('takes the video placeholder away and shows no failure', async () => {
    mockEnsureCloudSendConsent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new CloudProviderConsentDeclinedError());
    const callbacks = turnCallbacks();

    const outcome = await runVideoGenerationTurn({
      conversationId: 'conversation-1',
      displayText: 'A kite over the sea',
      prompt: 'A kite over the sea',
      model: 'fixture-video-model',
      ownerId: OWNER,
      ...callbacks,
    });

    expect(outcome).toEqual({ status: 'declined', assistantMessageId: null });
    expect(mockPost).not.toHaveBeenCalled();
    expect(callbacks.remove).toHaveBeenCalledWith('conversation-1', 'assistant-1');
    expect(callbacks.fail).not.toHaveBeenCalled();
    expect(callbacks.onUnexpectedError).not.toHaveBeenCalled();
  });
});

describe('asking to share with AI providers ahead of a picture or video', () => {
  it('answers no for Not now and passes any other failure on', async () => {
    mockEnsureCloudSendConsent.mockRejectedValueOnce(new CloudProviderConsentDeclinedError());
    await expect(sharingWithProvidersAllowed()).resolves.toBe(false);

    const failure = new Error('The provider list could not be opened');
    mockEnsureCloudSendConsent.mockRejectedValueOnce(failure);
    await expect(sharingWithProvidersAllowed()).rejects.toBe(failure);

    await expect(sharingWithProvidersAllowed()).resolves.toBe(true);
  });
});
