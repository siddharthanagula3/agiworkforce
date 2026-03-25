/**
 * ComputerUseSettings
 *
 * Settings panel for Computer Use capabilities:
 * - Enable/disable toggle with consent dialog gate
 * - Allowed / denied app lists with add/remove
 * - Hide-apps-on-task safety toggle
 */
import { useCallback, useState } from 'react';
import { Monitor, Shield, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import {
  useComputerUseStore,
  selectComputerUseEnabled,
  selectConsentAccepted,
  selectAllowedApps,
  selectDeniedApps,
  selectHideAppsOnTask,
} from '@/stores/computerUseStore';
import { ComputerUseConsentDialog } from './ComputerUseConsentDialog';

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

            {allowedApps.length > 0 ? (
              <ul className="space-y-1">
                {allowedApps.map((app) => (
                  <li
                    key={app.appName}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <span>{app.appName}</span>
                    <button
                      onClick={() => removeAllowedApp(app.appName)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${app.appName}`}
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

            {deniedApps.length > 0 ? (
              <ul className="space-y-1">
                {deniedApps.map((app) => (
                  <li
                    key={app.appName}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                  >
                    <span>{app.appName}</span>
                    <button
                      onClick={() => removeDeniedApp(app.appName)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={`Remove ${app.appName}`}
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
