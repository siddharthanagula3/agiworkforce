import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginInstallationSettings } from '@agiworkforce/cloud-contracts';

const { fetchMock, updateMock, setEnabledMock, csrfMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  updateMock: vi.fn(),
  setEnabledMock: vi.fn(),
  csrfMock: vi.fn(),
}));

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: csrfMock }));
vi.mock('../../client/installation-settings', async () => {
  const actual = await vi.importActual<typeof import('../../client/installation-settings')>(
    '../../client/installation-settings',
  );
  return {
    ...actual,
    fetchPluginSettings: fetchMock,
    updatePluginSettings: updateMock,
    setPluginInstallationEnabled: setEnabledMock,
  };
});

import { PluginSettingsError } from '../../client/installation-settings';
import { PLUGIN_TARGET_BUILTIN } from '../../routes';
import { usePluginsSettingsAdapter } from '../use-plugins-settings-adapter';

const TARGET = { kind: PLUGIN_TARGET_BUILTIN, pluginId: 'research-pack' } as const;

function settings(overrides: Partial<PluginInstallationSettings> = {}): PluginInstallationSettings {
  return {
    pluginId: 'research-pack',
    enabledSkills: ['literature-review'],
    examplePrompts: [],
    connectors: [{ connectorId: 'github', connected: false }],
    agents: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  csrfMock.mockResolvedValue('token-1');
  fetchMock.mockResolvedValue(settings());
  updateMock.mockResolvedValue(settings({ enabledSkills: [] }));
  setEnabledMock.mockResolvedValue(false);
});

describe('usePluginsSettingsAdapter', () => {
  it('loads the settings for a target and reports the connector readiness it was given', async () => {
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings?.connectors).toEqual([
      { connectorId: 'github', connected: false },
    ]);
    expect(result.current.error).toBeNull();
  });

  it('reads nothing and reports nothing when there is no target', async () => {
    const { result } = renderHook(() => usePluginsSettingsAdapter(null));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.settings).toBeNull();
  });

  it('turning a skill off sends the remaining set, not the removed one', async () => {
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.setSkillEnabled('literature-review', false);
    });

    expect(updateMock).toHaveBeenCalledWith(TARGET, { enabledSkills: [] }, 'token-1');
    expect(result.current.settings?.enabledSkills).toEqual([]);
  });

  it('turning a skill on adds it without dropping the others', async () => {
    fetchMock.mockResolvedValue(settings({ enabledSkills: ['a'] }));
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.setSkillEnabled('b', true);
    });

    expect(updateMock).toHaveBeenCalledWith(TARGET, { enabledSkills: ['a', 'b'] }, 'token-1');
  });

  it('keeps the switch where the server left it rather than where the click asked', async () => {
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setEnabled(false);
    });

    expect(setEnabledMock).toHaveBeenCalledWith(TARGET, false, 'token-1');
    expect(result.current.enabled).toBe(false);
  });

  it('surfaces a failed save and leaves the last known settings in place', async () => {
    updateMock.mockRejectedValue(new PluginSettingsError(503, 'Plugin installs are not enabled'));
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.setSkillEnabled('literature-review', false);
    });

    expect(result.current.error).toBe('Plugin installs are not enabled');
    expect(result.current.settings?.enabledSkills).toEqual(['literature-review']);
    expect(result.current.saving).toBe(false);
  });

  it('surfaces a failed load without pretending the plugin has no skills', async () => {
    fetchMock.mockRejectedValue(new PluginSettingsError(500, 'boom'));
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.settings).toBeNull();
    expect(result.current.error).not.toBeNull();
  });
});
