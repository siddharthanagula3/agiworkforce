/**
 * AgentExecutionSettings
 *
 * Settings section for Wave 1 agent execution features:
 * - Approval timeout seconds (slider, 60-600, default 300)
 * - Approval timeout policy (dropdown: auto-deny, auto-approve, pause)
 * - Stream inactivity timeout seconds (slider, 15-120, default 30)
 *
 * Wired to settingsStore selectors/setters added in Wave 1.
 */
import { useCallback, useMemo } from 'react';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Slider } from '../ui/Slider';
import { Switch } from '../ui/Switch';
import {
  useSettingsStore,
  type ApprovalTimeoutPolicy,
  type TerminalSandboxBackend,
  type TerminalSandboxPolicy,
  selectApprovalTimeoutSeconds,
  selectApprovalTimeoutPolicy,
  selectStreamInactivityTimeoutSeconds,
  selectTerminalSandbox,
} from '../../stores/settingsStore';

interface AgentExecutionSettingsProps {
  onSettingsChange?: () => void;
}

export function AgentExecutionSettings({ onSettingsChange }: AgentExecutionSettingsProps) {
  const approvalTimeoutSeconds = useSettingsStore(selectApprovalTimeoutSeconds);
  const approvalTimeoutPolicy = useSettingsStore(selectApprovalTimeoutPolicy);
  const streamInactivityTimeoutSeconds = useSettingsStore(selectStreamInactivityTimeoutSeconds);
  const terminalSandbox = useSettingsStore(selectTerminalSandbox);

  const setApprovalTimeoutSeconds = useSettingsStore((s) => s.setApprovalTimeoutSeconds);
  const setApprovalTimeoutPolicy = useSettingsStore((s) => s.setApprovalTimeoutPolicy);
  const setStreamInactivityTimeoutSeconds = useSettingsStore(
    (s) => s.setStreamInactivityTimeoutSeconds,
  );
  const setTerminalSandboxEnabled = useSettingsStore((s) => s.setTerminalSandboxEnabled);
  const setTerminalSandboxBackend = useSettingsStore((s) => s.setTerminalSandboxBackend);
  const setTerminalSandboxPolicy = useSettingsStore((s) => s.setTerminalSandboxPolicy);
  const setTerminalSandboxExecutable = useSettingsStore((s) => s.setTerminalSandboxExecutable);
  const setTerminalSandboxAllowedDomains = useSettingsStore(
    (s) => s.setTerminalSandboxAllowedDomains,
  );

  const handleApprovalTimeoutChange = useCallback(
    (value: number[]) => {
      const seconds = value[0];
      if (seconds !== undefined) {
        setApprovalTimeoutSeconds(seconds);
        onSettingsChange?.();
      }
    },
    [setApprovalTimeoutSeconds, onSettingsChange],
  );

  const handlePolicyChange = useCallback(
    (value: string) => {
      setApprovalTimeoutPolicy(value as ApprovalTimeoutPolicy);
      onSettingsChange?.();
    },
    [setApprovalTimeoutPolicy, onSettingsChange],
  );

  const handleStreamTimeoutChange = useCallback(
    (value: number[]) => {
      const seconds = value[0];
      if (seconds !== undefined) {
        setStreamInactivityTimeoutSeconds(seconds);
        onSettingsChange?.();
      }
    },
    [setStreamInactivityTimeoutSeconds, onSettingsChange],
  );

  const handleTerminalSandboxEnabledChange = useCallback(
    (enabled: boolean) => {
      setTerminalSandboxEnabled(enabled);
      onSettingsChange?.();
    },
    [onSettingsChange, setTerminalSandboxEnabled],
  );

  const handleTerminalSandboxBackendChange = useCallback(
    (value: string) => {
      setTerminalSandboxBackend(value as TerminalSandboxBackend);
      onSettingsChange?.();
    },
    [onSettingsChange, setTerminalSandboxBackend],
  );

  const handleTerminalSandboxPolicyChange = useCallback(
    (value: string) => {
      setTerminalSandboxPolicy(value as TerminalSandboxPolicy);
      onSettingsChange?.();
    },
    [onSettingsChange, setTerminalSandboxPolicy],
  );

  const handleTerminalSandboxExecutableChange = useCallback(
    (value: string) => {
      setTerminalSandboxExecutable(value);
      onSettingsChange?.();
    },
    [onSettingsChange, setTerminalSandboxExecutable],
  );

  const handleTerminalSandboxAllowedDomainsChange = useCallback(
    (value: string) => {
      setTerminalSandboxAllowedDomains(value.split(','));
      onSettingsChange?.();
    },
    [onSettingsChange, setTerminalSandboxAllowedDomains],
  );

  const formatApprovalSeconds = (s: number) => {
    if (s >= 60) {
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
    }
    return `${s}s`;
  };

  const POLICY_DESCRIPTIONS: Record<ApprovalTimeoutPolicy, string> = {
    'auto-deny': 'Automatically reject the tool call when time runs out (safest)',
    'auto-approve': 'Automatically approve when time runs out — use with caution',
    pause: 'Pause the agent and wait for you to return',
  };

  const SANDBOX_POLICY_DESCRIPTIONS: Record<TerminalSandboxPolicy, string> = {
    'danger-full-access': 'No OS-level process sandbox. Commands run with the app’s normal access.',
    'read-only':
      'Workspace becomes read-only. Network stays blocked unless you explicitly allow domains.',
    'workspace-write':
      'Matches CLI-style workspace write access: the current workspace can write, and network is allowlisted.',
  };

  const allowedDomainsText = useMemo(
    () => terminalSandbox.allowedDomains.join(', '),
    [terminalSandbox.allowedDomains],
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Agent Execution</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Control how the agent handles timeouts and stream inactivity during autonomous runs.
        </p>
      </div>

      {/* Approval timeout seconds */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div>
          <h4 className="font-semibold text-sm">Approval Timeout</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            How long to wait for your approval before the policy triggers automatically.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="approvalTimeout">Timeout duration</Label>
            <span className="text-sm font-mono font-medium tabular-nums text-primary">
              {formatApprovalSeconds(approvalTimeoutSeconds ?? 300)}
            </span>
          </div>
          <Slider
            id="approvalTimeout"
            min={60}
            max={600}
            step={30}
            value={[approvalTimeoutSeconds ?? 300]}
            onValueChange={handleApprovalTimeoutChange}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1m (fastest)</span>
            <span>10m (longest)</span>
          </div>
        </div>
      </div>

      {/* Approval timeout policy */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div>
          <h4 className="font-semibold text-sm">When Approval Times Out</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            The policy applied automatically when you don't respond in time.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="approvalPolicy">Timeout policy</Label>
          <Select value={approvalTimeoutPolicy ?? 'auto-deny'} onValueChange={handlePolicyChange}>
            <SelectTrigger id="approvalPolicy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto-deny">Auto-deny (safe default)</SelectItem>
              <SelectItem value="auto-approve">Auto-approve</SelectItem>
              <SelectItem value="pause">Pause agent</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {POLICY_DESCRIPTIONS[approvalTimeoutPolicy ?? 'auto-deny']}
          </p>
        </div>

        {(approvalTimeoutPolicy ?? 'auto-deny') === 'auto-approve' && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <span className="mt-0.5">!</span>
            <span>
              Auto-approve allows the agent to proceed without confirmation. Only use this in
              trusted, low-risk workflows.
            </span>
          </div>
        )}
      </div>

      {/* Stream inactivity timeout */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <div>
          <h4 className="font-semibold text-sm">Stream Inactivity Timeout</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            If no new tokens arrive within this window, the stream watchdog triggers recovery.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="streamTimeout">Inactivity window</Label>
            <span className="text-sm font-mono font-medium tabular-nums text-primary">
              {streamInactivityTimeoutSeconds ?? 30}s
            </span>
          </div>
          <Slider
            id="streamTimeout"
            min={15}
            max={120}
            step={5}
            value={[streamInactivityTimeoutSeconds ?? 30]}
            onValueChange={handleStreamTimeoutChange}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>15s (aggressive)</span>
            <span>120s (lenient)</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Shorter values recover faster from stalled streams but may interrupt legitimate slow
            responses. The default of 30s works well for most models.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h4 className="font-semibold text-sm">Terminal Sandbox</h4>
            <p className="text-xs text-muted-foreground">
              Wrap terminal commands in an OS-level sandbox. This follows the CLI model and can use
              `srt` for workspace-write or read-only execution.
            </p>
          </div>
          <Switch
            checked={terminalSandbox.enabled}
            onCheckedChange={handleTerminalSandboxEnabledChange}
            aria-label="Enable terminal sandbox"
          />
        </div>

        {terminalSandbox.enabled ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="terminalSandboxBackend">Runtime backend</Label>
                <Select
                  value={terminalSandbox.backend}
                  onValueChange={handleTerminalSandboxBackendChange}
                >
                  <SelectTrigger id="terminalSandboxBackend">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="srt">Anthropic Sandbox Runtime (`srt`)</SelectItem>
                    <SelectItem value="none">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="terminalSandboxPolicy">Access policy</Label>
                <Select
                  value={terminalSandbox.policy}
                  onValueChange={handleTerminalSandboxPolicyChange}
                >
                  <SelectTrigger id="terminalSandboxPolicy">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace-write">Workspace write</SelectItem>
                    <SelectItem value="read-only">Read-only</SelectItem>
                    <SelectItem value="danger-full-access">Danger full access</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="terminalSandboxExecutable">Runtime executable</Label>
              <Input
                id="terminalSandboxExecutable"
                value={terminalSandbox.executable}
                onChange={(event) => handleTerminalSandboxExecutableChange(event.target.value)}
                placeholder="srt"
              />
              <p className="text-xs text-muted-foreground">
                Use `srt` when it is on `PATH`, or provide an absolute path to the binary.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="terminalSandboxDomains">Allowed network domains</Label>
              <Input
                id="terminalSandboxDomains"
                value={allowedDomainsText}
                onChange={(event) => handleTerminalSandboxAllowedDomainsChange(event.target.value)}
                placeholder="github.com, api.github.com"
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated allowlist. Leave empty to block all network access inside the
                sandbox.
              </p>
            </div>

            <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              {SANDBOX_POLICY_DESCRIPTIONS[terminalSandbox.policy]}
            </div>

            {terminalSandbox.backend === 'srt' && terminalSandbox.allowedDomains.length === 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                Network is currently blocked for sandboxed commands because no domains are
                allowlisted.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Terminal commands run without an OS-level sandbox until this is enabled.
          </div>
        )}
      </div>
    </div>
  );
}
