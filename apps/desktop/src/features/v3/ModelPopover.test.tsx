import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useChatModelStore } from '@agiworkforce/unified-chat';
import { ModelPopover } from './ModelPopover';
import { useAppModeStore } from '../../stores/appModeStore';

function makeModel(id: string, provider = 'open_router') {
  return {
    id,
    name: id,
    provider,
    tier: 'standard' as const,
    supportsThinking: false,
    supportsVision: false,
    supportsTools: false,
    contextWindow: 128000,
    isLocal: false,
    isByok: true,
  };
}

describe('ModelPopover Local/BYOK model list at OpenRouter scale', () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: 'local' });
  });

  afterEach(() => {
    useChatModelStore.setState({ models: [] });
  });

  // Regression guard: a BYOK gateway like OpenRouter's live catalog
  // (`llm_list_openrouter_models`) can return hundreds of models. Without a
  // filter + scroll bound, the popover would render an unbounded flat list
  // of buttons that overflows off-screen with no way to find a specific model.
  it('shows a filter box and bounds list height once models exceed the small-list threshold', () => {
    const manyModels = Array.from({ length: 50 }, (_, i) => makeModel(`vendor/model-${i}`));
    useChatModelStore.setState({ models: manyModels });

    render(<ModelPopover onClose={() => {}} />);

    expect(screen.getByLabelText('Filter models')).toBeInTheDocument();
    // All 50 rows are still reachable (scroll, not truncation) before filtering.
    expect(screen.getByRole('button', { name: /vendor\/model-0/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vendor\/model-49/ })).toBeInTheDocument();
  });

  it('filters the list down to matching models as the user types', async () => {
    const user = userEvent.setup();
    const manyModels = Array.from({ length: 50 }, (_, i) => makeModel(`vendor/model-${i}`));
    useChatModelStore.setState({ models: manyModels });

    render(<ModelPopover onClose={() => {}} />);

    await user.type(screen.getByLabelText('Filter models'), 'model-7');

    expect(screen.getByRole('button', { name: /vendor\/model-7\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vendor\/model-0\b/ })).not.toBeInTheDocument();
  });

  it('does not show a filter box for a small local-only model list', () => {
    useChatModelStore.setState({
      models: [makeModel('llama3', 'ollama'), makeModel('mistral', 'ollama')],
    });

    render(<ModelPopover onClose={() => {}} />);

    expect(screen.queryByLabelText('Filter models')).not.toBeInTheDocument();
  });
});
