import { supportsManagedMediaImageEdit } from '@agiworkforce/cloud-contracts';
import { getModelMetadataById } from '@agiworkforce/types';

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

let mockImageModels: string[] | null = null;
jest.mock('../src/features/chat/actions/mediaMode', () => {
  const actual = jest.requireActual('../src/features/chat/actions/mediaMode');
  return {
    ...actual,
    listMediaModels: (kind: 'image' | 'video') =>
      kind === 'image' && mockImageModels ? mockImageModels : actual.listMediaModels(kind),
  };
});

const mockRunImageGenerationTurn = jest.fn();
jest.mock('../src/features/chat/actions/runImageGenerationTurn', () => ({
  ...jest.requireActual('../src/features/chat/actions/runImageGenerationTurn'),
  runImageGenerationTurn: (...args: unknown[]) => mockRunImageGenerationTurn(...args),
}));

jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => ({ ownerId: 'images-owner', epoch: 1 }),
  isCloudAccountEpochCurrent: () => true,
}));

import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatViewStore } from '../stores/chat/chatViewStore';
import { useAuthStore } from '../src/features/auth/store';
import { useTierStore } from '../src/features/billing/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useModelStore } from '../src/features/model-picker/store';
import { getDefaultCloudModelIdForTier } from '../src/features/model-picker/service';
import { listMediaModels } from '../src/features/chat/actions/mediaMode';
import type { Attachment } from '../src/features/chat/components/AttachmentPreview';
import { IMAGE_REFERENCES_UNAVAILABLE } from '../src/features/image/imageReferenceModel';
import { ReferenceImageTooLargeError } from '../src/features/image/services/imageReference';
import { startImageReferenceCreation } from '../src/features/image/startImageReferenceCreation';

const canEdit = (id: string) => supportsManagedMediaImageEdit(getModelMetadataById(id)?.provider);
const editingModels = listMediaModels('image').filter(canEdit);
const textOnlyModels = listMediaModels('image').filter((id) => !canEdit(id));

const photo = (name: string, extra: Partial<Attachment> = {}): Attachment => ({
  id: name,
  uri: `file:///cache/${name}.jpg`,
  mimeType: 'image/jpeg',
  fileName: `${name}.jpg`,
  fileSize: 31_000_000,
  ...extra,
});

const mockCreateConversation = jest.fn();
const mockFailImageGeneration = jest.fn();
const open = jest.fn();

