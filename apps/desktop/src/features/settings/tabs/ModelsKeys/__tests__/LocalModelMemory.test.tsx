import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { OllamaLoadedModel } from '@/api/ollama';
import { useSettingsStore } from '@/stores/settingsStore';

import {
  LmStudioMemory,
  OllamaMemorySettings,
  describeIdleUnload,
  describeLoadedModel,
} from '../LocalModelMemory';

if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (typeof Element.prototype.scrollIntoView === 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

const NOW = Date.parse('2026-10-11T12:00:00Z');

const LOADED: OllamaLoadedModel = {
  name: 'fixture-local:latest',
  size: 4 * 1024 * 1024 * 1024,
  size_vram: 3 * 1024 * 1024 * 1024,
  expires_at: '2026-10-11T12:04:10Z',
  parameter_size: '7.2B',
  quantization_level: 'Q4_0',
};

const OLLAMA_URL = 'http://localhost:11434';

describe('loaded model descriptions', () => {
  it('says when an idle model will be unloaded', () => {
    expect(describeIdleUnload('2026-10-11T12:04:10Z', NOW)).toBe('Unloads in 5 min if idle');
    expect(describeIdleUnload('2026-10-11T15:00:00Z', NOW)).toBe('Unloads in 3 h if idle');
    expect(describeIdleUnload('2318-01-01T00:00:00Z', NOW)).toBe('Stays loaded');
    expect(describeIdleUnload('2026-10-11T11:59:00Z', NOW)).toBe('Unloading');
    expect(describeIdleUnload(null, NOW)).toBe('');
    expect(describeIdleUnload('not a date', NOW)).toBe('');
  });

  it('summarises size, GPU share and expiry, leaving out what Ollama did not report', () => {
    expect(describeLoadedModel(LOADED, NOW)).toBe(
      '7.2B · Q4_0 · 4.00 GB · 75% on GPU · Unloads in 5 min if idle',
    );
    expect(
      describeLoadedModel(
        { ...LOADED, parameter_size: '', quantization_level: '', size_vram: 0, expires_at: null },
        NOW,
      ),
    ).toBe('4.00 GB');
  });
});

describe('OllamaMemorySettings', () => {
  let loaded: OllamaLoadedModel[];
  let keepAlive: number | null;

  beforeEach(() => {
    loaded = [LOADED];
    keepAlive = null;
    useSettingsStore.setState((state) => ({
      llmConfig: { ...state.llmConfig, ollamaUrl: OLLAMA_URL, allowPrivateNetworkRuntimes: false },
    }));
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      const payload = args as Record<string, unknown> | undefined;
      switch (command) {
        case 'ollama_list_loaded_models':
          return loaded;
        case 'ollama_get_keep_alive':
          return keepAlive;
        case 'ollama_set_keep_alive':
          keepAlive = (payload?.['keepAliveSeconds'] as number | null) ?? null;
          return keepAlive;
        case 'ollama_unload_model':
          loaded = loaded.filter((model) => model.name !== payload?.['modelName']);
          return undefined;
        case 'ollama_load_model':
          loaded = [...loaded, { ...LOADED, name: String(payload?.['modelName']) }];
          return undefined;
        default:
          return undefined;
      }
    });
  });

  afterEach(() => cleanup());

  it('lists the models in memory and unloads one on request', async () => {
    const user = userEvent.setup();
    render(<OllamaMemorySettings installedModels={['fixture-local:latest']} />);

    expect(await screen.findByText('fixture-local:latest')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Unload fixture-local:latest' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('ollama_unload_model', {
        modelName: 'fixture-local:latest',
        baseUrl: OLLAMA_URL,
        allowPrivateNetwork: false,
      });
    });
    expect(await screen.findByText(/No model is in memory/)).toBeInTheDocument();
  });

  it('loads an installed model that is not in memory yet', async () => {
    const user = userEvent.setup();
    render(
      <OllamaMemorySettings installedModels={['fixture-local:latest', 'fixture-other:latest']} />,
    );

    await screen.findByText('fixture-local:latest');
    await user.click(screen.getByRole('combobox', { name: 'Model to load' }));
    expect(screen.queryByRole('option', { name: 'fixture-local:latest' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'fixture-other:latest' }));
    await user.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('ollama_load_model', {
        modelName: 'fixture-other:latest',
        baseUrl: OLLAMA_URL,
        allowPrivateNetwork: false,
      });
    });
    expect(
      await screen.findByRole('button', { name: 'Unload fixture-other:latest' }),
    ).toBeInTheDocument();
  });

  it('shows why the list could not be read and keeps Load unavailable', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'ollama_list_loaded_models') throw new Error('Failed to reach Ollama');
      if (command === 'ollama_get_keep_alive') return null;
      return undefined;
    });
    render(<OllamaMemorySettings installedModels={['fixture-local:latest']} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to reach Ollama');
    expect(screen.getByRole('button', { name: 'Load' })).toBeDisabled();
  });

  it('saves the chosen keep-alive and shows the value the app now sends', async () => {
    const user = userEvent.setup();
    render(<OllamaMemorySettings installedModels={[]} />);

    const select = await screen.findByRole('combobox', { name: 'Keep models in memory for' });
    await waitFor(() => expect(select).toBeEnabled());
    expect(select).toHaveTextContent('Ollama decides');

    await user.click(select);
    await user.click(await screen.findByRole('option', { name: '1 hour' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('ollama_set_keep_alive', { keepAliveSeconds: 3600 });
    });
    await waitFor(() => expect(select).toHaveTextContent('1 hour'));

    await user.click(select);
    await user.click(await screen.findByRole('option', { name: /Ollama decides/ }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('ollama_set_keep_alive', { keepAliveSeconds: null });
    });
  });

  it('keeps the previous keep-alive on screen when saving fails', async () => {
    const user = userEvent.setup();
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'ollama_list_loaded_models') return [];
      if (command === 'ollama_get_keep_alive') return 300;
      if (command === 'ollama_set_keep_alive') throw new Error('Failed to save the keep-alive');
      return undefined;
    });
    render(<OllamaMemorySettings installedModels={[]} />);

    const select = await screen.findByRole('combobox', { name: 'Keep models in memory for' });
    await waitFor(() => expect(select).toHaveTextContent('5 minutes'));
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: '4 hours' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the keep-alive');
    expect(select).toHaveTextContent('5 minutes');
  });
});

