import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMcpbStore } from '../../../stores/mcpbStore';
import type { McpBundle } from '../../../types/mcp';
import { MCPBundleBrowser } from '../MCPBundleBrowser';

const baseBundle: McpBundle = {
  id: 'mcp-example',
  name: 'Example tools',
  version: '1.0.0',
  description: 'Example MCP tools for tests.',
  author: 'Example publisher',
  category: 'development',
  npmPackage: '@example/mcp-server',
  tools: [{ name: 'example', description: 'Runs an example.', parameters: [] }],
  configTemplate: {
    command: 'npx',
    args: ['-y', '@example/mcp-server'],
    env: {},
    enabled: false,
  },
  requiredCredentials: [],
  verified: true,
  featured: false,
  tags: ['example'],
  installed: false,
  updateAvailable: false,
};

describe('MCPBundleBrowser', () => {
  const fetchRegistry = vi.fn().mockResolvedValue(undefined);
  const searchBundles = vi.fn().mockResolvedValue(undefined);
  const filterByCategory = vi.fn();
  const installBundle = vi.fn().mockResolvedValue(undefined);
  const updateBundle = vi.fn().mockResolvedValue(undefined);
  const uninstallBundle = vi.fn().mockResolvedValue(undefined);
  const clearError = vi.fn();
  const setInstallProgress = vi.fn();

  function setBundle(bundle: McpBundle) {
    useMcpbStore.setState({
      bundles: [bundle],
      installedBundles: bundle.installed ? [bundle] : [],
      featuredBundles: [],
      categories: ['development'],
      selectedCategory: null,
      searchQuery: '',
      isLoading: false,
      isInstalling: false,
      installProgress: null,
      error: null,
      fetchRegistry,
      searchBundles,
      filterByCategory,
      installBundle,
      updateBundle,
      uninstallBundle,
      clearError,
      setInstallProgress,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    setBundle(baseBundle);
  });

  it('installs a verified bundle from the reachable registry', async () => {
    render(<MCPBundleBrowser />);

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installBundle).toHaveBeenCalledWith(baseBundle.id);
    });
  });

  it('requires explicit confirmation before installing an unverified bundle', async () => {
    setBundle({ ...baseBundle, verified: false });
    render(<MCPBundleBrowser />);

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    expect(
      await screen.findByRole('heading', { name: /Install unverified bundle/ }),
    ).toBeInTheDocument();
    expect(installBundle).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Install unverified bundle' }));

    await waitFor(() => {
      expect(installBundle).toHaveBeenCalledWith(baseBundle.id);
    });
  });

  it('does not advertise one-click installation when no package is available', () => {
    setBundle({ ...baseBundle, npmPackage: undefined });
    render(<MCPBundleBrowser />);

    expect(screen.getByRole('button', { name: 'Manual' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  it('uses the update command for an installed bundle with a newer version', async () => {
    setBundle({ ...baseBundle, installed: true, updateAvailable: true });
    render(<MCPBundleBrowser />);

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    await waitFor(() => {
      expect(updateBundle).toHaveBeenCalledWith(baseBundle.id);
    });
    expect(installBundle).not.toHaveBeenCalled();
  });

  it('routes a completed installation to server configuration', () => {
    const onConfigureServer = vi.fn();
    useMcpbStore.setState({
      bundles: [],
      categories: [],
      installProgress: {
        bundleId: baseBundle.id,
        status: 'completed',
        progress: 100,
        message: 'Installation complete.',
      },
      setInstallProgress,
    });

    render(<MCPBundleBrowser onConfigureServer={onConfigureServer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Configure Server' }));

    expect(setInstallProgress).toHaveBeenCalledWith(null);
    expect(onConfigureServer).toHaveBeenCalledOnce();
  });
});
