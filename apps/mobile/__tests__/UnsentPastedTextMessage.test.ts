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
import { pastedTextFileName } from '@agiworkforce/utils/composer-paste';
import type { Attachment } from '../src/features/chat/components/AttachmentPreview';
import { streamChat } from '../services/streaming';
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

const CONV = '0190a000-0000-7000-8000-0000000000c1';
const ENTITLED_TIER = 'max';

const visionModel = requireMobileCloudModel(
  (model) => getModelMetadataById(model.id)?.capabilities.vision === true,
  'Mobile Cloud model that reads images',
).id;

const pasted: Attachment = {
  id: 'pasted-1',
  uri: 'file:///cache/pasted-text-1.txt',
  mimeType: 'text/plain',
  fileName: pastedTextFileName(1),
};

const photo: Attachment = {
  id: 'photo-1',
  uri: 'file:///cache/photo-1.jpg',
  mimeType: 'image/jpeg',
  fileName: 'IMG_0003.jpg',
};

function agreeToUploads() {
  jest.spyOn(Alert, 'alert').mockImplementation((title, _message, buttons) => {
    if (title !== 'Send files to AGI Cloud?') return;
    (buttons as AlertButton[] | undefined)
      ?.find((button) => button.text === 'Upload & Send')
      ?.onPress?.();
  });
}

async function send(attachments: Attachment[]): Promise<string | null> {
  agreeToUploads();
  const accepted = await useChatExecutionStore
    .getState()
    .sendMessage(CONV, 'summarise this', visionModel, attachments);
  expect(accepted).toBe(false);
  expect(streamChat).not.toHaveBeenCalled();
  return useChatExecutionStore.getState().error;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCloudSendConsent.mockReset().mockResolvedValue(undefined);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('unsent-pasted-text-user');
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
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONV,
    title: 'Notes',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model: visionModel,
    executionMode: 'cloud',
  });
});

afterEach(() => {
  clearCloudExecutionState();
});

describe('the message for files that did not upload before a send', () => {
  it('sends a person back to the message, not to a Retry control, when only pasted text failed', async () => {
    mockUploadWithRetry.mockResolvedValue(null);

    const error = await send([pasted]);

    expect(error).toBe(
      'Your pasted text did not finish uploading, so nothing was sent. Your message is still here. Try sending again.',
    );
    expect(error).not.toMatch(/Retry/);
  });

  it('says the same when the pasted text upload throws', async () => {
    mockUploadWithRetry.mockRejectedValue(new Error('network down'));

    const error = await send([pasted]);

    expect(error).not.toMatch(/Retry/);
    expect(error).toMatch(/^Your pasted text did not finish uploading/);
  });

  it('keeps Retry for a picked file and mentions the pasted text once when both failed', async () => {
    mockUploadWithRetry.mockResolvedValue(null);

    const error = await send([photo, pasted]);

    expect(error).toBe(
      '“IMG_0003.jpg” did not finish uploading, so nothing was sent. Tap Retry on the file, or remove it and send again. Your pasted text is still in your message.',
    );
    expect(error).not.toContain(pastedTextFileName(1));
  });

  it('keeps Retry when only a picked file failed', async () => {
    mockUploadWithRetry.mockResolvedValue(null);

    const error = await send([photo]);

    expect(error).toBe(
      '“IMG_0003.jpg” did not finish uploading, so nothing was sent. Tap Retry on the file, or remove it and send again.',
    );
  });
});
