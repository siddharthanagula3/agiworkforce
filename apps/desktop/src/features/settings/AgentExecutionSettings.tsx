import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauriContext } from '../../lib/tauri-mock';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/AlertDialog';
import { Input } from '@/ui/Input';
import { Label } from '@/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/Select';
import { Slider } from '@/ui/Slider';
import { Switch } from '@/ui/Switch';
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

function isWindowsHost(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().startsWith('WIN');
}

export function agentCommandSandboxStatus(
  policy: TerminalSandboxPolicy,
  onWindows: boolean,
): string {
  if (policy === 'danger-full-access') {
    return 'Agent commands: not sandboxed. They run with your account’s full file and network access after you approve each one.';
  }
  if (onWindows) {
    return 'Agent commands: not sandboxed on Windows, which has no OS sandbox here. Each command still asks before it runs.';
  }
  return policy === 'read-only'
    ? 'Agent commands: sandboxed. They can read files but write nothing outside a private temporary folder, and cannot reach services on this computer.'
    : 'Agent commands: sandboxed. They can read anywhere but write only inside the chat’s folder, and cannot reach services on this computer.';
}

interface TerminalSandboxAvailability {
  supported: boolean;
  available: boolean;
  reason: string | null;
}

const SANDBOX_AVAILABILITY_DEBOUNCE_MS = 250;

