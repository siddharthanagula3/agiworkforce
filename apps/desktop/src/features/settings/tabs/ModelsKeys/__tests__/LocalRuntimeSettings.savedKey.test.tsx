import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  saveApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
  listSavedApiKeys: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/api/mcp', () => ({
  McpClient: { saveApiKey: api.saveApiKey },
}));

vi.mock('@/api/byok', () => ({
  deleteApiKey: api.deleteApiKey,
  listSavedApiKeys: api.listSavedApiKeys,
}));

vi.mock('../LocalModelMemory', () => ({
  LmStudioMemory: () => null,
}));

import { toast } from 'sonner';

import { LocalRuntimeSettings } from '../LocalRuntimeSettings';

const DECLINED =
  'Sending the saved vLLM key to 192.168.1.20 was not confirmed, so vLLM was not connected.';

function stubNative(
  configure: () => Promise<unknown>,
  awaiting: () => Record<string, string> = () => ({}),
) {
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'llm_configure_provider') return configure();
    if (command === 'llm_check_provider_status') {
      const provider = (args as { provider: string }).provider;
      const host = awaiting()[provider];
      return host
        ? {
            available: false,
            configured: false,
            error: `Reconnect to confirm sending your saved key to ${host}.`,
            saved_key_awaits_confirmation: host,
          }
        : { available: false, configured: false, error: null };
    }
    return undefined;
  });
}

async function typeVllmKey(value: string) {
  const input = await waitFor(() => {
    const field = document.getElementById('vllm-server-key');
    if (!field) throw new Error('the vLLM key field has not rendered');
    return field;
  });
  fireEvent.change(input, { target: { value } });
  const saveButtons = screen.getAllByRole('button', { name: 'Save key' });
  fireEvent.click(saveButtons[saveButtons.length - 1]!);
}

describe('saving a local runtime key', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(toast.error).mockReset();
    api.saveApiKey.mockReset();
    api.deleteApiKey.mockReset();
    api.listSavedApiKeys.mockReset();
    api.listSavedApiKeys.mockResolvedValue([]);
    api.saveApiKey.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('says the key was saved but the runtime was not connected when sending it is declined', async () => {
    stubNative(() => Promise.reject(new Error(DECLINED)));
    render(<LocalRuntimeSettings />);

    await typeVllmKey('fixture-server-key');

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    const [message] = vi.mocked(toast.error).mock.calls[0]!;
    expect(message).toContain('The vLLM key was saved, but vLLM was not connected with it');
    expect(message).toContain(DECLINED);
    expect(message).not.toContain('Could not save');
    expect(api.saveApiKey).toHaveBeenCalledWith('vllm', 'fixture-server-key');
    expect(await screen.findByText('A key is saved for vLLM.')).toBeInTheDocument();
  });

  it('says the key was not saved when saving itself fails, and does not try to connect', async () => {
    api.saveApiKey.mockRejectedValue(new Error('vault is locked'));
    stubNative(() => Promise.resolve(undefined));
    render(<LocalRuntimeSettings />);

    await typeVllmKey('fixture-server-key');

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0]![0]).toContain(
      'Could not save the vLLM key: vault is locked',
    );
    expect(invoke).not.toHaveBeenCalledWith('llm_configure_provider', expect.anything());
    expect(screen.queryByText('A key is saved for vLLM.')).not.toBeInTheDocument();
  });

  it('stays quiet when the key is saved and the runtime connects', async () => {
    stubNative(() => Promise.resolve(undefined));
    render(<LocalRuntimeSettings />);

    await typeVllmKey('fixture-server-key');

    expect(await screen.findByText('A key is saved for vLLM.')).toBeInTheDocument();
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'llm_configure_provider',
        expect.objectContaining({ provider: 'vllm', apiKey: null, userInitiated: true }),
      ),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('a runtime left unconnected until its saved key destination is confirmed', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(toast.error).mockReset();
    api.listSavedApiKeys.mockReset();
    api.listSavedApiKeys.mockResolvedValue(['vllm']);
  });

  afterEach(() => cleanup());

  it('says why on its row and connects nothing until Reconnect is pressed', async () => {
    let awaiting: Record<string, string> = { vllm: '192.168.1.20:8000' };
    stubNative(
      async () => {
        awaiting = {};
        return undefined;
      },
      () => awaiting,
    );
    render(<LocalRuntimeSettings />);

    expect(
      await screen.findByText(
        /vLLM is not connected\. Reconnect to confirm sending your saved key to\s+192\.168\.1\.20:8000\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reconnect' })).toHaveLength(1);
    expect(invoke).not.toHaveBeenCalledWith('llm_configure_provider', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        'llm_configure_provider',
        expect.objectContaining({ provider: 'vllm', apiKey: null, userInitiated: true }),
      ),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Reconnect' })).not.toBeInTheDocument(),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the row and says so when the reconnect is declined', async () => {
    stubNative(
      () => Promise.reject(new Error(DECLINED)),
      () => ({ vllm: '192.168.1.20:8000' }),
    );
    render(<LocalRuntimeSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toast.error).mock.calls[0]![0]).toContain(
      `vLLM was not connected: ${DECLINED}`,
    );
    expect(await screen.findByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });
});
