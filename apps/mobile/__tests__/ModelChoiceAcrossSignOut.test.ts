jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

let mockOwnerId: string | null = null;
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  ...jest.requireActual('../src/features/auth/services/cloudAccountSession'),
  captureCloudAccountEpoch: () => (mockOwnerId ? { ownerId: mockOwnerId, epoch: 1 } : null),
}));

import { Alert } from 'react-native';
import { isAutoModeModelId } from '@agiworkforce/types';
import {
  DEFAULT_LOCAL_MODEL_ID,
  canAccessCloudModelForTier,
  getDefaultCloudModelIdForTier,
} from '../src/features/model-picker/service';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MAX_ONLY_MODEL_ID = requireMobileCloudModel(
  (model) =>
    !isAutoModeModelId(model.id) &&
    canAccessCloudModelForTier(model.id, 'max') &&
    !canAccessCloudModelForTier(model.id, 'pro'),
  'Max-only Mobile Cloud model',
).id;
const PRO_CHOICE_ID = requireMobileCloudModel(
  (model) =>
    !isAutoModeModelId(model.id) &&
    canAccessCloudModelForTier(model.id, 'pro') &&
    model.id !== getDefaultCloudModelIdForTier('pro'),
  'non-default Mobile Cloud model on the Pro plan',
).id;

const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

function signInAs(ownerId: string, tier: 'free' | 'pro' | 'max') {
  mockOwnerId = ownerId;
  useWaitlistStore.setState({ cloudUnlocked: true });
  useChatAppModeStore.setState({ appMode: 'cloud' });
  useModelStore.getState().restoreNewChatModel();
  useTierStore.setState({
    tier,
    billingTier: tier,
    lastRefreshedAt: new Date().toISOString(),
  });
}

function signOut() {
  useChatAppModeStore.setState({ appMode: 'local' });
  mockOwnerId = null;
  useTierStore.getState().clearAccountEntitlements();
  useWaitlistStore.setState({ cloudUnlocked: false });
}

function chooseInCloud(modelId: string) {
  useModelStore.getState().setModel(modelId);
  expect(useModelStore.getState().selectedModel).toBe(modelId);
}

beforeEach(() => {
  mockAlert.mockClear();
  mockOwnerId = null;
  useTierStore.getState().clearAccountEntitlements();
  useWaitlistStore.setState({ cloudUnlocked: false });
  useChatAppModeStore.setState({ appMode: 'local' });
  useModelStore.setState({
    selectedModel: DEFAULT_LOCAL_MODEL_ID,
    selectedProvider: 'local',
    newChatModels: { local: null, cloud: null },
    newChatModelOwner: null,
    conversationModelShown: false,
  });
});

describe('the Cloud model choice across sign-out', () => {
  it('is kept, with no plan-change alert, when the person signs out', () => {
    signInAs('person-a', 'max');
    chooseInCloud(MAX_ONLY_MODEL_ID);

    signOut();

    expect(mockAlert).not.toHaveBeenCalled();
    expect(useModelStore.getState().newChatModels.cloud).toBe(MAX_ONLY_MODEL_ID);
  });

  it('comes back for the same account once its plan is confirmed', () => {
    signInAs('person-a', 'max');
    chooseInCloud(MAX_ONLY_MODEL_ID);
    signOut();

    signInAs('person-a', 'max');

    expect(useModelStore.getState().selectedModel).toBe(MAX_ONLY_MODEL_ID);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('falls back to the plan default when that account can no longer use it', () => {
    signInAs('person-a', 'max');
    chooseInCloud(MAX_ONLY_MODEL_ID);
    signOut();

    signInAs('person-a', 'pro');

    expect(useModelStore.getState().selectedModel).toBe(getDefaultCloudModelIdForTier('pro'));
  });

  it('is not handed to another account on this phone, even one whose plan includes it', () => {
    signInAs('person-a', 'pro');
    chooseInCloud(PRO_CHOICE_ID);
    signOut();

    signInAs('person-b', 'pro');

    expect(useModelStore.getState().selectedModel).toBe(getDefaultCloudModelIdForTier('pro'));
  });
});
