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

import { Alert } from 'react-native';
import { getDefaultModel } from '@agiworkforce/local-llm';
import { CloudProviderConsentDeclinedError } from '../services/llmGate';
import { managedCloudChat } from '../services/managedCloudChat';
import { streamChat } from '../services/streaming';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
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

const CLOUD_CONV_ID = '0190a000-0000-7000-8000-0000000000e1';
const LOCAL_CONV_ID = 'local-consent-conversation';
const ENTITLED_TIER = 'max';

beforeEach(() => {
  jest.clearAllMocks();
  mockEnsureCloudSendConsent.mockReset().mockResolvedValue(undefined);
  __resetCloudAccountSessionForTests();
  activateCloudAccount('cloud-consent-test-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatExecutionStore.setState({ error: null, paywallError: null, providerConsentError: null });
  useTierStore.setState({ tier: ENTITLED_TIER, billingTier: ENTITLED_TIER });
});

function seedCloudConversation(model: string) {
  useChatCloudMessageStore.getState().addCloudConversation({
    id: CLOUD_CONV_ID,
    title: 'Cloud Chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: 0,
    pinned: false,
    model,
    executionMode: 'cloud',
  });
}

describe('Cloud provider consent at send time', () => {
  it('Not now stops the send before the message is saved to AGI Cloud', async () => {
    const model = requireMobileCloudModel().id;
    seedCloudConversation(model);
    mockEnsureCloudSendConsent.mockRejectedValueOnce(new CloudProviderConsentDeclinedError());
    const saveMessage = jest.spyOn(managedCloudChat, 'saveMessage');
    const createConversation = jest.spyOn(managedCloudChat, 'createConversation');
    const getConversation = jest.spyOn(managedCloudChat, 'getConversation');

    const accepted = await useChatExecutionStore
      .getState()
      .sendMessage(CLOUD_CONV_ID, 'keep this in the composer', model);

    expect(accepted).toBe(false);
    expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1);
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(saveMessage).not.toHaveBeenCalled();
    expect(createConversation).not.toHaveBeenCalled();
    expect(getConversation).not.toHaveBeenCalled();
    expect(useChatCloudMessageStore.getState().messages[CLOUD_CONV_ID] ?? []).toEqual([]);
    expect(useChatExecutionStore.getState().error).toBeNull();
  });

  it('asks before a Cloud send and continues once consent is given', async () => {
    const model = requireMobileCloudModel().id;
    seedCloudConversation(model);
    mockStreamChat.mockResolvedValue(undefined);

    await useChatExecutionStore.getState().sendMessage(CLOUD_CONV_ID, 'hello', model);

    expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1);
    expect(mockEnsureCloudSendConsent.mock.invocationCallOrder[0]).toBeLessThan(
      mockStreamChat.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('never asks in Local Mode', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const localModel = getDefaultModel().id;
    useChatMessageStore.setState({
      conversations: [
        {
          id: LOCAL_CONV_ID,
          title: 'Local Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          pinned: false,
          model: localModel,
          executionMode: 'local',
        },
      ],
      messages: {},
    });

    await useChatExecutionStore.getState().sendMessage(LOCAL_CONV_ID, 'hello', localModel);

    expect(mockEnsureCloudSendConsent).not.toHaveBeenCalled();
    expect(mockStreamChat).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalledWith(
      'Share with AI providers?',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });
});
