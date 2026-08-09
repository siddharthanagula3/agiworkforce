import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelSelector } from '../ModelSelector';
import { useChatStore } from '../../stores/chatStore';
import { CLOUD_FALLBACK_MODELS, useModelStore } from '../../stores/modelStore';
import { HostBridgeContext } from '../../lib/hostBridge';
import type { ChatExecutionMode } from '@agiworkforce/types';
import type { ModelInfo } from '../../lib/types';

const localModel: ModelInfo = {
  id: 'llama-local',
  name: 'Llama Local',
  provider: 'ollama',
  tier: 'standard',
  supportsThinking: false,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 128_000,
  isLocal: true,
  isByok: false,
};

const byokModel: ModelInfo = {
  id: 'gpt-direct',
  name: 'GPT Direct',
  provider: 'openai',
  tier: 'standard',
  supportsThinking: true,
  supportsVision: true,
  supportsTools: true,
  contextWindow: 128_000,
  isLocal: false,
  isByok: true,
};

const sonnetModel: ModelInfo = {
  ...byokModel,
  id: 'claude-sonnet-5',
  name: 'Claude Sonnet 5',
  provider: 'anthropic',
};

const fableModel: ModelInfo = {
  ...byokModel,
  id: 'claude-fable-5',
  name: 'Claude Fable 5',
  provider: 'anthropic',
};

const solModel: ModelInfo = {
  ...byokModel,
  id: 'gpt-5.6-sol',
  name: 'GPT-5.6 Sol',
  provider: 'openai',
};

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

    expect(screen.getAllByText('Llama Local').length).toBeGreaterThan(0);
    expect(screen.queryByText('GPT Direct')).toBeNull();
    expect(screen.queryByText('Auto Balanced')).toBeNull();
  });

  it('stays on the local catalog in the desktop shell with no persisted mode', () => {
    seedDesktopShellWithoutPersistedMode();
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getByText('Local')).toBeTruthy();
    expect(screen.getAllByText('Llama Local').length).toBeGreaterThan(0);
    expect(screen.queryByText('GPT Direct')).toBeNull();
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

  it('shows only direct-provider models for a BYOK conversation', () => {
    seedConversation('byok');
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.getAllByText('GPT Direct').length).toBeGreaterThan(0);
    expect(screen.queryByText('Llama Local')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /GPT Direct/i }));

    await waitFor(() => {
      expect(setConversationModel).toHaveBeenCalledWith('conversation-1', byokModel.id);
    });
  });

  it('shows but never auto-selects or permits a non-live registry model', async () => {
    const comingSoonModel: ModelInfo = {
      ...managedModel,
      id: 'future-preview-model',
      name: 'Future Preview Model',
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
      screen.getByRole('button', { name: /Future Preview Model/i }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('Coming soon')).toBeTruthy();
  });

  it('shows GPT-5.6 Sol as a live selectable current model', () => {
    useModelStore.setState({ models: [solModel], selectedModelId: solModel.id });
    seedConversation('byok', solModel.id);
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    const row = screen.getByRole('button', { name: /GPT-5\.6 Sol/i });
    expect(row.hasAttribute('disabled')).toBe(false);
    expect(row.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Coming soon')).toBeNull();
  });

  it('labels an unknown dynamic-model context window honestly', () => {
    const unknownByokModel: ModelInfo = {
      ...byokModel,
      id: 'private-gateway/custom-model',
      name: 'Custom Model',
      contextWindow: 0,
      metadataSource: 'unknown',
    };
    useModelStore.setState({ models: [unknownByokModel], selectedModelId: unknownByokModel.id });
    seedConversation('byok', unknownByokModel.id);
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    expect(screen.getByText('Unknown ctx')).toBeTruthy();
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
    seedConversation('byok', sonnetModel.id);
    useModelStore.setState({ models: [sonnetModel], selectedModelId: sonnetModel.id });
    render(<ModelSelector effort={null} onEffortChange={onEffortChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enable thinking mode' }));

    expect(onEffortChange).toHaveBeenCalledWith('high');
  });

  // Removed with Haiku 4.5 (retired 2026-07-27). It was the only catalog
  // model without an effort ladder, so 'hides the effort control' has no
  // model left to demonstrate it. Restore when one exists again.

  it('represents Fable mandatory reasoning without an off toggle', async () => {
    const onEffortChange = vi.fn();
    seedConversation('byok', fableModel.id);
    useModelStore.setState({ models: [fableModel], selectedModelId: fableModel.id });
    render(<ModelSelector effort={null} onEffortChange={onEffortChange} />);

    await waitFor(() => expect(onEffortChange).toHaveBeenCalledWith('high'));
    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    expect(screen.queryByRole('button', { name: /thinking mode/i })).toBeNull();
    expect(screen.getByText('always')).toBeTruthy();
  });
});
