/**
 * ComputerUseSettings
 *
 * Settings panel for Computer Use capabilities:
 * - Enable/disable toggle with consent dialog gate
 * - Per-app permission registry (Stream 1: backed by Tauri
 *   `app_permissions_*` commands, persists across sessions)
 * - Model picker for the OPA planner (Stream 2: lets user pick any
 *   vision-capable model — Anthropic, OpenAI, Google, xAI — instead of
 *   being locked to a single provider)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Lock, Monitor, RefreshCcw, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/ui/Button';
import { Switch } from '@/ui/Switch';
import { invoke } from '@/lib/tauri-mock';
import {
  useComputerUseStore,
  selectComputerUseEnabled,
  selectConsentAccepted,
} from '@/stores/computerUseStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { ComputerUseConsentDialog } from './ComputerUseConsentDialog';
import { getAllModels } from '@/constants/llm';
import { STORAGE_KEYS } from '../../constants/storageKeys';

type PermissionStatus = 'allowed' | 'denied' | 'ask_every_time';

interface AppPermissionEntry {
  app_name: string;
  bundle_id?: string | null;
  status: PermissionStatus;
  granted_at?: string | null;
  denied_at?: string | null;
}

interface ActiveWindowInfo {
  app_name: string;
  window_title: string;
  bundle_id?: string | null;
}

const AUTO_OPTION = {
  id: '',
  label: 'Auto (router default)',
  provider: '',
  description:
    "Let the router pick — typically your default vision model. Best for users who haven't customized their setup.",
};

const COMPUTER_USE_MODEL_OPTIONS: Array<{
  id: string;
  label: string;
  provider: string;
  description: string;
}> = [
  AUTO_OPTION,
  ...getAllModels()
    .filter((m) => m.capabilities.computerUse && !m.deprecated && m.provider !== 'managed_cloud')
    .map((m) => ({
      id: m.id,
      label: m.name,
      provider: m.provider,
      description: m.bestFor.join(', ') || m.name,
    })),
];

export function ComputerUseSettings() {
  const computerUseEnabled = useComputerUseStore(selectComputerUseEnabled);
  const consentAccepted = useComputerUseStore(selectConsentAccepted);

  const setComputerUseEnabled = useComputerUseStore((s) => s.setComputerUseEnabled);
  const setConsentAccepted = useComputerUseStore((s) => s.setConsentAccepted);

  const showComputerUseOverlay = useSettingsStore(
    (s) => s.executionPreferences.showComputerUseOverlay,
  );
  const setShowComputerUseOverlay = useSettingsStore((s) => s.setShowComputerUseOverlay);

  const [consentDialogOpen, setConsentDialogOpen] = useState(false);

  const [permissions, setPermissions] = useState<AppPermissionEntry[]>([]);
  const [alwaysBlocked, setAlwaysBlocked] = useState<string[]>([]);
  const [activeWindow, setActiveWindow] = useState<ActiveWindowInfo | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  const [computerUseModel, setComputerUseModel] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(STORAGE_KEYS.COMPUTER_USE_MODEL) ?? '';
  });
  const [computerUseProvider, setComputerUseProvider] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(STORAGE_KEYS.COMPUTER_USE_PROVIDER) ?? '';
  });

  const refreshPermissions = useCallback(async () => {
    setPermissionsLoading(true);
    try {
      const list = await invoke<AppPermissionEntry[]>('app_permissions_list');
      setPermissions(list);
    } catch (err) {
      console.warn('[ComputerUseSettings] Failed to list app permissions:', err);
    } finally {
      setPermissionsLoading(false);
    }
  }, []);

  const refreshActiveWindow = useCallback(async () => {
    try {
      const win = await invoke<ActiveWindowInfo | null>('app_permissions_active_window');
      setActiveWindow(win);
    } catch (err) {
      console.warn('[ComputerUseSettings] Failed to read active window:', err);
    }
  }, []);

  useEffect(() => {
    if (!computerUseEnabled) return;
    void refreshPermissions();
    invoke<string[]>('app_permissions_always_blocked')
      .then(setAlwaysBlocked)
      .catch((err) => {
        console.warn('[ComputerUseSettings] Failed to load always-blocked list:', err);
      });
  }, [computerUseEnabled, refreshPermissions]);

  const handleSetPermission = useCallback(
    async (appName: string, bundleId: string | undefined, status: PermissionStatus) => {
      try {
        await invoke('app_permissions_set', {
          appName,
          bundleId: bundleId ?? null,
          status,
        });
        toast.success(`${appName}: ${status.replace('_', ' ')}`);
        await refreshPermissions();
      } catch (err) {
        toast.error(`Failed to update ${appName}: ${String(err)}`);
      }
    },
    [refreshPermissions],
  );

  const handleRemovePermission = useCallback(
    async (appName: string) => {
      try {
        await invoke('app_permissions_remove', { appName });
        await refreshPermissions();
      } catch (err) {
        toast.error(`Failed to remove ${appName}: ${String(err)}`);
      }
    },
    [refreshPermissions],
  );

  const handleApproveActiveWindow = useCallback(
    async (status: PermissionStatus) => {
      if (!activeWindow) {
        toast.error('No active window detected. Click "Refresh" first.');
        return;
      }
      await handleSetPermission(activeWindow.app_name, activeWindow.bundle_id ?? undefined, status);
    },
    [activeWindow, handleSetPermission],
  );

  const handleSelectComputerUseModel = useCallback((modelId: string) => {
    setComputerUseModel(modelId);
    const opt = COMPUTER_USE_MODEL_OPTIONS.find((m) => m.id === modelId);
    const providerId = opt?.provider ?? '';
    setComputerUseProvider(providerId);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEYS.COMPUTER_USE_MODEL, modelId);
      window.localStorage.setItem(STORAGE_KEYS.COMPUTER_USE_PROVIDER, providerId);
    }
    toast.success(
      modelId
        ? `Computer use will use ${opt?.label ?? modelId}`
        : 'Computer use reset to router default',
    );
  }, []);

  const groupedPermissions = useMemo(() => {
    const allowed = permissions.filter((p) => p.status === 'allowed');
    const denied = permissions.filter((p) => p.status === 'denied');
    const ask = permissions.filter((p) => p.status === 'ask_every_time');
    return { allowed, denied, ask };
  }, [permissions]);

  const handleToggle = useCallback(
    (enabled: boolean) => {
      if (enabled && !consentAccepted) {
        setConsentDialogOpen(true);
        return;
      }
      setComputerUseEnabled(enabled);
      if (!enabled) {
        toast.info('Computer use disabled. This computer will ask again before the next action.');
      }
    },
    [consentAccepted, setComputerUseEnabled],
  );

  const handleConsentAccept = useCallback(() => {
    setConsentAccepted(true);
    setComputerUseEnabled(true);
    setConsentDialogOpen(false);
    toast.success('Computer use enabled');
  }, [setConsentAccepted, setComputerUseEnabled]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Computer Use</h3>
            <p className="text-sm text-muted-foreground">
              Let the agent control your mouse, keyboard, and take screenshots. This computer asks
              once per app session before the first action; turning this off withdraws it
              immediately.
            </p>
          </div>
        </div>
        <Switch
          checked={computerUseEnabled}
          onCheckedChange={handleToggle}
          aria-label="Enable computer use"
        />
      </div>

      {computerUseEnabled && (
        <>
          {/* Safety: on-screen action overlay */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Show Action Overlay</h4>
                <p className="text-xs text-muted-foreground">
                  Draws click, typing, and region markers over your screen and on the live preview
                  while the agent works. Turn it off for screen sharing or recording.
                </p>
              </div>
              <Switch
                checked={showComputerUseOverlay}
                onCheckedChange={setShowComputerUseOverlay}
                aria-label="Show action overlay"
              />
            </div>
          </div>

          {/* Stream 2: Computer-use model picker */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div>
              <h4 className="font-semibold text-sm flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                Planning Model
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose the vision-capable model that drives the Observe-Plan-Act loop.
                Multi-provider parity vs Claude Cowork's Anthropic-only mode.
              </p>
            </div>
            <div className="space-y-2">
              {COMPUTER_USE_MODEL_OPTIONS.map((option) => (
                <button
                  key={option.id || 'auto'}
                  type="button"
                  onClick={() => handleSelectComputerUseModel(option.id)}
                  className={cn(
                    'w-full text-left rounded-md border px-3 py-2.5 transition-colors',
                    computerUseModel === option.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-muted/10 hover:bg-muted/20',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{option.label}</span>
                      {option.provider && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {option.provider}
                        </span>
                      )}
                    </div>
                    {computerUseModel === option.id && (
                      <span className="text-xs text-primary font-medium">Selected</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                </button>
              ))}
            </div>
            {computerUseProvider && (
              <p className="text-xs text-muted-foreground italic">
                Provider override:{' '}
                <code className="bg-muted px-1 py-0.5 rounded">{computerUseProvider}</code>
              </p>
            )}
          </div>

          {/* Stream 1: Per-app permissions registry */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Per-App Permissions
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allow / block / ask per application. The agent consults this registry on every
                  action — apps not in the list trigger an approval prompt on first use.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refreshPermissions();
                  void refreshActiveWindow();
                }}
                disabled={permissionsLoading}
              >
                <RefreshCcw
                  className={cn('mr-1 h-3.5 w-3.5', permissionsLoading && 'animate-spin')}
                />
                Refresh
              </Button>
            </div>

            {/* Active window quick-approve panel */}
            {activeWindow && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">Currently focused:</p>
                    <p className="text-sm font-semibold truncate">
                      {activeWindow.app_name}
                      {activeWindow.bundle_id && (
                        <span className="text-xs text-muted-foreground font-normal ml-1.5">
                          ({activeWindow.bundle_id})
                        </span>
                      )}
                    </p>
                    {activeWindow.window_title && (
                      <p className="text-xs text-muted-foreground truncate">
                        {activeWindow.window_title}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApproveActiveWindow('allowed')}
                    >
                      Allow
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleApproveActiveWindow('denied')}
                    >
                      Block
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Allowed list */}
            {groupedPermissions.allowed.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Allowed
                </p>
                {groupedPermissions.allowed.map((p) => (
                  <PermissionRow
                    key={p.app_name}
                    entry={p}
                    onSetStatus={(status) =>
                      handleSetPermission(p.app_name, p.bundle_id ?? undefined, status)
                    }
                    onRemove={() => handleRemovePermission(p.app_name)}
                  />
                ))}
              </div>
            )}

            {/* Denied list */}
            {groupedPermissions.denied.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                  <Ban className="h-3 w-3" /> Blocked
                </p>
                {groupedPermissions.denied.map((p) => (
                  <PermissionRow
                    key={p.app_name}
                    entry={p}
                    onSetStatus={(status) =>
                      handleSetPermission(p.app_name, p.bundle_id ?? undefined, status)
                    }
                    onRemove={() => handleRemovePermission(p.app_name)}
                  />
                ))}
              </div>
            )}

            {/* Ask list */}
            {groupedPermissions.ask.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  Ask every time
                </p>
                {groupedPermissions.ask.map((p) => (
                  <PermissionRow
                    key={p.app_name}
                    entry={p}
                    onSetStatus={(status) =>
                      handleSetPermission(p.app_name, p.bundle_id ?? undefined, status)
                    }
                    onRemove={() => handleRemovePermission(p.app_name)}
                  />
                ))}
              </div>
            )}

            {permissions.length === 0 && (
              <p className="text-xs text-muted-foreground italic">
                No app permissions configured yet. The agent will request approval for each new app
                on first encounter.
              </p>
            )}
          </div>

          {/* Stream 1: Always-blocked refuse-list (read-only) */}
          {alwaysBlocked.length > 0 && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-5 space-y-3">
              <div>
                <h4 className="font-semibold text-sm flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Lock className="h-4 w-4" />
                  Always Blocked (cannot be overridden)
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Investment, brokerage, crypto, and banking apps are hardcoded as blocked at the
                  agent level — matching Claude Cowork's hard-blocked categories.{' '}
                  {alwaysBlocked.length} bundle IDs are on this list.
                </p>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Show full list
                </summary>
                <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto pr-1">
                  {alwaysBlocked.map((id) => (
                    <li
                      key={id}
                      className="flex items-center gap-2 px-2 py-1 rounded bg-muted/30 font-mono text-[11px]"
                    >
                      <Ban className="h-3 w-3 text-red-500 shrink-0" />
                      {id}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </>
      )}

      <ComputerUseConsentDialog
        open={consentDialogOpen}
        onOpenChange={setConsentDialogOpen}
        onAccept={handleConsentAccept}
      />
    </div>
  );
}

function PermissionRow({
  entry,
  onSetStatus,
  onRemove,
}: {
  entry: AppPermissionEntry;
  onSetStatus: (status: PermissionStatus) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{entry.app_name}</p>
        {entry.bundle_id && (
          <p className="text-[11px] text-muted-foreground font-mono truncate">{entry.bundle_id}</p>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        {entry.status !== 'allowed' && (
          <Button variant="outline" size="sm" onClick={() => onSetStatus('allowed')}>
            Allow
          </Button>
        )}
        {entry.status !== 'denied' && (
          <Button variant="outline" size="sm" onClick={() => onSetStatus('denied')}>
            Block
          </Button>
        )}
        {entry.status !== 'ask_every_time' && (
          <Button variant="outline" size="sm" onClick={() => onSetStatus('ask_every_time')}>
            Ask
          </Button>
        )}
        <button
          onClick={onRemove}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
          aria-label={`Remove ${entry.app_name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
