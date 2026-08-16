
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

let mockCurrentConversationId: string | null = null;
jest.mock('@/stores/chatStore', () => ({
  useChatStore: (selector: (s: { currentConversationId: string | null }) => unknown) =>
    selector({ currentConversationId: mockCurrentConversationId }),
}));

import { EFFORT_LABEL, getModelEffortOptions } from '@agiworkforce/types';
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

  it('opens the model picker when tapped', () => {
    useModelStore.setState({ selectedModel: effortModel!.id });

    const { onPress, getByTestId } = renderLabel();
    fireEvent.press(getByTestId('chat.composer.model'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
