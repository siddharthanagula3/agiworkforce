
import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { Label } from '@/ui/Label';
import { Switch } from '@/ui/Switch';
import { Slider } from '@/ui/Slider';
import { CustomAgentsList } from './CustomAgentsList';

export function AgentsSettings() {
  const chatPreferences = useSettingsStore(useShallow((state) => state.chatPreferences));
  const executionPreferences = useSettingsStore(useShallow((state) => state.executionPreferences));

  const { setAutoApproveTools, setMaxTimeoutMinutes, setEnableTimeoutWarnings } = useSettingsStore(
    useShallow((s) => ({
      setAutoApproveTools: s.setAutoApproveTools,
      setMaxTimeoutMinutes: s.setMaxTimeoutMinutes,
      setEnableTimeoutWarnings: s.setEnableTimeoutWarnings,
    })),
  );

  const handleAutoApproveChange = useCallback(
    (enabled: boolean) => {
      void setAutoApproveTools(enabled);
    },
    [setAutoApproveTools],
  );

  return (
    <div className="space-y-6">
      {/* Execution */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Execution</h3>

        <div className="rounded-lg border border-border bg-card p-6 space-y-6">
          {/* Max timeout */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Max Task Timeout</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {executionPreferences.maxTimeoutMinutes >= 1440
                  ? `${Math.round(executionPreferences.maxTimeoutMinutes / 60)}h`
                  : `${executionPreferences.maxTimeoutMinutes}m`}
              </span>
            </div>
            <Slider
              min={1}
              max={4320}
              step={1}
              value={[executionPreferences.maxTimeoutMinutes]}
              onValueChange={([v]) =>
                setMaxTimeoutMinutes(v ?? executionPreferences.maxTimeoutMinutes)
              }
            />
            <p className="text-xs text-muted-foreground">
              Tasks running longer than this duration will be automatically cancelled (1 min – 72
              hrs).
            </p>
          </div>

          <div className="border-t border-border" />

          {/* Timeout warnings */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-timeoutWarnings">Timeout Warnings</Label>
              <p className="text-xs text-muted-foreground">
                Show notifications at 1 hour, 30 minutes, and 5 minutes remaining before a task
                times out.
              </p>
            </div>
            <Switch
              id="agents-timeoutWarnings"
              checked={executionPreferences.enableTimeoutWarnings}
              onCheckedChange={setEnableTimeoutWarnings}
            />
          </div>
        </div>
      </div>

      {/* Custom Agents — live CRUD UI */}
      <CustomAgentsList />

      {/* Auto-approve is the only approval override with a live runtime policy. */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Quick Toggle</h3>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-autoApprove" className="flex items-center gap-2">
                Auto-Approve All Tools
                {chatPreferences.autoApproveTools && (
                  <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                    ACTIVE
                  </span>
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                Skip all confirmation dialogs. Every tool call executes without asking.{' '}
                <strong className="text-orange-600 dark:text-orange-400">Use with caution.</strong>
              </p>
            </div>
            <Switch
              id="agents-autoApprove"
              checked={chatPreferences.autoApproveTools}
              onCheckedChange={handleAutoApproveChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentsSettings;
