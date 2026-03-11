/**
 * AgentsSettings
 *
 * Configuration for agent behavior: default model, parallelism,
 * approval mode, sub-agents, execution preferences.
 * Also provides a UI for creating, editing, and deleting custom agent files.
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSettingsStore } from '../../stores/settingsStore';
import { Label } from '../ui/Label';
import { Switch } from '../ui/Switch';
import { Slider } from '../ui/Slider';
import { CustomAgentsList } from './CustomAgentsList';

export function AgentsSettings() {
  const chatPreferences = useSettingsStore(useShallow((state) => state.chatPreferences));
  const executionPreferences = useSettingsStore(useShallow((state) => state.executionPreferences));
  const features = useSettingsStore(useShallow((state) => state.features));

  const {
    setAutoApproveTools,
    setAlwaysUseAgentMode,
    setFeature,
    setMaxTimeoutMinutes,
    setEnableCheckpointing,
    setCheckpointInterval,
    setAutoResumeOnRestart,
    setEnableTimeoutWarnings,
    setAutoInjectSkills,
  } = useSettingsStore(
    useShallow((s) => ({
      setAutoApproveTools: s.setAutoApproveTools,
      setAlwaysUseAgentMode: s.setAlwaysUseAgentMode,
      setFeature: s.setFeature,
      setMaxTimeoutMinutes: s.setMaxTimeoutMinutes,
      setEnableCheckpointing: s.setEnableCheckpointing,
      setCheckpointInterval: s.setCheckpointInterval,
      setAutoResumeOnRestart: s.setAutoResumeOnRestart,
      setEnableTimeoutWarnings: s.setEnableTimeoutWarnings,
      setAutoInjectSkills: s.setAutoInjectSkills,
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
                  checked={!chatPreferences.autoApproveTools && !chatPreferences.alwaysUseAgentMode}
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
                  checked={chatPreferences.alwaysUseAgentMode && !chatPreferences.autoApproveTools}
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

              {/* Auto-approve all */}
              <label className="flex items-start gap-3 rounded-md border border-orange-400/30 bg-orange-500/5 p-3 cursor-pointer hover:bg-orange-500/10 transition-colors">
                <input
                  type="radio"
                  name="approvalMode"
                  className="mt-0.5"
                  checked={chatPreferences.autoApproveTools}
                  onChange={() => {
                    void setAutoApproveTools(true);
                    setAlwaysUseAgentMode(true);
                  }}
                />
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    Auto-approve all
                    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                      ACTIVE
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Skips every confirmation dialog. Every tool call executes immediately.{' '}
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

      {/* Sub-agents & Teams */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Sub-agents &amp; Teams</h3>

        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-subagents">Enable Sub-agents</Label>
              <p className="text-xs text-muted-foreground">
                Allow the orchestrator agent to spawn specialized sub-agents for complex tasks.
                Sub-agents can work on separate subtasks concurrently.
              </p>
            </div>
            <Switch
              id="agents-subagents"
              checked={features['subAgents'] ?? true}
              onCheckedChange={(enabled) => setFeature('subAgents', enabled)}
            />
          </div>

          <div className="border-t border-border" />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-teams">Enable Agent Teams</Label>
              <p className="text-xs text-muted-foreground">
                Allow multiple named agents (e.g. frontend-engineer, backend-engineer) to
                collaborate on a shared task via the swarm orchestrator.
              </p>
            </div>
            <Switch
              id="agents-teams"
              checked={features['agentTeams'] ?? true}
              onCheckedChange={(enabled) => setFeature('agentTeams', enabled)}
            />
          </div>

          <div className="border-t border-border" />

          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="agents-autoInjectSkills">Auto-inject relevant skills</Label>
              <p className="text-xs text-muted-foreground">
                Automatically detect which skills are relevant to your message and inject their
                instructions into the system prompt — no need to type{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">/skill-name</code> manually.
              </p>
            </div>
            <Switch
              id="agents-autoInjectSkills"
              checked={chatPreferences.autoInjectSkills ?? true}
              onCheckedChange={setAutoInjectSkills}
            />
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
