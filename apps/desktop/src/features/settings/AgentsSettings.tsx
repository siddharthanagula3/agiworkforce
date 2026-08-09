/**
 * AgentsSettings
 *
 * Configuration for proven agent behavior: approval mode, execution
 * preferences, and custom agent files backed by Tauri commands.
 */

import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { Label } from '@/ui/Label';
import { Switch } from '@/ui/Switch';
import { Slider } from '@/ui/Slider';
import { CustomAgentsList } from './CustomAgentsList';

export function AgentsSettings() {
  const chatPreferences = useSettingsStore(useShallow((state) => state.chatPreferences));
  const executionPreferences = useSettingsStore(useShallow((state) => state.executionPreferences));

  const {
    setAutoApproveTools,
    setAlwaysUseAgentMode,
    setMaxTimeoutMinutes,
    setEnableCheckpointing,
    setCheckpointInterval,
    setAutoResumeOnRestart,
    setEnableTimeoutWarnings,
  } = useSettingsStore(
    useShallow((s) => ({
      setAutoApproveTools: s.setAutoApproveTools,
      setAlwaysUseAgentMode: s.setAlwaysUseAgentMode,
      setMaxTimeoutMinutes: s.setMaxTimeoutMinutes,
      setEnableCheckpointing: s.setEnableCheckpointing,
      setCheckpointInterval: s.setCheckpointInterval,
      setAutoResumeOnRestart: s.setAutoResumeOnRestart,
      setEnableTimeoutWarnings: s.setEnableTimeoutWarnings,
    })),
  );

  const handleAutoApproveChange = useCallback(
    (enabled: boolean) => {
      void setAutoApproveTools(enabled);
    },
    [setAutoApproveTools],
  );

  // Derive which radio option is active; fall back to 'ask' if no option matches.
  const selectedApprovalMode = useMemo<'ask' | 'auto-safe' | 'auto-all'>(() => {
    if (chatPreferences.autoApproveTools) return 'auto-all';
    if (chatPreferences.alwaysUseAgentMode && !chatPreferences.autoApproveTools) return 'auto-safe';
    if (!chatPreferences.autoApproveTools && !chatPreferences.alwaysUseAgentMode) return 'ask';
    // Fallback: no option matched — default to first
    console.warn('AgentsSettings: no radio option matched current state, defaulting to first');
    return 'ask';
  }, [chatPreferences.autoApproveTools, chatPreferences.alwaysUseAgentMode]);

  return (
    <div className="space-y-6">
      {/* Agent Configuration */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Agent Configuration</h3>

        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          {/* Always use agent mode */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-agentMode">Always Use Agent Mode</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, every message uses AGI Workforce's full automation capabilities (file
                operations, web search, terminal, browser). Otherwise tools are only activated when
                an action is detected.
              </p>
            </div>
            <Switch
              id="agents-agentMode"
              checked={chatPreferences.alwaysUseAgentMode}
              onCheckedChange={setAlwaysUseAgentMode}
            />
          </div>

          <div className="border-t border-border" />

          {/* Approval Mode */}
          <div className="space-y-3">
            <Label>Approval Mode</Label>
            <p className="text-xs text-muted-foreground -mt-2">
              Controls when the agent asks for confirmation before executing actions.
            </p>

            <div className="space-y-2">
              {/* Ask before actions */}
              <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="approvalMode"
                  className="mt-0.5"
                  checked={selectedApprovalMode === 'ask'}
                  onChange={() => {
                    void setAutoApproveTools(false);
                    setAlwaysUseAgentMode(false);
                  }}
                />
                <div>
                  <p className="text-sm font-medium">Ask before actions</p>
                  <p className="text-xs text-muted-foreground">
                    Agent pauses and asks for your approval before each tool call (file writes,
                    terminal, browser, etc.).
                  </p>
                </div>
              </label>

              {/* Auto-approve safe */}
              <label className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="radio"
                  name="approvalMode"
                  className="mt-0.5"
                  checked={selectedApprovalMode === 'auto-safe'}
                  onChange={() => {
                    setAlwaysUseAgentMode(true);
                    void setAutoApproveTools(false);
                  }}
                />
                <div>
                  <p className="text-sm font-medium">Auto-approve safe actions</p>
                  <p className="text-xs text-muted-foreground">
                    Agent automatically runs in agent mode. Read-only and low-risk actions are
                    auto-approved; destructive actions still ask.
                  </p>
                </div>
              </label>

              {/* AGI Mode — god mode: fully autonomous, bypasses every approval. The
                  non-AGI-Mode options above stay fail-closed (manual / safe-only). */}
              <label className="flex items-start gap-3 rounded-md border border-orange-400/30 bg-orange-500/5 p-3 cursor-pointer hover:bg-orange-500/10 transition-colors">
                <input
                  type="radio"
                  name="approvalMode"
                  className="mt-0.5"
                  checked={selectedApprovalMode === 'auto-all'}
                  onChange={() => {
                    void setAutoApproveTools(true);
                    setAlwaysUseAgentMode(true);
                  }}
                />
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    AGI Mode
                    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                      GOD MODE
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Fully autonomous — the agent runs every tool call immediately and is never
                    interrupted by a confirmation dialog. You still see each tool call as it
                    happens; you&apos;re just never asked.{' '}
                    <strong className="text-orange-600 dark:text-orange-400">
                      Use with caution.
                    </strong>
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

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

          {/* Checkpointing */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-checkpointing">Enable Checkpointing</Label>
              <p className="text-xs text-muted-foreground">
                Periodically save task progress so long-running jobs can be resumed after an
                unexpected crash or app restart.
              </p>
            </div>
            <Switch
              id="agents-checkpointing"
              checked={executionPreferences.enableCheckpointing}
              onCheckedChange={setEnableCheckpointing}
            />
          </div>

          {executionPreferences.enableCheckpointing && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Checkpoint Interval</Label>
                <span className="text-sm tabular-nums text-muted-foreground">
                  Every {executionPreferences.checkpointInterval} steps
                </span>
              </div>
              <Slider
                min={1}
                max={100}
                step={1}
                value={[executionPreferences.checkpointInterval]}
                onValueChange={([v]) =>
                  setCheckpointInterval(v ?? executionPreferences.checkpointInterval)
                }
              />
            </div>
          )}

          <div className="border-t border-border" />

          {/* Auto-resume */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-autoresume">Auto-resume on Restart</Label>
              <p className="text-xs text-muted-foreground">
                Automatically continue interrupted tasks when the app restarts (requires
                checkpointing to be enabled).
              </p>
            </div>
            <Switch
              id="agents-autoresume"
              checked={executionPreferences.autoResumeOnRestart}
              onCheckedChange={setAutoResumeOnRestart}
              disabled={!executionPreferences.enableCheckpointing}
            />
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

      {/* Auto-approve standalone toggle (mirrors llm-config tab) */}
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
