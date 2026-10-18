import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PluginsDirectory from '@/features/directory/services/plugins-directory';

const mocks = vi.hoisted(() => ({
  fetchPluginInstallState: vi.fn(),
  fetchPluginDirectoryEntry: vi.fn(),
}));

vi.mock('@/features/directory/services/plugins-directory', async (importOriginal) => ({
  ...(await importOriginal<typeof PluginsDirectory>()),
  fetchPluginInstallState: mocks.fetchPluginInstallState,
  fetchPluginDirectoryEntry: mocks.fetchPluginDirectoryEntry,
}));

import { EMPTY_INSTALL_STATE } from '@/features/directory/services/plugins-directory';
import { InstalledPluginsUnavailableError, loadInstalledPlugins } from '../installed-plugins';

beforeEach(() => {
  mocks.fetchPluginInstallState.mockReset();
  mocks.fetchPluginDirectoryEntry.mockReset();
});

describe('loadInstalledPlugins', () => {
  it('fails instead of answering an empty list when the installs could not be read', async () => {
    mocks.fetchPluginInstallState.mockResolvedValue({ ...EMPTY_INSTALL_STATE, readFailed: true });

    await expect(loadInstalledPlugins()).rejects.toBeInstanceOf(InstalledPluginsUnavailableError);
    expect(mocks.fetchPluginDirectoryEntry).not.toHaveBeenCalled();
  });

  it('answers an empty list when the account has nothing installed', async () => {
    mocks.fetchPluginInstallState.mockResolvedValue(EMPTY_INSTALL_STATE);

    await expect(loadInstalledPlugins()).resolves.toEqual([]);
  });

  it('lists the enabled built-in plugins with their skills', async () => {
    mocks.fetchPluginInstallState.mockResolvedValue({
      ...EMPTY_INSTALL_STATE,
      builtinIds: new Map([
        ['data-pack', true],
        ['off-pack', false],
      ]),
    });
    mocks.fetchPluginDirectoryEntry.mockResolvedValue({
      id: 'data-pack',
      name: 'Data pack',
      declaredSkills: ['csv-clean'],
    });

    await expect(loadInstalledPlugins()).resolves.toEqual([
      { id: 'data-pack', name: 'Data pack', skills: ['csv-clean'] },
    ]);
    expect(mocks.fetchPluginDirectoryEntry).toHaveBeenCalledExactlyOnceWith('data-pack');
  });
});
