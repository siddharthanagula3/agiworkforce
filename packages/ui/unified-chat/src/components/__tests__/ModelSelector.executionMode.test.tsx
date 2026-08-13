import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getProviderDefaultModel } from '@agiworkforce/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSelector } from '../ModelSelector';
import { useChatStore } from '../../stores/chatStore';
import { CLOUD_FALLBACK_MODELS, useModelStore } from '../../stores/modelStore';
import { HostBridgeContext } from '../../lib/hostBridge';
import { createChatModelInfo } from '../../lib/modelInfo';
import { requireCatalogModel } from '../../test/modelCatalogFixtures';
import type { ChatExecutionMode } from '@agiworkforce/types';
import type { ModelInfo } from '../../lib/types';

const localModel: ModelInfo = {
  id: 'fixture-local-model',
  name: 'Local Model Fixture',
  provider: 'ollama',
  tier: 'standard',
  supportsThinking: false,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 128_000,
  isLocal: true,
  isByok: false,
  metadataSource: 'runtime',
};

const byokModel: ModelInfo = {
  id: 'fixture-direct-model',
  name: 'Direct Provider Fixture',
  provider: 'openai',
  tier: 'standard',
  supportsThinking: true,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 128_000,
  isLocal: false,
  isByok: true,
};

const switchableHighDefaultMetadata = requireCatalogModel(
  (model) =>
    model.reasoning?.canDisableThinking === true && model.reasoning.defaultEffort === 'high',
  'a switchable reasoning model whose default effort is high',
);
const switchableHighDefaultModel = createChatModelInfo({
  id: switchableHighDefaultMetadata.id,
  name: 'stale test host label',
  provider: switchableHighDefaultMetadata.provider,
  isLocal: false,
  isByok: true,
});

const mandatoryReasoningMetadata = requireCatalogModel(
  (model) =>
    model.reasoning?.canDisableThinking === false && model.reasoning.defaultEffort === 'high',
  'a mandatory reasoning model whose default effort is high',
);
const mandatoryReasoningModel = createChatModelInfo({
  id: mandatoryReasoningMetadata.id,
  name: 'stale test host label',
  provider: mandatoryReasoningMetadata.provider,
  isLocal: false,
  isByok: true,
});

const currentOpenAIModelId = getProviderDefaultModel('openai');
if (!currentOpenAIModelId) throw new Error('The catalog must expose a default OpenAI text model');
const currentOpenAIModel = createChatModelInfo({
  id: currentOpenAIModelId,
  name: 'stale test host label',
  provider: 'openai',
  isLocal: false,
  isByok: true,
});

const managedModel: ModelInfo = {
  id: 'auto-balanced',
  name: 'Auto Balanced',
  provider: 'managed_cloud',
  tier: 'standard',
  supportsThinking: true,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 128_000,
  isLocal: false,
  isByok: false,
};

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

/**
 * zustand `persist` lazy-writes, so a desktop session that never touched a
 * mode setter leaves no `app-mode-store` entry — the state the selector must
 * still read as Local.
 */
function seedDesktopShellWithoutPersistedMode() {
  window.localStorage.removeItem('app-mode-store');
  (window as TauriWindow).__TAURI_INTERNALS__ = {};
  useChatStore.setState({ activeConversationId: null, conversations: [] });
}

function seedConversation(executionMode: ChatExecutionMode, model?: string) {
  useChatStore.setState({
    activeConversationId: 'conversation-1',
    conversations: [
      {
        id: 'conversation-1',
        title: 'Trust boundary test',
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
        pinned: false,
        executionMode,
        model,
      },
    ],
  });
}