function useTerminalSandboxAvailability(executable: string): TerminalSandboxAvailability | null {
  const [availability, setAvailability] = useState<TerminalSandboxAvailability | null>(null);

  useEffect(() => {
    if (!isTauriContext()) return;
    let current = true;
    const timer = setTimeout(() => {
      invoke<TerminalSandboxAvailability>('terminal_sandbox_availability', { executable })
        .then((result) => {
          if (current) setAvailability(result);
        })
        .catch(() => {
          if (current) setAvailability(null);
        });
    }, SANDBOX_AVAILABILITY_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [executable]);

  return availability;
}

interface AgentExecutionSettingsProps {
  onSettingsChange?: () => void;
}

type UnsafeSandboxChange =
  | { kind: 'enabled'; value: false }
  | { kind: 'backend'; value: 'none' }
  | { kind: 'policy'; value: 'danger-full-access' };

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
  const [pendingUnsafeSandboxChange, setPendingUnsafeSandboxChange] =
    useState<UnsafeSandboxChange | null>(null);
  const sandboxAvailability = useTerminalSandboxAvailability(terminalSandbox.executable);
  const sandboxRuntimeSupported = sandboxAvailability?.supported ?? !isWindowsHost();
  const sandboxRuntimeMissing =
    sandboxAvailability !== null && sandboxAvailability.supported && !sandboxAvailability.available;

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
      if (!enabled && terminalSandbox.enabled) {
        setPendingUnsafeSandboxChange({ kind: 'enabled', value: false });
        return;
      }
      if (enabled && sandboxRuntimeMissing) return;
      setTerminalSandboxEnabled(enabled);
      onSettingsChange?.();
    },
    [onSettingsChange, sandboxRuntimeMissing, setTerminalSandboxEnabled, terminalSandbox.enabled],
  );

  const handleTerminalSandboxBackendChange = useCallback(
    (value: string) => {
      const backend = value as TerminalSandboxBackend;
      if (backend === 'none' && terminalSandbox.backend !== 'none') {
        setPendingUnsafeSandboxChange({ kind: 'backend', value: 'none' });
        return;
      }
      setTerminalSandboxBackend(backend);
      onSettingsChange?.();
    },
    [onSettingsChange, setTerminalSandboxBackend, terminalSandbox.backend],
  );

  const handleTerminalSandboxPolicyChange = useCallback(
    (value: string) => {
      const policy = value as TerminalSandboxPolicy;
      if (policy === 'danger-full-access' && terminalSandbox.policy !== 'danger-full-access') {
        setPendingUnsafeSandboxChange({ kind: 'policy', value: 'danger-full-access' });
        return;
      }
      setTerminalSandboxPolicy(policy);
      onSettingsChange?.();
    },
    [onSettingsChange, setTerminalSandboxPolicy, terminalSandbox.policy],
  );

  const confirmUnsafeSandboxChange = useCallback(() => {
    if (pendingUnsafeSandboxChange === null) return;
    if (pendingUnsafeSandboxChange.kind === 'enabled') {
      setTerminalSandboxEnabled(false);
    } else if (pendingUnsafeSandboxChange.kind === 'backend') {
      setTerminalSandboxBackend('none');
    } else {
      setTerminalSandboxPolicy('danger-full-access');
    }
    setPendingUnsafeSandboxChange(null);
    onSettingsChange?.();
  }, [
    onSettingsChange,
    pendingUnsafeSandboxChange,
    setTerminalSandboxBackend,
    setTerminalSandboxEnabled,
    setTerminalSandboxPolicy,
  ]);

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
    'auto-approve': 'Automatically approve when time runs out, use with caution',
    pause: 'Pause the agent and wait for you to return',
  };

  const SANDBOX_POLICY_DESCRIPTIONS: Record<TerminalSandboxPolicy, string> = {
    'danger-full-access':
      'No OS-level process sandbox. Separately approved commands run with the app’s normal filesystem and network access.',
    'read-only':
      'Workspace becomes read-only. Network stays blocked unless you explicitly allow domains.',
    'workspace-write':
      'Matches CLI-style workspace write access: the current workspace can write, and network is allowlisted.',
  };

  const allowedDomainsText = useMemo(
    () => terminalSandbox.allowedDomains.join(', '),
    [terminalSandbox.allowedDomains],
  );

  const runtimeExecutableField = (
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
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3 mb-1">Agent Execution</h3>
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
          <div className="flex items-start gap-2 rounded-md border border-warning-fill/30 bg-warning-fill/10 px-3 py-2 text-xs text-warning-text">
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
              {sandboxRuntimeSupported
                ? 'Wrap terminal commands in an OS-level sandbox. This follows the CLI model and can use `srt` for workspace-write or read-only execution.'
                : 'The sandbox runtime for terminal commands is not available on Windows. Commands you run from the terminal panel run with your account’s access.'}
            </p>
            {sandboxRuntimeSupported && (
              <p className="text-xs text-muted-foreground">
                Turning the sandbox off, choosing full access, changing the runtime or its
                executable, or allowing another domain is confirmed in a system dialog when you
                save. If you decline there, nothing is saved.
              </p>
            )}
          </div>
          {sandboxRuntimeSupported && (
            <Switch
              checked={terminalSandbox.enabled}
              onCheckedChange={handleTerminalSandboxEnabledChange}
              disabled={sandboxRuntimeMissing && !terminalSandbox.enabled}
              aria-label="Enable terminal sandbox"
              aria-describedby={sandboxRuntimeMissing ? 'terminalSandboxUnavailable' : undefined}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="terminalSandboxPolicy">Access policy</Label>
          <Select value={terminalSandbox.policy} onValueChange={handleTerminalSandboxPolicyChange}>
            <SelectTrigger id="terminalSandboxPolicy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="workspace-write">Workspace write</SelectItem>
              <SelectItem value="read-only">Read-only</SelectItem>
              <SelectItem value="danger-full-access">Danger full access</SelectItem>
            </SelectContent>
          </Select>
          <p role="status" className="text-xs text-muted-foreground">
            {agentCommandSandboxStatus(terminalSandbox.policy, isWindowsHost())}
          </p>
        </div>

        {sandboxRuntimeSupported && sandboxRuntimeMissing && (
          <div
            id="terminalSandboxUnavailable"
            role="alert"
            className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-foreground"
          >
            {terminalSandbox.enabled
              ? 'Terminal commands cannot start until the sandbox runtime is found.'
              : 'The terminal sandbox cannot be switched on yet.'}{' '}
            {sandboxAvailability?.reason} Install `srt`, or give the path to its executable below.
          </div>
        )}

        {!sandboxRuntimeSupported ? null : terminalSandbox.enabled ? (
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
            </div>

            {runtimeExecutableField}

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
              <div className="rounded-md border border-warning-fill/30 bg-warning-fill/10 px-3 py-2 text-xs text-warning-text">
                Network is currently blocked for sandboxed commands because no domains are
                allowlisted.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sandboxRuntimeMissing && runtimeExecutableField}
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              Commands you run from the terminal panel use no sandbox runtime until this is enabled.
              Agent commands follow the access policy above.
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        open={pendingUnsafeSandboxChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnsafeSandboxChange(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run terminal commands without an OS sandbox?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the workspace filesystem and network-domain restrictions enforced by the
              terminal sandbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Separately approved commands will run with the app&apos;s normal OS account access.
              They may read or modify files outside the workspace and contact network destinations
              that are not in your allowlist.
            </p>
            <p>
              This does not bypass agent approval prompts or expand OS permissions, but prompt
              injection or a mistaken approval can cause data loss or expose sensitive data.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={confirmUnsafeSandboxChange}
            >
              Run Without Sandbox
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
