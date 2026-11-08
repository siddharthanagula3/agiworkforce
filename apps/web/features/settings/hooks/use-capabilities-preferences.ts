import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MANAGED_CLOUD_ORGANIZATION_HEADER,
  MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE,
  managedCloudPreferencesNamespacePath,
} from '@agiworkforce/cloud-contracts';
import {
  PreferenceVersionConflictError,
  readOwnedPreferences,
  saveOwnedPreferenceNamespace,
  type PreferenceOwner,
} from '@/app/settings/_lib/preferences-client';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { useSessionSnapshot } from '@/lib/identity/useSessionSnapshot';
import { useAccountWorkspaces } from '@/features/workspaces/hooks/use-workspaces';
import {
  observeWorkspaceOwner,
  workspaceOwnerIsCurrent,
} from '@/features/workspaces/lib/workspace-admission';
import { usePreferenceOwner, usePreferenceView } from './use-preference-owner';
import { resetMemoryCapabilityCache } from '@/lib/runtime/memory-capability';
import { useBillingStore } from '@shared/stores/web-auth-store';
import { toUserMessage } from '@/lib/user-error-message';

export interface CapabilitiesSettings {
  memory: boolean;
  generateFromHistory: boolean;
  allowToolAssistedGeneration: boolean;
  searchPastChats: boolean;
  includeSensitiveTopics: boolean;
  cloudCodeExecution: boolean;
}

type CapabilitiesPatch = Partial<CapabilitiesSettings>;

const CAPABILITIES_NAMESPACE = 'capabilities';

export const DEFAULT_CAPABILITIES_SETTINGS: CapabilitiesSettings = {
  memory: false,
  generateFromHistory: true,
  allowToolAssistedGeneration: false,
  searchPastChats: false,
  includeSensitiveTopics: false,
  cloudCodeExecution: true,
};

export interface UseCapabilitiesPreferencesResult {
  settings: CapabilitiesSettings;
  loaded: boolean;
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
  const owner = usePreferenceOwner();
  const capture = usePreferenceView(owner);
  const [settings, setSettings] = useState<CapabilitiesSettings>(DEFAULT_CAPABILITIES_SETTINGS);
  const [loadedOwner, setLoadedOwner] = useState<PreferenceOwner | null>(null);
  const [stateOwner, setStateOwner] = useState(owner);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [rejected, setRejected] = useState<CapabilitiesPatch | null>(null);
  const lane = useMemo(
    () =>
      Object.assign(
        {
          acknowledged: DEFAULT_CAPABILITIES_SETTINGS,
          version: null as string | null,
          latestChoice: 0,
          pending: {} as CapabilitiesPatch,
          queue: Promise.resolve(),
        },
        { binding: { owner } },
      ),
    [owner],
  );
  const workspace = useAccountWorkspaces();
  const captureSession = useSessionSnapshot();
  const workspaceOwner = observeWorkspaceOwner(captureSession());
  const epoch = workspaceOwner?.epoch;
  const scopeKey = workspaceOwner?.scopeKey;
  const workspaceData = workspace.data;
  const organization =
    workspaceData?.activeOrganizationId ?? MANAGED_CLOUD_PERSONAL_WORKSPACE_HEADER_VALUE;
  const policyCurrent = useCallback(
    () =>
      !!workspaceOwner &&
      epoch !== undefined &&
      workspaceOwner.phase === 'admitted' &&
      workspaceOwner.scopeKey === scopeKey &&
      !!workspaceData &&
      scopeKey ===
        JSON.stringify([
          workspaceData.scope,
          workspaceData.activeWorkspaceId,
          workspaceData.activeOrganizationId,
        ]) &&
      workspaceOwnerIsCurrent(workspaceOwner, epoch),
    [workspaceOwner, epoch, scopeKey, workspaceData],
  );
  const [policy, setPolicy] = useState<{ current: () => boolean; allowed: boolean } | null>(null);