describe('startImageReferenceCreation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockImageModels = null;
    mockRunImageGenerationTurn.mockResolvedValue({ status: 'completed', assistantMessageId: 'a' });
    mockCreateConversation.mockResolvedValue('image-conversation');
    useChatMessageStore.setState({
      createConversation: mockCreateConversation,
      failImageGeneration: mockFailImageGeneration,
    } as never);
    useChatViewStore.setState({ mediaMode: 'text', selectedMediaModel: {} });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'images-owner' } as never);
    useTierStore.setState({ tier: 'pro', grantedCapabilities: ['canUseImages'] } as never);
    useModelStore.setState({ selectedModel: getDefaultCloudModelIdForTier('pro')! } as never);
  });

  it('has an editing model and a text-only model in the catalog to test with', () => {
    expect(editingModels.length).toBeGreaterThan(0);
    expect(textOnlyModels.length).toBeGreaterThan(0);
  });

  it('edits the first photo, guides it with the rest, and leaves out the file size the shrink step handles', async () => {
    useChatViewStore.setState({ selectedMediaModel: { image: editingModels[0]! } });
    const photos = [photo('first'), photo('second'), photo('third')];

    const result = await startImageReferenceCreation({
      prompt: '  Make it snow  ',
      references: photos,
      isOnline: true,
      open,
    });

    expect(result).toEqual({ status: 'started', conversationId: 'image-conversation' });
    expect(open).toHaveBeenCalledWith('image-conversation');
    const turn = mockRunImageGenerationTurn.mock.calls[0]![0];
    expect(turn).toMatchObject({
      conversationId: 'image-conversation',
      displayText: 'Make it snow',
      prompt: 'Make it snow',
      model: editingModels[0],
      operation: 'edit',
      ownerId: 'images-owner',
      sourceImage: { uri: photos[0]!.uri, mimeType: 'image/jpeg', fileName: 'first.jpg' },
      referenceImages: [
        { uri: photos[1]!.uri, mimeType: 'image/jpeg', fileName: 'second.jpg' },
        { uri: photos[2]!.uri, mimeType: 'image/jpeg', fileName: 'third.jpg' },
      ],
    });
    expect(turn.sourceImage).not.toHaveProperty('fileSize');
    expect(turn.referenceImages[0]).not.toHaveProperty('fileSize');
  });

  it('switches to an editing model for the request when the chosen one is text only, and puts the choice back', async () => {
    const chosen = textOnlyModels[0]!;
    useChatViewStore.setState({ selectedMediaModel: { image: chosen } });

    const result = await startImageReferenceCreation({
      prompt: 'Make it snow',
      references: [photo('first')],
      isOnline: true,
      open,
    });

    expect(result.status).toBe('started');
    expect(mockRunImageGenerationTurn.mock.calls[0]![0].model).toBe(editingModels[0]);
    expect(useChatViewStore.getState().selectedMediaModel).toEqual({ image: chosen });
  });

  it('leaves the model choice empty again after a request that used the default', async () => {
    await startImageReferenceCreation({
      prompt: 'Make it snow',
      references: [photo('first')],
      isOnline: true,
      open,
    });

    expect(useChatViewStore.getState().selectedMediaModel).toEqual({});
  });

  it('refuses without starting a chat when no image model can take photos', async () => {
    mockImageModels = textOnlyModels;
    useChatViewStore.setState({ selectedMediaModel: { image: textOnlyModels[0]! } });

    const result = await startImageReferenceCreation({
      prompt: 'Make it snow',
      references: [photo('first')],
      isOnline: true,
      open,
    });

    expect(result).toEqual({ status: 'blocked', message: IMAGE_REFERENCES_UNAVAILABLE });
    expect(mockCreateConversation).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
  });

  it('returns the reason and restores the composer mode when the account cannot make images', async () => {
    useChatViewStore.setState({ mediaMode: 'video' });
    useTierStore.setState({ tier: 'free', grantedCapabilities: [] } as never);

    const result = await startImageReferenceCreation({
      prompt: 'Make it snow',
      references: [photo('first')],
      isOnline: true,
      open,
    });

    expect(result.status).toBe('blocked');
    expect(useChatViewStore.getState().mediaMode).toBe('video');
    expect(mockCreateConversation).not.toHaveBeenCalled();
  });

  it('returns the failure and restores the composer mode when the chat cannot be created', async () => {
    useChatViewStore.setState({ mediaMode: 'video' });
    mockCreateConversation.mockRejectedValue(new Error('boom'));

    const result = await startImageReferenceCreation({
      prompt: 'Make it snow',
      references: [photo('first')],
      isOnline: true,
      open,
    });

    expect(result).toEqual({
      status: 'blocked',
      message: 'Something went wrong. Please try again.',
    });
    expect(useChatViewStore.getState().mediaMode).toBe('video');
    expect(open).not.toHaveBeenCalled();
  });

  it('shows the too-large reason on the failed turn instead of the generic read failure', async () => {
    await startImageReferenceCreation({
      prompt: 'Make it snow',
      references: [photo('first')],
      isOnline: true,
      open,
    });
    const turn = mockRunImageGenerationTurn.mock.calls[0]![0];

    turn.onUnexpectedError(new ReferenceImageTooLargeError());
    turn.fail(
      'image-conversation',
      'assistant-1',
      'The reference image could not be read from this device.',
    );

    expect(mockFailImageGeneration).toHaveBeenCalledWith(
      'image-conversation',
      'assistant-1',
      'This image is too large to use as a reference, even after shrinking it.',
      undefined,
    );
  });

  it('keeps the runner message for any other failure', async () => {
    await startImageReferenceCreation({
      prompt: 'Make it snow',
      references: [photo('first')],
      isOnline: true,
      open,
    });
    const turn = mockRunImageGenerationTurn.mock.calls[0]![0];

    turn.onUnexpectedError(new Error('disk'));
    turn.fail(
      'image-conversation',
      'assistant-1',
      'The reference image could not be read from this device.',
    );

    expect(mockFailImageGeneration).toHaveBeenCalledWith(
      'image-conversation',
      'assistant-1',
      'The reference image could not be read from this device.',
      undefined,
    );
  });
});