describe('LmStudioMemory', () => {
  afterEach(() => cleanup());

  it('unloads a loaded instance and offers the models that are not loaded', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    let states = [
      {
        key: 'fixture/chat-model',
        display_name: 'Fixture Chat',
        size_bytes: 2 * 1024 * 1024 * 1024,
        loaded_instance_ids: ['fixture/chat-model'],
      },
      {
        key: 'fixture/idle-model',
        display_name: 'Fixture Idle',
        size_bytes: 1024,
        loaded_instance_ids: [],
      },
    ];
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      const payload = args as Record<string, unknown> | undefined;
      if (command === 'llm_lmstudio_list_model_states') return states;
      if (command === 'llm_lmstudio_unload_model') {
        states = states.map((state) => ({
          ...state,
          loaded_instance_ids: state.loaded_instance_ids.filter(
            (id) => id !== payload?.['instanceId'],
          ),
        }));
      }
      return undefined;
    });

    render(<LmStudioMemory onChanged={onChanged} />);

    await user.click(await screen.findByRole('button', { name: 'Unload Fixture Chat' }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('llm_lmstudio_unload_model', {
        instanceId: 'fixture/chat-model',
      });
    });
    expect(await screen.findByText('No model is in memory.')).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('combobox', { name: 'Model to load' }));
    await user.click(await screen.findByRole('option', { name: 'Fixture Idle' }));
    await user.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('llm_lmstudio_load_model', {
        model: 'fixture/idle-model',
      });
    });
  });

  it('says so when the LM Studio server is too old to manage models', async () => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockRejectedValue(
      new Error('Loading and unloading models from here needs LM Studio 0.4.0 or newer.'),
    );

    render(<LmStudioMemory onChanged={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('LM Studio 0.4.0 or newer');
    expect(screen.queryByRole('button', { name: 'Load' })).not.toBeInTheDocument();
  });
});