  useEffect(() => {
    if (!workspaceOwner || !policyCurrent()) return;
    const currentView = capture();
    const authority = createRequestAuthority(
      workspaceOwner.session,
      () => currentView() && policyCurrent(),
    );
    void authority
      .fetch(managedCloudPreferencesNamespacePath(CAPABILITIES_NAMESPACE), {
        cache: 'no-store',
        headers: { [MANAGED_CLOUD_ORGANIZATION_HEADER]: organization },
      })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load workspace memory policy');
        const data = (await response.json()) as { organizationMemoryAllowed?: unknown };
        authority.assertCurrent();
        setPolicy({ current: policyCurrent, allowed: data.organizationMemoryAllowed === true });
      })
      .catch(() => {
        if (authority.isCurrent()) setPolicy({ current: policyCurrent, allowed: false });
      });
    return () => authority.retire();
  }, [workspaceOwner, policyCurrent, organization, capture, reloadKey]);

  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    const viewCurrent = capture();
    const current = () => !cancelled && viewCurrent();
    if (!current()) return;
    setStateOwner(owner);
    setLoadedOwner(null);
    setSaveError(null);
    setRejected(null);
    setSaving(false);
    setSavedAt(null);
    readOwnedPreferences(owner)
      .then((snapshot) => {
        if (!current()) return;
        const value = {
          ...DEFAULT_CAPABILITIES_SETTINGS,
          ...knownCapabilities(snapshot.settings[CAPABILITIES_NAMESPACE]),
        };
        lane.acknowledged = value;
        lane.version = snapshot.version;
        setSettings(value);
        setLoadedOwner(owner);
        setLoadError(null);
      })
      .catch((error) => {
        if (current()) {
          setLoadError(toUserMessage(error, 'Failed to load settings'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, owner, lane, capture]);

  const persist = useCallback(
    (patch: CapabilitiesPatch) => {
      if (!owner || loadedOwner !== owner) return;
      const current = capture();
      if (!current()) return;
      const choice = (lane.latestChoice += 1);
      lane.pending = { ...lane.pending, ...patch };
      setSettings((current) => ({ ...current, ...patch }));
      setSaving(true);
      setSaveError(null);
      setRejected(null);
      // One write at a time, and each write carries every choice made while the
      // one before it was in flight. Sending the changed keys rather than the
      // whole namespace is what stops a second tab's unrelated toggle from being
      // overwritten, and the revision precondition is what catches it when it is.
      lane.queue = lane.queue.then(async () => {
        if (!current()) return;
        const batch = lane.pending;
        lane.pending = {};
        if (Object.keys(batch).length === 0) {
          if (choice === lane.latestChoice) setSaving(false);
          return;
        }
        try {
          let result;
          try {
            result = await saveOwnedPreferenceNamespace(owner, CAPABILITIES_NAMESPACE, batch, {
              merge: true,
              expectedVersion: lane.version,
            });
          } catch (error) {
            if (!(error instanceof PreferenceVersionConflictError)) throw error;
            if (!current()) return;
            lane.acknowledged = { ...lane.acknowledged, ...knownCapabilities(error.settings) };
            result = await saveOwnedPreferenceNamespace(owner, CAPABILITIES_NAMESPACE, batch, {
              merge: true,
              expectedVersion: error.version,
            });
          }
          if (!current()) return;
          lane.version = result?.version ?? null;
          lane.acknowledged = { ...lane.acknowledged, ...batch };
          setSettings({ ...lane.acknowledged, ...lane.pending });
          resetMemoryCapabilityCache();
          if ('cloudCodeExecution' in batch) void useBillingStore.getState().refreshUser();
          setSavedAt(Date.now());
        } catch (error) {
          if (!current()) return;
          // The optimistic value has to go back to what the server acknowledged,
          // or the control keeps claiming a preference the account does not hold.
          setSettings(lane.acknowledged);
          setRejected(batch);
          setSaveError(toUserMessage(error, 'Failed to save settings'));
        } finally {
          if (current() && choice === lane.latestChoice) setSaving(false);
        }
      });
    },
    [owner, loadedOwner, lane, capture],
  );

  const setBoolean = useCallback(
    (key: keyof CapabilitiesSettings, value: boolean) => {
      persist({ [key]: value });
    },
    [persist],
  );

  const retry = useCallback(() => {
    if (capture()()) setReloadKey((value) => value + 1);
  }, [capture]);

  const retrySave = useCallback(() => {
    if (rejected) persist(rejected);
  }, [rejected, persist]);

  return {
    settings:
      loadedOwner === owner && owner?.isCurrent() ? settings : DEFAULT_CAPABILITIES_SETTINGS,
    loaded: loadedOwner === owner && owner?.isCurrent() === true,
    organizationMemoryAllowed: policy?.current() === true && policy.allowed,
    saving: stateOwner === owner && saving,
    saveError: stateOwner === owner ? saveError : null,
    savedAt: stateOwner === owner ? savedAt : null,
    loadError: stateOwner === owner ? loadError : null,
    retry,
    retrySave: stateOwner === owner && rejected ? retrySave : null,
    setBoolean,
  };
}
