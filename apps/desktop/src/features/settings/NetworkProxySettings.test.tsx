import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NetworkProxySettings } from './NetworkProxySettings';

const mockInvoke = vi.fn();
const mockOpen = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastWarning = vi.fn();

vi.mock('@/lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
  },
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      llmConfig: {
        ollamaUrl: 'http://localhost:11434',
        lmstudioUrl: 'http://localhost:1234/v1',
        llamacppUrl: 'http://localhost:8080/v1',
        vllmUrl: 'http://localhost:8000/v1',
      },
    }),
  },
}));

const savedSettings = {
  enabled: false,
  proxyUrl: '',
  noProxy: 'localhost,127.0.0.1,::1',
  caCertPath: '',
  username: '',
  hasPassword: false,
};

describe('NetworkProxySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation((command: string) => {
      if (command === 'llm_network_proxy_get') return Promise.resolve(savedSettings);
      if (command === 'llm_network_proxy_set') {
        return Promise.resolve({
          ...savedSettings,
          enabled: true,
          proxyUrl: 'https://proxy.example.com:8443',
          username: 'network-user',
          hasPassword: true,
        });
      }
      if (command === 'llm_configure_provider') return Promise.resolve(undefined);
      return Promise.reject(new Error(`Unexpected command: ${command}`));
    });
  });

  it('applies encrypted proxy settings and rebuilds every local provider', async () => {
    const user = userEvent.setup();
    render(<NetworkProxySettings />);

    await screen.findByText('LLM network proxy');
    await user.click(screen.getByRole('switch', { name: 'Use a custom LLM network proxy' }));
    await user.type(screen.getByLabelText('Proxy URL'), 'https://proxy.example.com:8443');
    await user.type(screen.getByLabelText('Username (optional)'), 'network-user');
    await user.type(screen.getByLabelText('Password (optional)'), 'encrypted-password');
    await user.click(screen.getByRole('button', { name: 'Apply network settings' }));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('llm_network_proxy_set', {
        request: {
          enabled: true,
          proxyUrl: 'https://proxy.example.com:8443',
          noProxy: 'localhost,127.0.0.1,::1',
          caCertPath: '',
          username: 'network-user',
          password: 'encrypted-password',
          clearPassword: false,
        },
      });
    });

    const rebuiltProviders = mockInvoke.mock.calls
      .filter(([command]) => command === 'llm_configure_provider')
      .map(([, args]) => args.provider);
    expect(rebuiltProviders).toEqual(['ollama', 'lmstudio', 'llamacpp', 'vllm']);
    expect(mockToastSuccess).toHaveBeenCalledWith('LLM network settings applied');
    expect(screen.getByText('Applied to live providers')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('encrypted-password')).not.toBeInTheDocument();
  });

  it('rejects credentials embedded in the proxy URL before native persistence', async () => {
    const user = userEvent.setup();
    render(<NetworkProxySettings />);

    await screen.findByText('LLM network proxy');
    await user.click(screen.getByRole('switch', { name: 'Use a custom LLM network proxy' }));
    await user.type(screen.getByLabelText('Proxy URL'), 'https://user:pass@proxy.example.com');

    expect(
      screen.getByText(
        'Keep credentials out of the URL. Use the encrypted username and password fields.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply network settings' })).toBeDisabled();
    expect(mockInvoke).not.toHaveBeenCalledWith('llm_network_proxy_set', expect.anything());
  });

  it('stores a selected CA path without reading certificate content in the renderer', async () => {
    const user = userEvent.setup();
    mockOpen.mockResolvedValue('/private/certs/corporate-root.pem');
    render(<NetworkProxySettings />);

    await screen.findByText('LLM network proxy');
    await user.click(screen.getByRole('button', { name: 'Browse' }));

    expect(screen.getByLabelText('Custom root CA certificate (optional)')).toHaveValue(
      '/private/certs/corporate-root.pem',
    );
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: false,
        multiple: false,
        filters: [{ name: 'Certificates', extensions: ['pem', 'crt', 'cer'] }],
      }),
    );
  });
});
