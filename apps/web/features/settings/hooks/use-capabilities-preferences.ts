import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PreferenceVersionConflictError,
  fetchPreferenceNamespace,
  readOrganizationMemoryAllowed,
  readPreferencesVersion,
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

type CapabilitiesPatch = Partial<CapabilitiesSettings>;

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
  organizationMemoryAllowed: boolean;
  saving: boolean;
  saveError: string | null;
  savedAt: number | null;
  loadError: string | null;
  retry: () => void;
  retrySave: (() => void) | null;
  setBoolean: (key: keyof CapabilitiesSettings, value: boolean) => void;
}

function knownCapabilities(value: unknown): CapabilitiesPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const patch: CapabilitiesPatch = {};
  for (const key of Object.keys(DEFAULT_CAPABILITIES_SETTINGS) as Array<
    keyof CapabilitiesSettings
  >) {
    if (typeof source[key] === 'boolean') patch[key] = source[key];
  }
  return patch;
}

export function useCapabilitiesPreferences(): UseCapabilitiesPreferencesResult {
  const [settings, setSettings] = useState<CapabilitiesSettings>(DEFAULT_CAPABILITIES_SETTINGS);
  const [organizationMemoryAllowed, setOrganizationMemoryAllowed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rejected, setRejected] = useState<CapabilitiesPatch | null>(null);
  const acknowledged = useRef<CapabilitiesSettings>(DEFAULT_CAPABILITIES_SETTINGS);
  const storedVersion = useRef<string | null>(null);
  const latestChoice = useRef(0);
  const pending = useRef<CapabilitiesPatch>({});
  const writeQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    fetchPreferenceNamespace<CapabilitiesSettings>(
      CAPABILITIES_NAMESPACE,
      DEFAULT_CAPABILITIES_SETTINGS,
    )
      .then(async (value) => {
        if (cancelled) return;
        acknowledged.current = value;
        setSettings(value);
        setLoadError(null);
        storedVersion.current = await readPreferencesVersion().catch(() => null);
        setOrganizationMemoryAllowed(await readOrganizationMemoryAllowed().catch(() => true));
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

  const persist = useCallback((patch: CapabilitiesPatch) => {
    const choice = (latestChoice.current += 1);
    pending.current = { ...pending.current, ...patch };
    setSettings((current) => ({ ...current, ...patch }));
    setSaving(true);
    setSaveError(null);
    setRejected(null);
    // One write at a time, and each write carries every choice made while the
    // one before it was in flight. Sending the changed keys rather than the
    // whole namespace is what stops a second tab's unrelated toggle from being
    // overwritten, and the revision precondition is what catches it when it is.
    writeQueue.current = writeQueue.current.then(async () => {
      const batch = pending.current;
      pending.current = {};
      if (Object.keys(batch).length === 0) {
        if (choice === latestChoice.current) setSaving(false);
        return;
      }
      try {
        let result;
        try {
          result = await savePreferenceNamespace(CAPABILITIES_NAMESPACE, batch, {
            merge: true,
            expectedVersion: storedVersion.current,
          });
        } catch (error) {
          if (!(error instanceof PreferenceVersionConflictError)) throw error;
          acknowledged.current = { ...acknowledged.current, ...knownCapabilities(error.settings) };
          result = await savePreferenceNamespace(CAPABILITIES_NAMESPACE, batch, {
            merge: true,
            expectedVersion: error.version,
          });
        }
        storedVersion.current = result?.version ?? null;
        acknowledged.current = { ...acknowledged.current, ...batch };
        setSettings(acknowledged.current);
        resetMemoryCapabilityCache();
        setSavedAt(Date.now());
      } catch (error) {
        // The optimistic value has to go back to what the server acknowledged,
        // or the control keeps claiming a preference the account does not hold.
        setSettings(acknowledged.current);
        setRejected(batch);
        setSaveError(toUserMessage(error, 'Failed to save settings'));
      } finally {
        if (choice === latestChoice.current) setSaving(false);
      }
    });
  }, []);

  const setBoolean = useCallback(
    (key: keyof CapabilitiesSettings, value: boolean) => {
      persist({ [key]: value });
    },
    [persist],
  );

  const retry = useCallback(() => setReloadKey((value) => value + 1), []);

  const retrySave = useCallback(() => {
    if (rejected) persist(rejected);
  }, [rejected, persist]);

  return {
    settings,
    organizationMemoryAllowed,
    saving,
    saveError,
    savedAt,
    loadError,
    retry,
    retrySave: rejected ? retrySave : null,
    setBoolean,
  };
}
