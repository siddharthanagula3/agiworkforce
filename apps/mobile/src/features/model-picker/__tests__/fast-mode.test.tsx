import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  FAST_MODE_BLOCK_MESSAGES,
  WORKSPACE_FEATURES,
  getModelMetadataById,
} from '@agiworkforce/types';
import { requireCatalogModel, requireMobileCloudModel } from '@/test-utils/modelFixtures';

const mockFetchUsageSnapshot = jest.fn();
const mockApiGet = jest.fn();

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    getNumber: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
}));

jest.mock('@/services/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args) },
}));

import { SpeedControl } from '../components/SpeedControl';
import { FAST_MODE_USAGE_CREDITS_MESSAGE, fastSpeedForModel, useFastModeStore } from '../fastMode';
import { useTierStore } from '@/src/features/billing/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';

const FAST_MODEL = requireCatalogModel(
  (model) => model.provider === 'anthropic' && model.fastTier !== undefined,
  'Anthropic model with a fast tier',
);
const STANDARD_MODEL = requireMobileCloudModel(
  (model) => !getModelMetadataById(model.id)?.fastTier,
  'Mobile Cloud model without a fast tier',
);

function usage(overageEnabled: boolean) {
  return { credits: { purchased: { remaining: 0, overage_enabled: overageEnabled } } };
}

function ungovernedPolicy() {
  return { organizationId: null, governed: false, revision: 0, controls: null, code: null };
}

function governedPolicy(fastMode: boolean) {
  const featureAccess = Object.fromEntries(
    WORKSPACE_FEATURES.map((feature) => [feature, feature === 'fast_mode' ? fastMode : true]),
  );
  return {
    organizationId: 'org-1',
    governed: true,
    revision: 1,
    controls: { featureAccess },
    code: null,
  };
}

function setPlan(tier: 'free' | 'max') {
  useTierStore.setState({ tier, lastRefreshedAt: '2026-10-22T00:00:00.000Z' });
}

beforeEach(() => {
  __resetCloudAccountSessionForTests();
  activateCloudAccount('user-1');
  mockFetchUsageSnapshot.mockReset().mockResolvedValue(usage(true));
  mockApiGet.mockReset().mockResolvedValue(ungovernedPolicy());
  useFastModeStore.setState({ enabled: false, accountState: null, checking: false });
  setPlan('max');
});

describe('mobile fast mode speed control', () => {
  it('shows nothing for a model without a fast tier', () => {
    const screen = render(<SpeedControl modelId={STANDARD_MODEL.id} />);
    expect(screen.queryByTestId('model-picker-speed')).toBeNull();
  });

  it('turns fast mode on for a paid plan with usage credits on and sends it', async () => {
    const screen = render(<SpeedControl modelId={FAST_MODEL.id} />);
    await waitFor(() => expect(useFastModeStore.getState().accountState).not.toBeNull());

    const toggle = screen.getByTestId('model-picker-speed-switch');
    expect(toggle.props.disabled).toBe(false);
    expect(screen.getByTestId('model-picker-speed-helper').props.children).toContain(
      `${FAST_MODEL.fastTier?.priceMultiplier}x the usage`,
    );
    expect(fastSpeedForModel(FAST_MODEL.id)).toBeUndefined();

    act(() => fireEvent(toggle, 'valueChange', true));

    expect(useFastModeStore.getState().enabled).toBe(true);
    expect(fastSpeedForModel(FAST_MODEL.id)).toBe('fast');
    expect(fastSpeedForModel(STANDARD_MODEL.id)).toBeUndefined();
  });

  it('explains and blocks fast mode on the Free plan without asking the server', () => {
    setPlan('free');
    useFastModeStore.setState({ enabled: true });
    const screen = render(<SpeedControl modelId={FAST_MODEL.id} />);

    expect(screen.getByTestId('model-picker-speed-switch').props.disabled).toBe(true);
    expect(screen.getByTestId('model-picker-speed-switch').props.value).toBe(false);
    expect(screen.getByText(FAST_MODE_BLOCK_MESSAGES.paid_plan)).toBeTruthy();
    expect(mockFetchUsageSnapshot).not.toHaveBeenCalled();
    expect(fastSpeedForModel(FAST_MODEL.id)).toBeUndefined();
  });

  it('explains and blocks fast mode while usage credits are off', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(usage(false));
    useFastModeStore.setState({ enabled: true });
    const screen = render(<SpeedControl modelId={FAST_MODEL.id} />);

    await waitFor(() => expect(screen.getByText(FAST_MODE_USAGE_CREDITS_MESSAGE)).toBeTruthy());
    expect(screen.getByTestId('model-picker-speed-switch').props.disabled).toBe(true);
    expect(fastSpeedForModel(FAST_MODEL.id)).toBeUndefined();
  });

  it('explains and blocks fast mode when the workspace has not turned it on', async () => {
    mockApiGet.mockResolvedValue(governedPolicy(false));
    useFastModeStore.setState({ enabled: true });
    const screen = render(<SpeedControl modelId={FAST_MODEL.id} />);

    await waitFor(() => expect(screen.getByText(FAST_MODE_BLOCK_MESSAGES.workspace)).toBeTruthy());
    expect(fastSpeedForModel(FAST_MODEL.id)).toBeUndefined();
  });

  it('leaves the decision to the server when the checks cannot be read', async () => {
    mockFetchUsageSnapshot.mockRejectedValue(new Error('offline'));
    mockApiGet.mockRejectedValue(new Error('offline'));
    useFastModeStore.setState({ enabled: true });
    render(<SpeedControl modelId={FAST_MODEL.id} />);

    await waitFor(() => expect(useFastModeStore.getState().accountState).not.toBeNull());
    expect(fastSpeedForModel(FAST_MODEL.id)).toBe('fast');
  });

  it('drops another account’s checks after an account switch', async () => {
    mockFetchUsageSnapshot.mockResolvedValue(usage(false));
    useFastModeStore.setState({ enabled: true });
    render(<SpeedControl modelId={FAST_MODEL.id} />);
    await waitFor(() => expect(fastSpeedForModel(FAST_MODEL.id)).toBeUndefined());

    activateCloudAccount('user-2');

    expect(fastSpeedForModel(FAST_MODEL.id)).toBe('fast');
  });

  it('never sends fast mode before the plan is known', () => {
    useTierStore.setState({ tier: 'max', lastRefreshedAt: null });
    useFastModeStore.setState({ enabled: true });
    expect(fastSpeedForModel(FAST_MODEL.id)).toBeUndefined();
  });
});
