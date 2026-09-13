import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  DesktopRuntimeError,
  type HostBridge,
  type LocalModelSettings,
} from '@agiworkforce/local-runtime-contract';

const listWorkspaceRoots = vi.fn();
const pickWorkspaceRoot = vi.fn();
const revealWorkspaceRoot = vi.fn();
const revokeWorkspaceRoot = vi.fn();
const readLocalCommandPolicy = vi.fn();
const writeLocalCommandPolicy = vi.fn();
const readLocalModelSettings = vi.fn();
const writeLocalModelSettings = vi.fn();
const readLocalModelSnapshot = vi.fn();
const listLocalModels = vi.fn();

vi.mock('../lib/runtime-client', () => ({
  listWorkspaceRoots,
  pickWorkspaceRoot,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
  readLocalCommandPolicy,
  writeLocalCommandPolicy,
  readLocalModelSettings,
  writeLocalModelSettings,
  readLocalModelSnapshot,
  listLocalModels,
}));

const { LocalAccessSection } = await import('../components/LocalAccessSection');

const SETTINGS: LocalModelSettings = {
  baseUrls: { ollama: 'http://localhost:11434', lmstudio: 'http://localhost:1234/v1' },
};

function installHost() {
  window.agiHost = {
    platform: 'electron-darwin',
    appVersion: '1.2.0',
    invokeRuntime: async () => ({
      ok: false as const,
      error: { code: 'unsupported-platform' as const, message: 'not used here' },
    }),
    onDeepLink: () => () => undefined,
    onVoiceHotkey: () => () => undefined,
    onRuntimeEvent: () => () => undefined,
    openExternal: async () => undefined,
    notify: async () => undefined,
  } satisfies HostBridge;
}

beforeEach(() => {
  vi.clearAllMocks();
  listWorkspaceRoots.mockResolvedValue([]);
  readLocalCommandPolicy.mockResolvedValue({ allow: [], deny: [] });
  writeLocalCommandPolicy.mockImplementation(async (policy: unknown) => policy);
  readLocalModelSettings.mockResolvedValue(SETTINGS);
  writeLocalModelSettings.mockImplementation(async (settings: unknown) => settings);
  listLocalModels.mockResolvedValue([]);
  readLocalModelSnapshot.mockResolvedValue({
    granted: false,
    servers: [
      {
        id: 'ollama',
        label: 'Ollama',
        baseUrl: SETTINGS.baseUrls.ollama,
        reachable: true,
        modelCount: 3,
      },
      {
        id: 'lmstudio',
        label: 'LM Studio',
        baseUrl: SETTINGS.baseUrls.lmstudio,
        reachable: false,
        modelCount: 0,
      },
    ],
  });
  installHost();
});

describe('the Local models row in settings', () => {
  it('reports which server is running and at which address', async () => {
    render(<LocalAccessSection />);
    expect(await screen.findByText('Running · 3 models')).toBeInTheDocument();
    expect(screen.getByText('Not running')).toBeInTheDocument();
    const addresses = screen.getAllByLabelText(/Address/i);
    expect((addresses[0] as HTMLInputElement).value).toBe(SETTINGS.baseUrls.ollama);
  });

  it('offers the grant until it is held', async () => {
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    const allow = await screen.findByRole('button', { name: 'Allow local models' });

    readLocalModelSnapshot.mockResolvedValue({ granted: true, servers: [] });
    await user.click(allow);

    await waitFor(() => expect(listLocalModels).toHaveBeenCalled());
    expect(await screen.findByText(/Allowed\./)).toBeInTheDocument();
  });

  it('refuses an address off this machine and puts the field back', async () => {
    // The host answers a refused address over IPC, so the page sees the
    // runtime's error envelope rather than the contract's own exception.
    writeLocalModelSettings.mockRejectedValue(
      new DesktopRuntimeError({
        code: 'invalid-arguments',
        message: 'http://models.example.com is not on this machine.',
      }),
    );
    const user = userEvent.setup();
    render(<LocalAccessSection />);
    const field = (await screen.findAllByLabelText(/Address/i))[0] as HTMLInputElement;

    await user.tripleClick(field);
    await user.keyboard('http://models.example.com');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('not on this machine');
    await waitFor(() => expect(field.value).toBe(SETTINGS.baseUrls.ollama));
  });
});
