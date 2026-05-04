/**
 * ComputerUseSettings
 *
 * Settings panel for Computer Use capabilities:
 * - Enable/disable toggle with consent dialog gate
 * - Allowed / denied app lists with add/remove
 * - Hide-apps-on-task safety toggle
 * - Per-app permission registry (Stream 1: backed by Tauri
 *   `app_permissions_*` commands, persists across sessions)
 * - Model picker for the OPA planner (Stream 2: lets user pick any
 *   vision-capable model — Anthropic, OpenAI, Google, xAI — instead of
 *   being locked to a single provider)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Lock, Monitor, Plus, RefreshCcw, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { invoke } from '@/lib/tauri-mock';
import {
  useComputerUseStore,
  selectComputerUseEnabled,
  selectConsentAccepted,
  selectAllowedApps,
  selectDeniedApps,
  selectHideAppsOnTask,
} from '@/stores/computerUseStore';
import { ComputerUseConsentDialog } from './ComputerUseConsentDialog';

// Backend types — mirror Rust definitions.
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

// Stream 2: curated computer-use vision model picks. IDs come from
// packages/types/src/models.json — we only display labels and route the
// raw catalog id back to Rust. The Rust router resolves provider from
// the id when `provider` is `null`.
const COMPUTER_USE_MODEL_OPTIONS: Array<{
  id: string;
  label: string;
  provider: string;
  description: string;
}> = [
  {
    id: '',
    label: 'Auto (router default)',
    provider: '',
    description:
      "Let the router pick — typically your default vision model. Best for users who haven't customized their setup.",
  },
  {
    id: 'claude-opus-4.7',
    label: 'Claude Opus 4.7',
    provider: 'anthropic',
    description:
      "Anthropic's flagship — has native computer-use beta support. Best per-action accuracy on macOS / Windows.",
  },
  {
    id: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    description:
      'Faster Claude tier with computer-use beta. Lower latency than Opus, similar quality on simple tasks.',
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'openai',
    description:
      "OpenAI's vision-capable flagship. Uses generic JSON action protocol (no native computer-use API yet).",
  },
  {
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    provider: 'google',
    description:
      "Google's strongest multimodal model. Strong UI element detection; cheaper than Claude / GPT for screenshot-heavy loops.",
  },
  {
    id: 'grok-4.3-vision',
    label: 'Grok 4.3 Vision',
    provider: 'xai',
    description:
      "xAI's multimodal tier — newest of the four. Use when you want diversity from the OpenAI/Anthropic/Google trio.",
  },
];

export function ComputerUseSettings() {
  const computerUseEnabled = useComputerUseStore(selectComputerUseEnabled);
  const consentAccepted = useComputerUseStore(selectConsentAccepted);
  const allowedApps = useComputerUseStore(selectAllowedApps);
  const deniedApps = useComputerUseStore(selectDeniedApps);
  const hideAppsOnTask = useComputerUseStore(selectHideAppsOnTask);

  const setComputerUseEnabled = useComputerUseStore((s) => s.setComputerUseEnabled);
  const setConsentAccepted = useComputerUseStore((s) => s.setConsentAccepted);
  const addAllowedApp = useComputerUseStore((s) => s.addAllowedApp);
  const removeAllowedApp = useComputerUseStore((s) => s.removeAllowedApp);
  const addDeniedApp = useComputerUseStore((s) => s.addDeniedApp);
  const removeDeniedApp = useComputerUseStore((s) => s.removeDeniedApp);
  const setHideAppsOnTask = useComputerUseStore((s) => s.setHideAppsOnTask);

  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [allowedAppInput, setAllowedAppInput] = useState('');
  const [deniedAppInput, setDeniedAppInput] = useState('');
  const [showAllowedInput, setShowAllowedInput] = useState(false);
  const [showDeniedInput, setShowDeniedInput] = useState(false);

  // Stream 1: per-app permissions (backed by Tauri commands)
  const [permissions, setPermissions] = useState<AppPermissionEntry[]>([]);
  const [alwaysBlocked, setAlwaysBlocked] = useState<string[]>([]);
  const [activeWindow, setActiveWindow] = useState<ActiveWindowInfo | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(false);

  // Stream 2: computer-use model selection (persisted in localStorage; passed
  // to executeOpaTask on next run)
  const [computerUseModel, setComputerUseModel] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('computerUse.model') ?? '';
  });
  const [computerUseProvider, setComputerUseProvider] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem('computerUse.provider') ?? '';
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

  // Initial load: registry + always-blocked list. Active window is fetched
  // on demand because hitting AppleScript on every render is expensive.
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
      window.localStorage.setItem('computerUse.model', modelId);
      window.localStorage.setItem('computerUse.provider', providerId);
    }
    toast.success(
      modelId
        ? `Computer use will use ${opt?.label ?? modelId}`
        : 'Computer use reset to router default',
    );
  }, []);

  // Group permissions by status for nicer rendering.
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
        toast.info('Computer use disabled');
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

  const handleAddAllowedApp = useCallback(() => {
    const name = allowedAppInput.trim();
    if (!name) return;
    addAllowedApp(name);
    setAllowedAppInput('');
    setShowAllowedInput(false);
  }, [allowedAppInput, addAllowedApp]);

  const handleAddDeniedApp = useCallback(() => {
    const name = deniedAppInput.trim();
    if (!name) return;
    addDeniedApp(name);
    setDeniedAppInput('');
    setShowDeniedInput(false);
  }, [deniedAppInput, addDeniedApp]);

  const handleAllowedKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleAddAllowedApp();
      } else if (e.key === 'Escape') {
        setShowAllowedInput(false);
        setAllowedAppInput('');
      }
    },
    [handleAddAllowedApp],
  );

  const handleDeniedKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleAddDeniedApp();
      } else if (e.key === 'Escape') {
        setShowDeniedInput(false);
        setDeniedAppInput('');
      }
    },
    [handleAddDeniedApp],
  );

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
              Let the agent control your mouse, keyboard, and take screenshots.
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
          {/* Allowed Apps */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-500" />
                  Allowed Apps
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Apps the agent is permitted to interact with.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllowedInput(true)}
                className={cn(showAllowedInput && 'hidden')}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add app
              </Button>
            </div>

            {showAllowedInput && (
              <div className="flex items-center gap-2">
                <Input
                  value={allowedAppInput}
                  onChange={(e) => setAllowedAppInput(e.target.value)}
                  onKeyDown={handleAllowedKeyDown}
                  placeholder="Application name (e.g. Safari)"
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={handleAddAllowedApp} disabled={!allowedAppInput.trim()}>
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAllowedInput(false);
                    setAllowedAppInput('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {(allowedApps as string[]).length > 0 ? (
              <ul className="space-y-1">
                {(allowedApps as string[]).map((app: string) => (
                  <li
                    key={app}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <span>{app}</span>
                    <button
                      onClick={() => removeAllowedApp(app)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${app}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No apps added yet. The agent will request approval for each app.
              </p>
            )}
          </div>

          {/* Denied Apps */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-red-500" />
                  Denied Apps
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Apps the agent is never allowed to interact with.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeniedInput(true)}
                className={cn(showDeniedInput && 'hidden')}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add app
              </Button>
            </div>

            {showDeniedInput && (
              <div className="flex items-center gap-2">
                <Input
                  value={deniedAppInput}
                  onChange={(e) => setDeniedAppInput(e.target.value)}
                  onKeyDown={handleDeniedKeyDown}
                  placeholder="Application name (e.g. Terminal)"
                  className="flex-1"
                  autoFocus
                />
                <Button size="sm" onClick={handleAddDeniedApp} disabled={!deniedAppInput.trim()}>
                  Add
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowDeniedInput(false);
                    setDeniedAppInput('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}

            {(deniedApps as string[]).length > 0 ? (
              <ul className="space-y-1">
                {(deniedApps as string[]).map((app: string) => (
                  <li
                    key={app}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <span>{app}</span>
                    <button
                      onClick={() => removeDeniedApp(app)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${app}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No denied apps. Add apps here to always block the agent from using them.
              </p>
            )}
          </div>

          {/* Safety: hide apps on task */}
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Hide Apps During Task</h4>
                <p className="text-xs text-muted-foreground">
                  Apps hidden during a task are restored when the agent stops.
                </p>
              </div>
              <Switch
                checked={hideAppsOnTask}
                onCheckedChange={setHideAppsOnTask}
                aria-label="Hide apps during task"
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
                Multi-provider parity vs Cowork's Anthropic-only mode.
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
                  agent level — matching Cowork's hard-blocked categories. {alwaysBlocked.length}{' '}
                  bundle IDs are on this list.
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

/**
 * Single row in the per-app permission registry. Shows the app name and
 * bundle id (if known), with status-cycling buttons and a remove control.
 */
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
