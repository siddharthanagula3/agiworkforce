import { getModelMetadataById } from '@agiworkforce/types';

const mockCalls: string[] = [];

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockEnterMediaMode = jest.fn();
jest.mock('../src/features/chat/actions/mediaMode', () => {
  const actual = jest.requireActual('../src/features/chat/actions/mediaMode');
  return {
    ...actual,
    enterMediaMode: (...args: [never]) => {
      mockCalls.push('enterMediaMode');
      return mockEnterMediaMode(...args) ?? actual.enterMediaMode(...args);
    },
  };
});

const mockRunImageGenerationTurn = jest.fn();
jest.mock('../src/features/chat/actions/runImageGenerationTurn', () => ({
  ...jest.requireActual('../src/features/chat/actions/runImageGenerationTurn'),
  runImageGenerationTurn: (...args: unknown[]) => {
    mockCalls.push('runImageGenerationTurn');
    return mockRunImageGenerationTurn(...args);
  },
}));

let mockAccountCurrent = true;
let mockAccount: { ownerId: string; epoch: number } | null = { ownerId: 'images-owner', epoch: 1 };
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => mockAccount,
  isCloudAccountEpochCurrent: () => mockAccountCurrent,
}));

import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useAuthStore } from '../src/features/auth/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useModelStore } from '../src/features/model-picker/store';
import { getDefaultCloudModelIdForTier } from '../src/features/model-picker/service';
import {
  IMAGE_CREATION_UNAVAILABLE,
  imageConversationTitle,
  startImageCreation,
} from '../src/features/image/startImageCreation';

const mockCreateConversation = jest.fn();
const mockDiscardUnsentConversation = jest.fn();
const open = jest.fn((conversationId: string) => {
  mockCalls.push(`open:${conversationId}`);
});

describe('startImageCreation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCalls.length = 0;
    mockAccountCurrent = true;
    mockAccount = { ownerId: 'images-owner', epoch: 1 };
    mockEnterMediaMode.mockReturnValue(undefined);
    mockRunImageGenerationTurn.mockResolvedValue({ status: 'completed', assistantMessageId: 'a' });
    mockCreateConversation.mockImplementation(async () => {
      mockCalls.push('createConversation');
      return 'image-conversation';
    });
    useChatMessageStore.setState({
      createConversation: mockCreateConversation,
      discardUnsentConversation: mockDiscardUnsentConversation,
    } as never);
    useChatViewStore.setState({ mediaMode: 'text' });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'images-owner' } as never);
    useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] } as never);
    useModelStore.setState({ selectedModel: getDefaultCloudModelIdForTier('pro')! } as never);
  });

  it('enters image mode, creates the Cloud chat titled from the prompt, opens it, then starts the image', async () => {
    const prompt = 'A lighthouse on a cliff at dawn, painted in thick oil strokes';

    const result = await startImageCreation({ prompt, isOnline: true, open });

    expect(result).toEqual({ status: 'started', conversationId: 'image-conversation' });
    expect(mockCalls).toEqual([
      'enterMediaMode',
      'createConversation',
      'open:image-conversation',
      'runImageGenerationTurn',
    ]);
    expect(mockEnterMediaMode).toHaveBeenCalledWith('image');
    expect(mockCreateConversation).toHaveBeenCalledWith(imageConversationTitle(prompt));
    expect(imageConversationTitle(prompt)).toBe(`${prompt.slice(0, 40).trim()}...`);
    const turn = mockRunImageGenerationTurn.mock.calls[0]![0];
    expect(turn).toMatchObject({
      conversationId: 'image-conversation',
      displayText: prompt,
      prompt,
      ownerId: 'images-owner',
    });
    expect(getModelMetadataById(turn.model)?.capabilities.imageGen).toBe(true);
    expect(useChatViewStore.getState().mediaMode).toBe('text');
  });

  it('stays on the page with a reason when no image model can run', async () => {
    mockEnterMediaMode.mockReturnValue(false);

    const result = await startImageCreation({ prompt: 'A red kite', isOnline: true, open });

    expect(result).toEqual({ status: 'blocked', message: IMAGE_CREATION_UNAVAILABLE });
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
  });

  it('returns the failure to the page and restores the composer mode when the chat cannot be created', async () => {
    useChatViewStore.setState({ mediaMode: 'video' });
    mockCreateConversation.mockRejectedValue(new Error('boom'));

    const result = await startImageCreation({ prompt: 'A red kite', isOnline: true, open });

    expect(result).toEqual({
      status: 'blocked',
      message: 'Something went wrong. Please try again.',
    });
    expect(open).not.toHaveBeenCalled();
    expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
    expect(useChatViewStore.getState().mediaMode).toBe('video');
  });

  it('does not open or start the image when the account changed while the chat was created', async () => {
    mockAccountCurrent = false;

    const result = await startImageCreation({ prompt: 'A red kite', isOnline: true, open });

    expect(result.status).toBe('blocked');
    expect(open).not.toHaveBeenCalled();
    expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
    expect(mockDiscardUnsentConversation).not.toHaveBeenCalled();
  });

  it('creates no chat when no AGI Cloud account is active for the signed-in person', async () => {
    useChatViewStore.setState({ mediaMode: 'video' });
    mockAccount = null;

    const result = await startImageCreation({ prompt: 'A red kite', isOnline: true, open });

    expect(result).toEqual({
      status: 'blocked',
      message: 'The active AGI Cloud account changed. Try again.',
    });
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(useChatViewStore.getState().mediaMode).toBe('video');
  });

  it('creates no chat when the active AGI Cloud account is not the signed-in person', async () => {
    mockAccount = { ownerId: 'someone-else', epoch: 1 };

    const result = await startImageCreation({ prompt: 'A red kite', isOnline: true, open });

    expect(result.status).toBe('blocked');
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it('refuses offline before creating a chat', async () => {
    const result = await startImageCreation({ prompt: 'A red kite', isOnline: false, open });

    expect(result).toEqual({
      status: 'blocked',
      message: 'Image generation needs AGI Cloud. Connect to the internet and try again.',
    });
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(useChatViewStore.getState().mediaMode).toBe('text');
  });
});
