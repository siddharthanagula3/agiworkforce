import { useCallback, useEffect, useState } from 'react';
import {
  fetchPreferenceNamespace,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';
import { resetMemoryCapabilityCache } from '@/lib/runtime/memory-capability';
import { toUserMessage } from '@/lib/user-error-message';

export interface CapabilitiesSettings {
  memory: boolean;
  generateFromHistory: boolean;
  allowToolAssistedGeneration: boolean;
  searchPastChats: boolean;
  cloudCodeExecution: boolean;
}

const CAPABILITIES_NAMESPACE = 'capabilities';

export const DEFAULT_CAPABILITIES_SETTINGS: CapabilitiesSettings = {
  memory: false,
  generateFromHistory: true,
  allowToolAssistedGeneration: false,
  searchPastChats: false,
  cloudCodeExecution: true,
};

export interface UseCapabilitiesPreferencesResult {
  settings: CapabilitiesSettings;
  saving: boolean;
  saveError: string | null;
  savedAt: number | null;
  loadError: string | null;
  retry: () => void;
  setBoolean: (key: keyof CapabilitiesSettings, value: boolean) => void;
}

export function useCapabilitiesPreferences(): UseCapabilitiesPreferencesResult {
  const [settings, setSettings] = useState<CapabilitiesSettings>(DEFAULT_CAPABILITIES_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<CapabilitiesSettings>(
      CAPABILITIES_NAMESPACE,
      DEFAULT_CAPABILITIES_SETTINGS,
    )
      .then((value) => {
        if (cancelled) return;
        setSettings(value);
        setLoadError(null);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(toUserMessage(error, 'Failed to load settings'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const persist = useCallback(async (next: CapabilitiesSettings) => {
    setSettings(next);
    setSaving(true);
    setSaveError(null);
    try {
      await savePreferenceNamespace(CAPABILITIES_NAMESPACE, next);
      resetMemoryCapabilityCache();
      setSavedAt(Date.now());
    } catch (error) {
      setSaveError(toUserMessage(error, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  }, []);

  const setBoolean = useCallback(
    (key: keyof CapabilitiesSettings, value: boolean) => {
      void persist({ ...settings, [key]: value });
    },
    [settings, persist],
  );

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  return { settings, saving, saveError, savedAt, loadError, retry, setBoolean };
}