describe('ModelSelector execution-boundary admission', () => {
  beforeEach(() => {
    window.localStorage.setItem('app-mode-store', JSON.stringify({ state: { mode: 'local' } }));
    useModelStore.setState({
      models: [localModel, byokModel, managedModel],
      selectedModelId: localModel.id,
      modelCatalogStatus: 'ready',
      modelCatalogError: null,
      recentModelIds: [],
      lastRoutingDecision: null,
    });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    delete (window as TauriWindow).__TAURI_INTERNALS__;
  });

  it('shows only local models for a local-only conversation', () => {
    seedConversation('local_only');
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getAllByText(localModel.name).length).toBeGreaterThan(0);
    expect(screen.queryByText('Direct Provider Fixture')).toBeNull();
    expect(screen.queryByText('Auto Balanced')).toBeNull();
  });

  it('shows only runtime-reported capabilities for an uncatalogued local model', () => {
    seedConversation('local_only');
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    const row = screen.getByRole('button', { name: /Local Model Fixture/i });
    expect(row.textContent).toContain('Vision');
    expect(row.textContent).toContain('Function tools');
    expect(row.textContent).not.toContain('Balanced');
    expect(row.textContent).not.toContain('standard');
    expect(row.textContent).not.toContain('premium');
  });

  it('stays on the local catalog in the desktop shell with no persisted mode', () => {
    seedDesktopShellWithoutPersistedMode();
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getByText('Local')).toBeTruthy();
    expect(screen.getAllByText(localModel.name).length).toBeGreaterThan(0);
    expect(screen.queryByText('Direct Provider Fixture')).toBeNull();
    expect(screen.queryByText('Auto Balanced')).toBeNull();
  });

  it('never substitutes the cloud fallback catalog for an empty local catalog', () => {
    seedDesktopShellWithoutPersistedMode();
    useModelStore.setState({ models: [], selectedModelId: '' });
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getByText('No local models detected')).toBeTruthy();
    for (const fallback of CLOUD_FALLBACK_MODELS) {
      expect(screen.queryByText(fallback.name)).toBeNull();
    }
  });

  it('shows an honest discovery state instead of a final empty diagnosis while loading', () => {
    seedDesktopShellWithoutPersistedMode();
    useModelStore.setState({
      models: [],
      selectedModelId: '',
      modelCatalogStatus: 'loading',
      modelCatalogError: null,
    });
    render(<ModelSelector onSettingsClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Select model' }).textContent).toContain(
      'Detecting models',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getByRole('status').textContent).toContain('Looking for available local models');
    expect(screen.queryByText('No local models detected')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set up a local model' })).toBeNull();
  });

  it('keeps the last verified Local selection stable during a same-boundary refresh', () => {
    seedConversation('local_only', localModel.id);
    useModelStore.setState({
      models: [localModel],
      selectedModelId: localModel.id,
      modelCatalogStatus: 'loading',
      modelCatalogError: null,
    });
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getByTestId('model-catalog-refreshing')).toBeTruthy();
    expect(screen.getAllByText(localModel.name).length).toBeGreaterThan(0);
    expect(useModelStore.getState().selectedModelId).toBe(localModel.id);
  });

  it('routes the explicit local setup action through the host settings callback', () => {
    const onSettingsClick = vi.fn();
    seedDesktopShellWithoutPersistedMode();
    useModelStore.setState({ models: [], selectedModelId: '' });
    render(<ModelSelector onSettingsClick={onSettingsClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up a local model' }));

    expect(onSettingsClick).toHaveBeenCalledOnce();
  });

  it('shows only direct-provider models for a BYOK conversation', () => {
    seedConversation('byok');
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getAllByText('Direct Provider Fixture').length).toBeGreaterThan(0);
    expect(screen.queryByText(localModel.name)).toBeNull();
    expect(screen.queryByText('Auto Balanced')).toBeNull();
  });

  it('restores the conversation model when switching into a BYOK conversation', async () => {
    seedConversation('byok', byokModel.id);
    render(<ModelSelector />);

    await waitFor(() => {
      expect(useModelStore.getState().selectedModelId).toBe(byokModel.id);
    });
  });

  it('clears an inadmissible selection when the active boundary has no models', async () => {
    useModelStore.setState({ models: [byokModel], selectedModelId: byokModel.id });
    seedConversation('local_only');
    render(<ModelSelector />);

    await waitFor(() => {
      expect(useModelStore.getState().selectedModelId).toBe('');
    });
  });

  it('does not silently choose the first reachable local model', async () => {
    useModelStore.setState({ models: [localModel], selectedModelId: '' });
    seedConversation('local_only');
    render(<ModelSelector />);

    await waitFor(() => {
      expect(useModelStore.getState().selectedModelId).toBe('');
    });
    expect(screen.getByRole('button', { name: 'Select model' }).textContent).toContain(
      'Select model',
    );
  });

  it('persists a manual model choice through the host conversation seam', async () => {
    const setConversationModel = vi.fn();
    seedConversation('byok');
    useModelStore.setState({ selectedModelId: byokModel.id });
    render(
      <HostBridgeContext.Provider
        value={
          {
            getSnapshot: () => ({ activeConversationId: 'conversation-1', conversations: [] }),
            setConversationModel,
          } as never
        }
      >
        <ModelSelector />
      </HostBridgeContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('button', { name: /Direct Provider Fixture/i }));

    await waitFor(() => {
      expect(setConversationModel).toHaveBeenCalledWith('conversation-1', byokModel.id);
    });
  });

  it('shows but never auto-selects or permits a non-live registry model', async () => {
    const comingSoonModel: ModelInfo = {
      ...managedModel,
      id: 'fixture-future-preview-model',
      name: 'Future Preview Model Fixture',
      provider: 'openai',
      availability: 'coming_soon',
    };
    window.localStorage.setItem('app-mode-store', JSON.stringify({ state: { mode: 'cloud' } }));
    useModelStore.setState({
      models: [comingSoonModel, managedModel],
      selectedModelId: comingSoonModel.id,
    });
    seedConversation('cloud_managed', comingSoonModel.id);
    render(<ModelSelector />);

    await waitFor(() => {
      expect(useModelStore.getState().selectedModelId).toBe(managedModel.id);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    expect(
      screen
        .getByRole('button', { name: /Future Preview Model Fixture/i })
        .hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('shows the current catalog OpenAI model as live and selectable', () => {
    useModelStore.setState({
      models: [currentOpenAIModel],
      selectedModelId: currentOpenAIModel.id,
    });
    seedConversation('byok', currentOpenAIModel.id);
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    const row = screen.getByRole('button', {
      name: (accessibleName) => accessibleName.includes(currentOpenAIModel.name),
    });
    expect(row.hasAttribute('disabled')).toBe(false);
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('labels an unknown dynamic-model context window honestly', () => {
    const unknownByokModel: ModelInfo = {
      ...byokModel,
      id: 'fixture-private-gateway-model',
      name: 'Custom Model Fixture',
      contextWindow: 0,
      metadataSource: 'unknown',
    };
    useModelStore.setState({ models: [unknownByokModel], selectedModelId: unknownByokModel.id });
    seedConversation('byok', unknownByokModel.id);
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByText('Unknown ctx')).toBeTruthy();
    expect(screen.getByText('Capabilities unverified')).toBeTruthy();
  });

  it('does not render a dead thinking toggle when the host has no effort handler', () => {
    seedConversation('byok', byokModel.id);
    useModelStore.setState({ selectedModelId: byokModel.id });
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.queryByRole('button', { name: 'Enable thinking mode' })).toBeNull();
  });

  it('enables a current model at its catalog default effort', () => {
    const onEffortChange = vi.fn();
    seedConversation('byok', switchableHighDefaultModel.id);
    useModelStore.setState({
      models: [switchableHighDefaultModel],
      selectedModelId: switchableHighDefaultModel.id,
    });
    render(<ModelSelector effort={null} onEffortChange={onEffortChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable thinking mode' }));

    expect(onEffortChange).toHaveBeenCalledWith('high');
  });

  // The current catalog has no model without an effort ladder, so there is no
  // entry that can demonstrate the hidden-control state. Restore the test when
  // that capability shape exists again.

  it('represents mandatory catalog reasoning without an off toggle', async () => {
    const onEffortChange = vi.fn();
    seedConversation('byok', mandatoryReasoningModel.id);
    useModelStore.setState({
      models: [mandatoryReasoningModel],
      selectedModelId: mandatoryReasoningModel.id,
    });
    render(<ModelSelector effort={null} onEffortChange={onEffortChange} />);

    await waitFor(() => expect(onEffortChange).toHaveBeenCalledWith('high'));
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.queryByRole('button', { name: /thinking mode/i })).toBeNull();
    expect(screen.getByText('always')).toBeTruthy();
  });
});
