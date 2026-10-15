import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, message: mocks.toastMessage },
}));

vi.mock('@/lib/tauri-mock', () => ({
  invoke: mocks.invoke,
  isTauri: true,
  isCloudWeb: false,
  supportsLocalAppMode: true,
  isTauriContext: () => true,
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
  once: vi.fn().mockResolvedValue(() => {}),
}));

vi.mock('../../utils/navigation', () => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));

import { ExtensionsSettings } from './ExtensionsSettings';

const configurableExtension = {
  id: 'weather',
  name: 'Weather',
  version: '1.0.0',
  description: 'Weather tools',
  author: 'AGI',
  status: 'disabled',
  lastError: null,
  installPath: '/ext/weather',
  toolCount: 1,
  tools: ['get_forecast'],
  requiresConfig: true,
  configComplete: false,
  configSchema: {
    type: 'object',
    properties: {
      apiKey: { type: 'string', title: 'API Key', sensitive: true, required: true },
      maxResults: { type: 'number', title: 'Max results' },
    },
    required: ['apiKey'],
  },
  category: null,
  iconPath: null,
  installedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  useCount: 0,
};

describe('ExtensionsSettings configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_list') return [configurableExtension];
      if (command === 'extension_get_config') return { maxResults: 5 };
      if (command === 'extension_set_config') return 'Configuration updated';
      return undefined;
    });
  });

  it('saves schema-typed configuration values through extension_set_config', async () => {
    const user = userEvent.setup();
    render(<ExtensionsSettings />);

    await user.click(await screen.findByRole('button', { name: /configure/i }));

    const apiKey = await screen.findByLabelText(/API Key/);
    await waitFor(() => expect(screen.getByLabelText(/Max results/)).toHaveValue(5));

    await user.type(apiKey, 'secret-key');
    expect(apiKey).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('extension_set_config', {
        extensionId: 'weather',
        config: { apiKey: 'secret-key', maxResults: 5 },
      });
    });
  });

  it('blocks saving while a required value is missing', async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_list') return [configurableExtension];
      if (command === 'extension_get_config') return {};
      return undefined;
    });

    render(<ExtensionsSettings />);
    await user.click(await screen.findByRole('button', { name: /configure/i }));
    await screen.findByLabelText(/API Key/);
    await user.click(screen.getByRole('button', { name: /save configuration/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/API Key/);
    expect(mocks.invoke).not.toHaveBeenCalledWith('extension_set_config', expect.anything());
  });

  it('keeps a stored secret the host did not return and sends only what was typed', async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_list') {
        return [{ ...configurableExtension, storedSecrets: ['apiKey'] }];
      }
      if (command === 'extension_get_config') return { maxResults: 5 };
      if (command === 'extension_set_config') return 'Configuration updated';
      return undefined;
    });

    render(<ExtensionsSettings />);
    await user.click(await screen.findByRole('button', { name: /configure/i }));

    const apiKey = await screen.findByLabelText(/API Key/);
    expect(apiKey).toHaveValue('');
    expect(apiKey).toHaveAccessibleDescription(
      /A value is stored on this device and is not shown here/,
    );
    await waitFor(() => expect(screen.getByLabelText(/Max results/)).toHaveValue(5));

    await user.click(screen.getByRole('button', { name: /save configuration/i }));

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith('extension_set_config', {
        extensionId: 'weather',
        config: { maxResults: 5 },
      });
    });
  });

  it('shows the reason the host gave when an install is declined, and claims no install', async () => {
    const user = userEvent.setup();
    mocks.invoke.mockImplementation(async (command: string) => {
      if (command === 'extension_list') return [];
      if (command === 'extension_select_package') return '/downloads/weather.agiext';
      if (command === 'extension_install') {
        return Promise.reject('You chose not to install this extension.');
      }
      return undefined;
    });

    render(<ExtensionsSettings />);
    await user.click(await screen.findByRole('button', { name: /install/i }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Extension not installed', {
        description: 'You chose not to install this extension.',
      }),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /install/i })).toBeEnabled();
  });

  it('keeps enable unavailable until required configuration exists', async () => {
    render(<ExtensionsSettings />);

    expect(await screen.findByRole('button', { name: /enable/i })).toBeDisabled();
  });
});
