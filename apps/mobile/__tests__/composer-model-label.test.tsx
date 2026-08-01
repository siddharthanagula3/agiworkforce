/**
 * PAR-M19 — the model label on the composer's control row.
 *
 * Two failures this pins, both of which shipped before:
 *
 * 1. The label must render the CATALOG DISPLAY NAME. `model-picker/service`
 *    ends its lookup with `?? id`, so a selection the catalog no longer knows
 *    renders a raw wire id — which is what several surfaces were caught doing.
 *
 * 2. The muted effort suffix must be the effort the next turn will ACTUALLY
 *    carry. It is resolved through the same helpers as the send path
 *    (`getModelEffortOptions` + `resolveTurnEffort`, chatExecutionStore), so a
 *    model with no effort axis — or a stale effort it does not support, which
 *    the send path silently drops — renders no suffix rather than advertising a
 *    setting that will never be applied.
 *
 * Deliberately runs against the real catalog and the real stores: model ids are
 * derived from the catalog rather than hardcoded, so this keeps passing across
 * model renames and fails when the effort metadata really changes.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// The only mock: which conversation is open. Everything else is real.
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

/** A model whose display name is a real name, not the id fallback. */
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
    // A guard, not a formality: if the catalog stops carrying either shape the
    // assertions below would silently stop testing anything.
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
    // A stale effort left over from a previous model: the send path drops it,
    // so the label must not claim it either.
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
