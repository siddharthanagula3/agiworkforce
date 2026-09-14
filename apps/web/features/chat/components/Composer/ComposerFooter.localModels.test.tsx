import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DesktopRuntimeResponse,
  HostBridge,
  LocalModel,
  LocalModelSnapshot,
} from '@agiworkforce/local-runtime-contract';
import { ComposerFooter } from './ComposerFooter';
import { useLocalModelSelection } from '@features/desktop-host';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const LOCAL_MODEL: LocalModel = {
  id: 'local:ollama/tiny-chat:1b',
  serverId: 'ollama',
  serverLabel: 'Ollama',
  name: 'tiny-chat:1b',
  sizeBillion: 1.2,
};

const TINY_MODEL: LocalModel = {
  id: 'local:ollama/tinyfixture:135m',
  serverId: 'ollama',
  serverLabel: 'Ollama',
  name: 'tinyfixture:135m',
  sizeBillion: 0.13452,
};

let snapshot: LocalModelSnapshot;
let listedModels: LocalModel[];
const listCalls = vi.fn();

function installHost(): void {
  const host: HostBridge = {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    async invokeRuntime<T>(command: string) {
      if (command === 'local_model_servers') {
        return { ok: true, value: snapshot as T } as DesktopRuntimeResponse<T>;
      }
      if (command === 'local_model_list') {
        listCalls();
        return { ok: true, value: listedModels as T } as DesktopRuntimeResponse<T>;
      }
      return { ok: true, value: undefined as T };
    },
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent: () => () => undefined,
    openExternal: async () => undefined,
    notify: async () => undefined,
  };
  window.agiHost = host;
}

const reachable = {
  id: 'ollama' as const,
  label: 'Ollama',
  baseUrl: 'http://localhost:11434',
  reachable: true,
  modelCount: 1,
};

beforeEach(() => {
  listCalls.mockClear();
  snapshot = { granted: false, servers: [reachable] };
  listedModels = [LOCAL_MODEL];
  useLocalModelSelection.getState().select(null);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ models: [] }), { status: 200 })),
  );
});

afterEach(() => {
  useLocalModelSelection.getState().select(null);
  delete window.agiHost;
  vi.unstubAllGlobals();
});

async function openPicker() {
  const user = userEvent.setup();
  render(<ComposerFooter inline showModelSelector />);
  await user.click(screen.getByRole('button', { name: 'Change model' }));
  return user;
}

describe('the model picker on the desktop shell', () => {
  it('offers no On this device section in a browser', async () => {
    delete window.agiHost;
    await openPicker();
    expect(screen.queryByText('On this device')).not.toBeInTheDocument();
  });

  it('offers no On this device section when no local server is running', async () => {
    installHost();
    snapshot = { granted: false, servers: [{ ...reachable, reachable: false, modelCount: 0 }] };
    await openPicker();
    await waitFor(() => expect(screen.queryByText('On this device')).not.toBeInTheDocument());
  });

  it('lists nothing installed until the grant is asked for', async () => {
    installHost();
    const user = await openPicker();

    await screen.findByText('On this device');
    expect(listCalls).not.toHaveBeenCalled();
    expect(screen.queryByText('tiny-chat:1b')).not.toBeInTheDocument();

    snapshot = { granted: true, servers: [reachable] };
    await user.click(screen.getByText('Use models on this device'));

    await screen.findByText('tiny-chat:1b');
    expect(listCalls).toHaveBeenCalled();
  });

  it('marks a listed local model as Local and names its server', async () => {
    installHost();
    snapshot = { granted: true, servers: [reachable] };
    await openPicker();

    const row = await screen.findByRole('button', {
      name: 'tiny-chat:1b - Ollama, runs on this device',
    });
    expect(row.textContent).toContain('Local');
    expect(row.textContent).toContain('Ollama · 1.2B');
  });

  it('hides a model under the minimum size and says why', async () => {
    installHost();
    snapshot = { granted: true, servers: [reachable] };
    listedModels = [LOCAL_MODEL, TINY_MODEL];
    await openPicker();

    await screen.findByRole('button', { name: 'tiny-chat:1b - Ollama, runs on this device' });
    expect(
      screen.queryByRole('button', { name: 'tinyfixture:135m - Ollama, runs on this device' }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        'tinyfixture:135m is under 1B parameters and is hidden; pull a larger model',
      ),
    ).toBeInTheDocument();
  });

  it('explains an empty section when every installed model is under the minimum', async () => {
    installHost();
    snapshot = { granted: true, servers: [reachable] };
    listedModels = [TINY_MODEL];
    await openPicker();

    expect(
      await screen.findByText(
        'tinyfixture:135m is under 1B parameters and is hidden; pull a larger model',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No models loaded on this device yet.')).not.toBeInTheDocument();
  });

  it('puts the composer on the local model and says so on the trigger', async () => {
    installHost();
    snapshot = { granted: true, servers: [reachable] };
    const user = await openPicker();

    await user.click(
      await screen.findByRole('button', { name: 'tiny-chat:1b - Ollama, runs on this device' }),
    );

    expect(useLocalModelSelection.getState().selected?.id).toBe(LOCAL_MODEL.id);
    const trigger = screen.getByRole('button', { name: 'Change model' });
    expect(trigger.textContent).toContain('tiny-chat:1b');
    expect(trigger.textContent).toContain('Local');
  });
});
