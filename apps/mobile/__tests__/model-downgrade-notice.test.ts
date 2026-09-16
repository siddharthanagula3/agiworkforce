jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { Alert } from 'react-native';
import {
  canAccessCloudModelForTier,
  getDefaultCloudModelIdForTier,
  getDisplayName,
} from '../src/features/model-picker/service';
import { useModelStore } from '../src/features/model-picker/store';
import { useTierStore } from '../src/features/billing/store';
import { useWaitlistStore } from '../src/features/waitlist/store';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const MAX_ONLY_MODEL_ID = requireMobileCloudModel(
  (model) =>
    canAccessCloudModelForTier(model.id, 'max') && !canAccessCloudModelForTier(model.id, 'pro'),
  'Max-only Mobile Cloud model',
).id;

const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

function alertBody(): string {
  const call = mockAlert.mock.calls[0] as [string, string] | undefined;
  return call?.[1] ?? '';
}

beforeEach(() => {
  mockAlert.mockClear();
  useWaitlistStore.setState({ cloudUnlocked: true });
  useTierStore.setState({ tier: 'max', billingTier: 'max' });
  useModelStore.setState({ selectedModel: MAX_ONLY_MODEL_ID, selectedProvider: 'cloud_managed' });
});

describe('MOBILE-072, a plan downgrade never swaps the model in silence', () => {
  it('tells the user which model it left and which one it landed on', () => {
    useTierStore.setState({ tier: 'pro', billingTier: 'pro' });

    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(alertBody()).toContain(getDisplayName(MAX_ONLY_MODEL_ID));
    expect(alertBody()).toContain(getDisplayName(useModelStore.getState().selectedModel));
    expect(useModelStore.getState().selectedModel).not.toBe(MAX_ONLY_MODEL_ID);
  });

  it('stays quiet when the plan changes but the model is still included', () => {
    const proModel = getDefaultCloudModelIdForTier('pro');
    if (!proModel) throw new Error('the Pro tier must resolve a default cloud model');
    useModelStore.setState({ selectedModel: proModel, selectedProvider: 'cloud_managed' });

    useTierStore.setState({ tier: 'pro', billingTier: 'pro' });

    expect(mockAlert).not.toHaveBeenCalled();
    expect(useModelStore.getState().selectedModel).toBe(proModel);
  });

  it('says nothing about a local model, which no plan can take away', () => {
    useModelStore.setState({ selectedModel: 'not-a-cloud-model', selectedProvider: 'local' });

    useTierStore.setState({ tier: 'free', billingTier: 'free' });

    expect(mockAlert).not.toHaveBeenCalled();
  });
});
