'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PluginInstallationSettings } from '@agiworkforce/cloud-contracts';

import { getCsrfToken } from '@/lib/client/csrf';
import {
  fetchPluginSettings,
  setPluginInstallationEnabled,
  updatePluginSettings,
  PLUGIN_ENABLE_FAILED_COPY,
  PLUGIN_SETTINGS_LOAD_FAILED_COPY,
  PLUGIN_SETTINGS_SAVE_FAILED_COPY,
  PluginSettingsError,
} from '../client/installation-settings';
import { pluginTargetKey, type PluginInstallationTarget } from '../routes';

export interface PluginsSettingsAdapter {
  settings: PluginInstallationSettings | null;
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  setSkillEnabled: (skill: string, enabled: boolean) => Promise<void>;
  setExamplePrompts: (prompts: readonly string[] | null) => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  reload: () => Promise<void>;
}

function messageOf(caught: unknown, fallback: string): string {
  return caught instanceof PluginSettingsError ? caught.message : fallback;
}

export function usePluginsSettingsAdapter(
  target: PluginInstallationTarget | null,
  installedEnabled = true,
): PluginsSettingsAdapter {
  const [settings, setSettings] = useState<PluginInstallationSettings | null>(null);
  const [enabled, setEnabledState] = useState(installedEnabled);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const targetRef = useRef<PluginInstallationTarget | null>(target);
  targetRef.current = target;
  const key = target ? pluginTargetKey(target) : null;

  useEffect(() => {
    setEnabledState(installedEnabled);
  }, [installedEnabled, key]);

  const load = useCallback(async () => {
    const current = targetRef.current;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    if (!current) {
      setSettings(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPluginSettings(current);
      if (seq !== requestSeq.current) return;
      setSettings(next);
    } catch (caught: unknown) {
      if (seq !== requestSeq.current) return;
      setSettings(null);
      setError(messageOf(caught, PLUGIN_SETTINGS_LOAD_FAILED_COPY));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [key, load]);

  const save = useCallback(async (patch: Parameters<typeof updatePluginSettings>[1]) => {
    const current = targetRef.current;
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      setSettings(await updatePluginSettings(current, patch, await getCsrfToken()));
    } catch (caught: unknown) {
      setError(messageOf(caught, PLUGIN_SETTINGS_SAVE_FAILED_COPY));
    } finally {
      setSaving(false);
    }
  }, []);

  const setSkillEnabled = useCallback(
    async (skill: string, next: boolean) => {
      const current = settings;
      if (!current) return;
      const chosen = new Set(current.enabledSkills);
      if (next) chosen.add(skill);
      else chosen.delete(skill);
      await save({ enabledSkills: [...chosen] });
    },
    [settings, save],
  );

  const setExamplePrompts = useCallback(
    async (prompts: readonly string[] | null) => {
      await save({ customExamplePrompts: prompts === null ? null : [...prompts] });
    },
    [save],
  );

  const setEnabled = useCallback(async (next: boolean) => {
    const current = targetRef.current;
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      setEnabledState(await setPluginInstallationEnabled(current, next, await getCsrfToken()));
    } catch (caught: unknown) {
      setError(messageOf(caught, PLUGIN_ENABLE_FAILED_COPY));
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    settings,
    enabled,
    loading,
    saving,
    error,
    setSkillEnabled,
    setExamplePrompts,
    setEnabled,
    reload: load,
  };
}
