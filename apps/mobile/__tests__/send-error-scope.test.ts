jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(this: { name: string; message: string }, feat: string) {
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);
  return {
    api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

const mockEnsureCloudSendConsent = jest.fn();
jest.mock('../services/llmGate', () => ({
  ...jest.requireActual('../services/llmGate'),
  ensureCloudSendConsent: (...args: unknown[]) => mockEnsureCloudSendConsent(...args),
}));

const mockUploadWithRetry = jest.fn();
jest.mock('../src/features/chat/upload/uploadAttachment', () => ({
  ...jest.requireActual('../src/features/chat/upload/uploadAttachment'),
  uploadWithRetry: (...args: unknown[]) => mockUploadWithRetry(...args),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
    localGenerate: jest.fn(),
    getCapabilities: jest.fn().mockResolvedValue({ tier2Available: true, tier3Available: true }),
  };
});

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { Alert, type AlertButton } from 'react-native';
import { getModelMetadataById } from '@agiworkforce/types';
import { getDefaultModel } from '@agiworkforce/local-llm';
import type { Attachment } from '../src/features/chat/components/AttachmentPreview';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { clearCloudExecutionState, useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { useTierStore } from '../src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;

const CONV_A = '0190a000-0000-7000-8000-0000000000a1';
const CONV_B = '0190a000-0000-7000-8000-0000000000b1';
const ENTITLED_TIER = 'max';
const PAYWALL = {
  feature: 'token_cap',
  requiredTier: 'basic',
  reason: 'Usage limit reached',
  code: 'subscription_required',
  recoveryAction: 'subscribe',
} as const;

const visionModel = requireMobileCloudModel(
  (model) => getModelMetadataById(model.id)?.capabilities.vision === true,
  'Mobile Cloud model that reads images',
).id;

function seedCloudConversation(id: string) {
  useChatCloudMessageStore.getState().addCloudConversation({
    id,
    title: `Chat ${id.slice(-2)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: visionModel,
    executionMode: 'cloud',
  });
}

function photo(): Attachment {
  return {
    id: 'photo-scope',
    uri: 'file:///cache/scope-1.jpg',
    mimeType: 'image/jpeg',
    fileName: 'IMG_0002.jpg',
  };
}

function agreeToUploads() {
  jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
    if (title !== 'Send files to AGI Cloud?') return;
    (buttons as AlertButton[] | undefined)
      ?.find((button) => button.text === 'Upload & Send')
      ?.onPress?.();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCloudSendConsent.mockReset().mockResolvedValue(undefined);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('send-error-scope-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {}, currentConversationId: null });
  useChatExecutionStore.setState({
    error: null,
    failureCode: null,
    paywallError: null,
    providerConsentError: null,
    freeCapacityError: null,
    errorConversationId: null,
    errorRetry: null,
  });
  useTierStore.setState({ tier: ENTITLED_TIER, billingTier: ENTITLED_TIER });
  seedCloudConversation(CONV_A);
  seedCloudConversation(CONV_B);
});

afterEach(() => {
  clearCloudExecutionState();
});

describe('a send failure belongs to its conversation', () => {
  it('an upload that fails before anything is stored offers to send the draft again', async () => {
    agreeToUploads();
    mockUploadWithRetry.mockResolvedValue(null);

    const accepted = await useChatExecutionStore
      .getState()
      .sendMessage(CONV_A, 'what is this', visionModel, [photo()]);

    expect(accepted).toBe(false);
    expect(mockStreamChat).not.toHaveBeenCalled();
    const state = useChatExecutionStore.getState();
    expect(state.error).toEqual(expect.any(String));
    expect(state.errorConversationId).toBe(CONV_A);
    expect(state.errorRetry).toEqual({ kind: 'resend' });
  });

  it('a stored turn that fails offers to regenerate that question, not the draft', async () => {
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onError(new Error('connection dropped'));
    });

    await useChatExecutionStore.getState().sendMessage(CONV_A, 'hello', visionModel);

    const question = (useChatCloudMessageStore.getState().messages[CONV_A] ?? []).find(
      (message) => message.role === 'user',
    );
    expect(question).toBeDefined();
    const state = useChatExecutionStore.getState();
    expect(state.errorConversationId).toBe(CONV_A);
    expect(state.errorRetry).toEqual({ kind: 'regenerate', messageId: question!.id });
  });

  it('a refusal that would happen again offers nothing to retry', async () => {
    const accepted = await useChatExecutionStore
      .getState()
      .sendMessage(CONV_A, 'hello', getDefaultModel().id);

    expect(accepted).toBe(false);
    const state = useChatExecutionStore.getState();
    expect(state.error).toEqual(expect.any(String));
    expect(state.errorConversationId).toBe(CONV_A);
    expect(state.errorRetry).toBeNull();
  });

  it("a send in another conversation neither shows nor clears the first one's error", async () => {
    useChatExecutionStore.getState().setSendError('Message could not be sent. Please try again.', {
      conversationId: CONV_A,
      retry: { kind: 'resend' },
    });
    mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_B, 'hello', visionModel);
    useChatExecutionStore.getState().clearErrorFor(CONV_B);

    const state = useChatExecutionStore.getState();
    expect(state.error).toBe('Message could not be sent. Please try again.');
    expect(state.errorConversationId).toBe(CONV_A);
    expect(state.errorRetry).toEqual({ kind: 'resend' });
  });

  it('a failure raised in another conversation replaces the first one whole', () => {
    useChatExecutionStore
      .getState()
      .setSendError('First conversation failed', { conversationId: CONV_A });

    useChatExecutionStore.getState().setPaywallError(PAYWALL, CONV_B);

    const state = useChatExecutionStore.getState();
    expect(state.errorConversationId).toBe(CONV_B);
    expect(state.error).toBeNull();
    expect(state.paywallError).toEqual(PAYWALL);
  });

  it('an error raised without a conversation goes to the conversation on screen', () => {
    useChatMessageStore.setState({ currentConversationId: CONV_B });

    useChatExecutionStore.getState().setSendError('Image request could not be sent.');

    expect(useChatExecutionStore.getState().errorConversationId).toBe(CONV_B);
  });

  it('clearing its own error leaves no owner behind', () => {
    useChatExecutionStore.getState().setSendError('Failed', { conversationId: CONV_A });

    useChatExecutionStore.getState().clearErrorFor(CONV_A);

    const state = useChatExecutionStore.getState();
    expect(state.error).toBeNull();
    expect(state.errorConversationId).toBeNull();
    expect(state.errorRetry).toBeNull();
  });
});
