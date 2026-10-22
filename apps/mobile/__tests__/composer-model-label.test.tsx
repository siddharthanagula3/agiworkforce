import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

let mockCurrentConversationId: string | null = null;
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: { currentConversationId: string | null }) => unknown) =>
    selector({ currentConversationId: mockCurrentConversationId }),
}));

const mockFetchUsageSnapshot = jest.fn();
jest.mock('@/services/usage', () => ({
  fetchUsageSnapshot: (...args: unknown[]) => mockFetchUsageSnapshot(...args),
}));
jest.mock('@/services/api', () => ({
  api: {
    get: jest.fn().mockResolvedValue({
      organizationId: null,
      governed: false,
      revision: 0,
      controls: null,
      code: null,
    }),
  },
}));

import { act, waitFor } from '@testing-library/react-native';
import { EFFORT_LABEL, getModelEffortOptions, getModelMetadataById } from '@agiworkforce/types';
import { requireCatalogModel } from '@/test-utils/modelFixtures';
import { useFastModeStore } from '@/src/features/model-picker/fastMode';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { ModelSelectorButton } from '@/src/features/chat/components/ModelSelectorButton';
import {
  getModelListForCloudAccess,
  getShortDisplayName,
} from '@/src/features/model-picker/service';
import { useModelStore } from '@/src/features/model-picker/store';
import { useAgentControlStore, type PickerEffort } from '@/stores/agentControlStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTierStore } from '@/src/features/billing/store';

const tier = useTierStore.getState().tier;
const catalog = getModelListForCloudAccess(true, tier);

function isNamed(id: string): boolean {
  return getShortDisplayName(id, tier) !== id;
}

const effortModel = catalog.find(
  (model) => isNamed(model.id) && getModelEffortOptions(model.id).length > 1,
);
const plainModel = catalog.find(
  (model) => isNamed(model.id) && getModelEffortOptions(model.id).length === 0,
);

const fastModel = requireCatalogModel(
  (model) => model.provider === 'anthropic' && model.fastTier !== undefined,
  'Anthropic model with a fast tier',
);

function setPlan(planTier: 'free' | 'max') {
  useTierStore.setState({ tier: planTier, lastRefreshedAt: '2026-10-22T00:00:00.000Z' });
}

function renderLabel(onPress = jest.fn()) {
  return { onPress, ...render(<ModelSelectorButton onPress={onPress} />) };
}

describe('composer model label', () => {
  beforeEach(() => {
    mockCurrentConversationId = null;
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
    useSettingsStore.setState({ hapticsEnabled: false });
  });

  it('has catalog models to exercise both effort shapes', () => {
    expect(effortModel).toBeDefined();
    expect(plainModel).toBeDefined();
  });

  it('renders the display name and never the wire id', () => {
    useModelStore.setState({ selectedModel: effortModel!.id });

    const { getByText, queryByText, getByTestId } = renderLabel();

    expect(getByText(getShortDisplayName(effortModel!.id, tier))).toBeTruthy();
    expect(queryByText(effortModel!.id)).toBeNull();
    expect(getByTestId('chat.composer.model').props.accessibilityLabel).toContain(
      `Model: ${getShortDisplayName(effortModel!.id, tier)}`,
    );
  });

  it('suffixes the effort the next turn will carry', () => {
    const options = getModelEffortOptions(effortModel!.id);
    const chosen = options[options.length - 1] as PickerEffort;
    useModelStore.setState({ selectedModel: effortModel!.id });
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: chosen });

    const { getByText, getByTestId } = renderLabel();

    expect(getByText(EFFORT_LABEL[chosen])).toBeTruthy();
    expect(getByTestId('chat.composer.model').props.accessibilityLabel).toContain(
      `reasoning effort ${EFFORT_LABEL[chosen]}`,
    );
  });

  it("prefers the open conversation's effort override over the project default", () => {
    const options = getModelEffortOptions(effortModel!.id);
    const projectDefault = options[0] as PickerEffort;
    const override = options[options.length - 1] as PickerEffort;
    useModelStore.setState({ selectedModel: effortModel!.id });
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: projectDefault });
    useAgentControlStore.getState().setEffort('conversation-1', override);
    mockCurrentConversationId = 'conversation-1';

    const { getByText, queryByText } = renderLabel();

    expect(getByText(EFFORT_LABEL[override])).toBeTruthy();
    expect(queryByText(EFFORT_LABEL[projectDefault])).toBeNull();
  });

  it('renders no effort suffix for a model with no effort axis', () => {
    useModelStore.setState({ selectedModel: plainModel!.id });
    useAgentControlStore.getState().setProjectDefault('__default__', { effort: 'high' });

    const { getByText, queryByText } = renderLabel();

    expect(getByText(getShortDisplayName(plainModel!.id, tier))).toBeTruthy();
    expect(queryByText(EFFORT_LABEL.high)).toBeNull();
  });

  describe('fast mode token', () => {
    beforeEach(() => {
      __resetCloudAccountSessionForTests();
      activateCloudAccount('user-1');
      mockFetchUsageSnapshot
        .mockReset()
        .mockResolvedValue({ credits: { purchased: { remaining: 0, overage_enabled: true } } });
      useFastModeStore.setState({ enabled: false, accountState: null, checking: false });
      setPlan('max');
      useModelStore.setState({ selectedModel: fastModel.id });
    });

    it('shows Fast once fast mode is on and allowed for the selected model', async () => {
      useFastModeStore.setState({ enabled: true });

      const { getByText, getByTestId } = renderLabel();

      await waitFor(() => expect(getByText('Fast')).toBeTruthy());
      expect(getByTestId('chat.composer.model').props.accessibilityLabel).toContain('fast mode on');
    });

    it('shows no Fast token while fast mode is off', async () => {
      const { queryByText, getByTestId } = renderLabel();

      await act(async () => {
        await Promise.resolve();
      });
      expect(queryByText('Fast')).toBeNull();
      expect(getByTestId('chat.composer.model').props.accessibilityLabel).not.toContain('fast');
    });

    it('shows no Fast token on a plan that cannot use it', () => {
      setPlan('free');
      useFastModeStore.setState({ enabled: true });

      const { queryByText } = renderLabel();

      expect(queryByText('Fast')).toBeNull();
    });

    it('shows no Fast token for a model without a fast tier', () => {
      const standard = catalog.find(
        (model) => isNamed(model.id) && !getModelMetadataById(model.id)?.fastTier,
      );
      useFastModeStore.setState({ enabled: true });
      useModelStore.setState({ selectedModel: standard!.id });

      const { queryByText } = renderLabel();

      expect(queryByText('Fast')).toBeNull();
    });

    it('shows no Fast token while usage credits are off', async () => {
      mockFetchUsageSnapshot.mockResolvedValue({
        credits: { purchased: { remaining: 0, overage_enabled: false } },
      });
      useFastModeStore.setState({ enabled: true });

      const { queryByText } = renderLabel();

      await waitFor(() => expect(useFastModeStore.getState().accountState).not.toBeNull());
      expect(queryByText('Fast')).toBeNull();
    });
  });

  it('opens the model picker when tapped', () => {
    useModelStore.setState({ selectedModel: effortModel!.id });

    const { onPress, getByTestId } = renderLabel();
    fireEvent.press(getByTestId('chat.composer.model'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
