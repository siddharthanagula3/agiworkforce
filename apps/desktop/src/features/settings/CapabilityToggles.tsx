import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { invoke } from '@/lib/tauri-mock';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import { Label } from '@/ui/Label';
import { Spinner } from '@/ui/Spinner';
import { Switch } from '@/ui/Switch';
import { useSettingsDialogStore } from '../../stores/settingsDialogStore';
import { useSettingsStore } from '../../stores/settingsStore';

interface CapabilityInfo {
  name: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  toolCount: number;
  heldOff: boolean;
}

interface ToggleFailure {
  name: string;
  message: string;
}

export function CapabilityToggles() {
  const features = useSettingsStore((state) => state.features);
  const setFeature = useSettingsStore((state) => state.setFeature);
  const [capabilities, setCapabilities] = useState<CapabilityInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [failure, setFailure] = useState<ToggleFailure | null>(null);

  const mounted = useRef(true);
  const openSettings = useSettingsDialogStore((state) => state.openSettings);

  const refresh = useCallback(async () => {
    try {
      const listed = await invoke<CapabilityInfo[]>('list_capabilities');
      if (mounted.current) setCapabilities(Array.isArray(listed) ? listed : []);
    } catch (error) {
      if (mounted.current) setLoadError(getSimpleErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const toggle = useCallback(
    async (capability: CapabilityInfo, enabled: boolean) => {
      setSaving(capability.name);
      setFailure(null);
      try {
        const changed = await setFeature(capability.name, enabled);
        if (changed && capability.heldOff) await refresh();
      } catch (error) {
        if (mounted.current) {
          setFailure({ name: capability.name, message: getSimpleErrorMessage(error) });
        }
      } finally {
        if (mounted.current) setSaving(null);
      }
    },
    [refresh, setFeature],
  );

  return (
    <section
      aria-labelledby="capability-toggles-heading"
      data-setting-search-id="assistant-tools"
      tabIndex={-1}
      className="space-y-4"
    >
      <div>
        <h3 id="capability-toggles-heading" className="text-lg font-semibold">
          Tools the assistant may use
        </h3>
        <p className="text-sm text-muted-foreground">
          Turn a kind of tool off and the assistant can no longer use it in chat on this device. A
          reply that is running finishes its current step first. These switches also hold in tasks,
          scheduled assistant tasks and background agents. Shell commands and scripts you schedule
          yourself are not covered.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Each switch withholds one kind of built-in tool. Turning one back on asks you to confirm
          in a system dialog. Tools from MCP servers and connectors you connect are not governed by
          these switches, apart from the built-in file server, which follows Files: each server has
          its own switch in{' '}
          <button
            type="button"
            onClick={() => openSettings('connectors')}
            className="rounded underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Settings, Connectors
          </button>
          .
        </p>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>The list of tools could not be loaded: {loadError}</span>
        </div>
      ) : capabilities === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="sm" />
          <span>Loading tools…</span>
        </div>
      ) : capabilities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          These switches are available in the desktop app.
        </p>
      ) : (
        <>
          {capabilities.some((capability) => capability.heldOff) && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Your saved switches could not be read when the app started, so every kind of tool
                that can act on this computer is off. Turn on the ones you want.
              </span>
            </div>
          )}
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {capabilities.map((capability) => {
              const enabled =
                !capability.heldOff && (features[capability.name] ?? capability.defaultEnabled);
              const waiting = saving === capability.name;
              const switchId = `capability-${capability.name}`;
              const descriptionId = `${switchId}-description`;
              return (
                <li key={capability.name} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-0.5">
                    <Label htmlFor={switchId}>{capability.label}</Label>
                    <p id={descriptionId} className="text-xs text-muted-foreground">
                      {capability.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {capability.toolCount === 1 ? '1 tool' : `${capability.toolCount} tools`}
                    </p>
                    {waiting && !enabled && (
                      <p role="status" className="text-xs text-foreground">
                        Confirm in the system dialog to turn this on.
                      </p>
                    )}
                    {failure?.name === capability.name && (
                      <p role="alert" className="text-xs text-destructive">
                        This switch was not saved: {failure.message}
                      </p>
                    )}
                  </div>
                  <Switch
                    id={switchId}
                    checked={enabled}
                    disabled={waiting}
                    onCheckedChange={(next) => void toggle(capability, next)}
                    aria-describedby={descriptionId}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
