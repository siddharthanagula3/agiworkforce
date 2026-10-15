import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatSettingsStore, type FollowUpQueueMode } from '@agiworkforce/unified-chat';
import { toast } from 'sonner';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { useSettingsStore } from '../../stores/settingsStore';
import { Label } from '@/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Switch } from '@/ui/Switch';
import { Slider } from '@/ui/Slider';
import { CustomAgentsList } from './CustomAgentsList';

export function AgentsSettings() {
  const chatPreferences = useSettingsStore(useShallow((state) => state.chatPreferences));
  const executionPreferences = useSettingsStore(useShallow((state) => state.executionPreferences));

  const { setAutoApproveTools, setMaxTimeoutMinutes } = useSettingsStore(
    useShallow((s) => ({
      setAutoApproveTools: s.setAutoApproveTools,
      setMaxTimeoutMinutes: s.setMaxTimeoutMinutes,
    })),
  );

  const followUpQueueMode = useChatSettingsStore((state) => state.followUpQueueMode);
  const setFollowUpQueueMode = useChatSettingsStore((state) => state.setFollowUpQueueMode);

  const handleAutoApproveChange = useCallback(
    (enabled: boolean) => {
      setAutoApproveTools(enabled).catch((error: unknown) => {
        toast.error(getSimpleErrorMessage(error));
      });
    },
    [setAutoApproveTools],
  );

  return (
    <div className="space-y-6">
      {/* Execution */}
      <div>
        <h3 className="text-h3 mb-4">Execution</h3>

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

          <div className="space-y-2">
            <Label htmlFor="agents-followUpQueueMode">Follow-ups while a reply is running</Label>
            <Select
              value={followUpQueueMode}
              onValueChange={(value) => setFollowUpQueueMode(value as FollowUpQueueMode)}
            >
              <SelectTrigger id="agents-followUpQueueMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="steer">Steer</SelectItem>
                <SelectItem value="queue">Queue</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Steer hands your message to the running reply, which reads it at its next step. Queue
              sends it when the reply ends. Cmd/Ctrl+Shift+Enter does the other one for a single
              message.
            </p>
          </div>
        </div>
      </div>

      {/* Custom Agents, live CRUD UI */}
      <CustomAgentsList />

      {/* Auto-approve is the only approval override with a live runtime policy. */}
      <div>
        <h3 className="text-h3 mb-4">Quick Toggle</h3>
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-autoApprove" className="flex items-center gap-2">
                Auto-Approve All Tools
                {chatPreferences.autoApproveTools && (
                  <span className="rounded-full bg-warning-fill/10 px-2 py-0.5 text-[10px] font-semibold text-warning-text">
                    ACTIVE
                  </span>
                )}
              </Label>
              <p className="text-xs text-muted-foreground">
                Skip all confirmation dialogs. Every tool call executes without asking.{' '}
                <strong className="text-warning-text">Use with caution.</strong>
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
