import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginInstallationSettings } from '@agiworkforce/cloud-contracts';
type ScanModule0 = typeof import('../../client/installation-settings');

const { fetchMock, updateMock, setEnabledMock, csrfMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  updateMock: vi.fn(),
  setEnabledMock: vi.fn(),
  csrfMock: vi.fn(),
}));

vi.mock('@/lib/client/csrf', () => ({ getCsrfToken: csrfMock }));
vi.mock('../../client/installation-settings', async () => {
  const actual = await vi.importActual<ScanModule0>('../../client/installation-settings');
  return {
    ...actual,
    fetchPluginSettings: fetchMock,
    updatePluginSettings: updateMock,
    setPluginInstallationEnabled: setEnabledMock,
  };
});

import { PluginDependentsError, PluginSettingsError } from '../../client/installation-settings';
import { PLUGIN_TARGET_BUILTIN } from '../../routes';
import { usePluginsSettingsAdapter } from '../use-plugins-settings-adapter';

const TARGET = { kind: PLUGIN_TARGET_BUILTIN, pluginId: 'research-pack' } as const;
const OTHER_TARGET = { kind: PLUGIN_TARGET_BUILTIN, pluginId: 'review-kit' } as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

    expect(setEnabledMock).toHaveBeenCalledWith(TARGET, false, 'token-1', false);
    expect(result.current.enabled).toBe(false);
  });

  it('hands a dependents refusal to the caller instead of showing it as an error', async () => {
    setEnabledMock.mockRejectedValue(
      new PluginDependentsError('Needed.', [{ id: 'review-kit', name: 'Review Kit' }]),
    );
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.setEnabled(false)).rejects.toBeInstanceOf(PluginDependentsError);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.enabled).toBe(true);
  });

  it('asks the server to turn the dependents off too when told to', async () => {
    const { result } = renderHook(() => usePluginsSettingsAdapter(TARGET, true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.setEnabled(false, true);
    });

    expect(setEnabledMock).toHaveBeenCalledWith(TARGET, false, 'token-1', true);
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

  describe('when the viewed plugin changes while a write is pending', () => {
    function renderWithSwitch() {
      fetchMock.mockImplementation(async (target: { pluginId: string }) =>
        target.pluginId === OTHER_TARGET.pluginId
          ? settings({ pluginId: 'review-kit', enabledSkills: ['summarize'] })
          : settings(),
      );
      return renderHook(
        ({ target }: { target: typeof TARGET | typeof OTHER_TARGET }) =>
          usePluginsSettingsAdapter(target),
        { initialProps: { target: TARGET as typeof TARGET | typeof OTHER_TARGET } },
      );
    }

    it('does not publish the earlier plugin settings over the plugin now viewed', async () => {
      const pending = deferred<PluginInstallationSettings>();
      updateMock.mockReturnValue(pending.promise);
      const { result, rerender } = renderWithSwitch();
      await waitFor(() => expect(result.current.settings).not.toBeNull());

      let save!: Promise<void>;
      act(() => {
        save = result.current.setSkillEnabled('literature-review', false);
      });
      await waitFor(() => expect(updateMock).toHaveBeenCalled());

      rerender({ target: OTHER_TARGET });
      await waitFor(() => expect(result.current.settings?.pluginId).toBe('review-kit'));

      await act(async () => {
        pending.resolve(settings({ enabledSkills: [] }));
        await save;
      });

      expect(result.current.settings?.pluginId).toBe('review-kit');
      expect(result.current.settings?.enabledSkills).toEqual(['summarize']);
      expect(result.current.saving).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('does not show the earlier plugin save failure on the plugin now viewed', async () => {
      const pending = deferred<PluginInstallationSettings>();
      updateMock.mockReturnValue(pending.promise);
      const { result, rerender } = renderWithSwitch();
      await waitFor(() => expect(result.current.settings).not.toBeNull());

      let save!: Promise<void>;
      act(() => {
        save = result.current.setSkillEnabled('literature-review', false);
      });
      await waitFor(() => expect(updateMock).toHaveBeenCalled());

      rerender({ target: OTHER_TARGET });
      await waitFor(() => expect(result.current.settings?.pluginId).toBe('review-kit'));

      await act(async () => {
        pending.reject(new PluginSettingsError(503, 'Plugin installs are not enabled'));
        await save;
      });

      expect(result.current.error).toBeNull();
      expect(result.current.saving).toBe(false);
      expect(result.current.settings?.enabledSkills).toEqual(['summarize']);
    });

    it('does not apply the earlier plugin enabled state to the plugin now viewed', async () => {
      const pending = deferred<boolean>();
      setEnabledMock.mockReturnValue(pending.promise);
      const { result, rerender } = renderWithSwitch();
      await waitFor(() => expect(result.current.loading).toBe(false));

      let toggle!: Promise<void>;
      act(() => {
        toggle = result.current.setEnabled(false);
      });
      await waitFor(() => expect(setEnabledMock).toHaveBeenCalled());

      rerender({ target: OTHER_TARGET });
      await waitFor(() => expect(result.current.settings?.pluginId).toBe('review-kit'));

      await act(async () => {
        pending.resolve(false);
        await toggle;
      });

      expect(result.current.enabled).toBe(true);
      expect(result.current.saving).toBe(false);
    });

    it('withholds the earlier plugin settings until the new plugin has loaded', async () => {
      const pendingLoad = deferred<PluginInstallationSettings>();
      const { result, rerender } = renderWithSwitch();
      await waitFor(() => expect(result.current.settings?.pluginId).toBe('research-pack'));

      fetchMock.mockReturnValue(pendingLoad.promise);
      rerender({ target: OTHER_TARGET });

      expect(result.current.settings).toBeNull();
    });
  });
});
