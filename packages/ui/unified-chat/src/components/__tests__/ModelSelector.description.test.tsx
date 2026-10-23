import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { getProviderDefaultModel, isAutoModeModelId, modelsById } from '@agiworkforce/types';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelSelector } from '../ModelSelector';
import { useChatStore } from '../../stores/chatStore';
import { CLOUD_FALLBACK_MODELS, useModelStore } from '../../stores/modelStore';
import { createChatModelInfo } from '../../lib/modelInfo';
import type { ChatExecutionMode } from '@agiworkforce/types';
import type { ModelInfo } from '../../lib/types';

const catalogModelId = getProviderDefaultModel('openai');
if (!catalogModelId) throw new Error('The catalog must expose a default OpenAI text model');
const catalogDescription = modelsById[catalogModelId]?.description;
if (!catalogDescription) throw new Error(`${catalogModelId} must carry a catalog description`);
const catalogModel = createChatModelInfo({
  id: catalogModelId,
  name: 'stale test host label',
  provider: 'openai',
  isLocal: false,
  isByok: true,
});

const uncataloguedModel: ModelInfo = {
  id: 'fixture-direct-model',
  name: 'Direct Provider Fixture',
  provider: 'openai',
  tier: 'standard',
  supportsThinking: false,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 128_000,
  isLocal: false,
  isByok: true,
};

function seed(executionMode: ChatExecutionMode, models: ModelInfo[], selectedModelId: string) {
  window.localStorage.setItem(
    'app-mode-store',
    JSON.stringify({ state: { mode: executionMode === 'cloud_managed' ? 'cloud' : 'local' } }),
  );
  useModelStore.setState({
    models,
    selectedModelId,
    modelCatalogStatus: 'ready',
    modelCatalogError: null,
    recentModelIds: [],
    lastRoutingDecision: null,
  });
  useChatStore.setState({
    activeConversationId: 'conversation-1',
    conversations: [
      {
        id: 'conversation-1',
        title: 'Picker copy',
        createdAt: '2026-10-22T00:00:00.000Z',
        updatedAt: '2026-10-22T00:00:00.000Z',
        pinned: false,
        executionMode,
        model: selectedModelId,
      },
    ],
  });
  render(<ModelSelector />);
  fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('model picker row copy', () => {
  it('shows the catalog description under a catalogued model', () => {
    seed('byok', [catalogModel, uncataloguedModel], catalogModel.id);

    const row = screen.getByRole('button', {
      name: (accessibleName) => accessibleName.includes(catalogModel.name),
    });
    const descriptions = screen.getAllByTestId('model-description');
    expect(descriptions).toHaveLength(1);
    expect(descriptions[0]?.textContent).toBe(catalogDescription);
    expect(row.contains(descriptions[0] ?? null)).toBe(true);
  });

  it('marks the automatic row as the default', () => {
    const autoModels = CLOUD_FALLBACK_MODELS.filter((model) => isAutoModeModelId(model.id));
    expect(autoModels.length).toBeGreaterThan(0);
    seed('cloud_managed', autoModels, autoModels[0]!.id);

    const badges = screen.getAllByTestId('model-default-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]?.textContent).toBe('Default');
    const autoRow = screen.getByRole('button', {
      name: (accessibleName) => accessibleName.includes('Best (auto)'),
    });
    expect(autoRow.contains(badges[0] ?? null)).toBe(true);
  });
});
