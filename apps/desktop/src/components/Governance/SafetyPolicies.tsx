/**
 * SafetyPolicies
 *
 * UI for viewing and editing per-tool approval policies.
 * Wires to existing Rust commands: set_tool_approval_policy / get_tool_approval_policy.
 * Also shows and controls global auto-approve and agent mode settings.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';

type PolicyValue = 'always_allow' | 'always_deny' | 'ask';
type AgentMode = 'safe' | 'build' | 'autopilot';

interface ToolPolicy {
  toolName: string;
  policy: PolicyValue;
  isUpdating: boolean;
}

const POLICY_CONFIG: Record<
  PolicyValue,
  { label: string; color: string; icon: React.ElementType }
> = {
  always_allow: {
    label: 'Always Allow',
    color: 'text-emerald-400',
    icon: ShieldCheck,
  },
  always_deny: {
    label: 'Always Deny',
    color: 'text-red-400',
    icon: ShieldOff,
  },
  ask: {
    label: 'Ask Each Time',
    color: 'text-amber-400',
    icon: ShieldAlert,
  },
};

const AGENT_MODE_CONFIG: Record<AgentMode, { label: string; description: string; color: string }> =
  {
    safe: {
      label: 'Safe',
      description: 'Read-only tools only — no destructive operations',
      color: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400',
    },
    build: {
      label: 'Build',
      description: 'All tools allowed, destructive ones require confirmation',
      color: 'border-blue-500/40 bg-blue-500/5 text-blue-400',
    },
    autopilot: {
      label: 'Autopilot',
      description: 'All tools auto-approved — use with caution',
      color: 'border-amber-500/40 bg-amber-500/5 text-amber-400',
    },
  };

// Well-known tools to manage. In a full implementation this would be fetched from Rust.
const KNOWN_TOOLS = [
  'file_read',
  'file_write',
  'file_delete',
  'file_list',
  'code_execute',
  'bash_execute',
  'browser_navigate',
  'browser_click',
  'search_web',
  'email_send',
  'calendar_create_event',
  'db_query',
  'db_write',
];

interface SafetyPoliciesProps {
  className?: string;
}

export const SafetyPolicies: React.FC<SafetyPoliciesProps> = ({ className }) => {
  const [policies, setPolicies] = useState<ToolPolicy[]>([]);
  const [autoApproveAll, setAutoApproveAll] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>('build');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingAutoApprove, setIsUpdatingAutoApprove] = useState(false);
  const [isUpdatingAgentMode, setIsUpdatingAgentMode] = useState(false);

  const loadPolicies = useCallback(async () => {
    if (!isTauri) {
      // Non-Tauri: show mock data
      setPolicies(KNOWN_TOOLS.map((t) => ({ toolName: t, policy: 'ask', isUpdating: false })));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [rememberedChoices, autoApprove, mode] = await Promise.all([
        invoke<Record<string, boolean>>('get_remembered_tool_choices'),
        invoke<boolean>('get_auto_approve_all'),
        invoke<AgentMode>('get_agent_mode'),
      ]);

      setAutoApproveAll(autoApprove);
      setAgentMode(mode);

      // Build per-tool policy state from remembered choices
      const toolPolicies = KNOWN_TOOLS.map((toolName) => {
        const remembered = rememberedChoices[toolName];
        let policy: PolicyValue = 'ask';
        if (remembered === true) policy = 'always_allow';
        else if (remembered === false) policy = 'always_deny';
        return { toolName, policy, isUpdating: false };
      });

      // Also include any extra tools that have remembered choices but aren't in KNOWN_TOOLS
      Object.entries(rememberedChoices).forEach(([toolName, approved]) => {
        if (!KNOWN_TOOLS.includes(toolName)) {
          toolPolicies.push({
            toolName,
            policy: approved ? 'always_allow' : 'always_deny',
            isUpdating: false,
          });
        }
      });

      setPolicies(toolPolicies);
    } catch (err) {
      toast.error(`Failed to load policies: ${getSimpleErrorMessage(err)}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  const handlePolicyChange = async (toolName: string, newPolicy: PolicyValue) => {
    // Optimistic update
    setPolicies((prev) =>
      prev.map((p) =>
        p.toolName === toolName ? { ...p, policy: newPolicy, isUpdating: true } : p,
      ),
    );

    try {
      await invoke('set_tool_approval_policy', { toolName, policy: newPolicy });
      setPolicies((prev) =>
        prev.map((p) => (p.toolName === toolName ? { ...p, isUpdating: false } : p)),
      );
      toast.success(`Policy updated for ${toolName}`);
    } catch (err) {
      // Revert on failure
      setPolicies((prev) =>
        prev.map((p) => (p.toolName === toolName ? { ...p, isUpdating: false } : p)),
      );
      toast.error(`Failed to update policy: ${getSimpleErrorMessage(err)}`);
    }
  };

  const handleAutoApproveToggle = async (enabled: boolean) => {
    setIsUpdatingAutoApprove(true);
    try {
      await invoke('set_auto_approve_all', { enabled });
      setAutoApproveAll(enabled);
      toast.success(enabled ? 'Auto-approve enabled' : 'Auto-approve disabled');
    } catch (err) {
      toast.error(`Failed to update auto-approve: ${getSimpleErrorMessage(err)}`);
    } finally {
      setIsUpdatingAutoApprove(false);
    }
  };

  const handleAgentModeChange = async (mode: AgentMode) => {
    setIsUpdatingAgentMode(true);
    try {
      await invoke('set_agent_mode', { mode });
      setAgentMode(mode);
      toast.success(`Agent mode set to ${mode}`);
    } catch (err) {
      toast.error(`Failed to update agent mode: ${getSimpleErrorMessage(err)}`);
    } finally {
      setIsUpdatingAgentMode(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading policies...
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* Global settings */}
      <div className="rounded-xl border border-gray-800 bg-[#0c0e18] p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-200">Global Settings</h3>
        </div>

        {/* Auto-approve toggle */}
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-amber-400">Auto-Approve All Tools</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Bypasses all confirmation dialogs — use only in trusted environments
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isUpdatingAutoApprove && <Loader2 size={13} className="animate-spin text-gray-400" />}
            <Switch
              checked={autoApproveAll}
              onCheckedChange={(checked) => void handleAutoApproveToggle(checked)}
              disabled={isUpdatingAutoApprove}
            />
          </div>
        </div>

        {/* Agent mode selector */}
        <div>
          <div className="mb-2 text-xs font-medium text-gray-400">Agent Execution Mode</div>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(AGENT_MODE_CONFIG) as AgentMode[]).map((mode) => {
              const config = AGENT_MODE_CONFIG[mode];
              const isActive = agentMode === mode;
              return (
                <button type="button"
                  key={mode}
                  onClick={() => void handleAgentModeChange(mode)}
                  disabled={isUpdatingAgentMode}
                  className={cn(
                    'flex-1 min-w-[120px] rounded-lg border px-3 py-2 text-xs text-left transition-all',
                    isActive
                      ? config.color
                      : 'border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600',
                    isUpdatingAgentMode && 'opacity-50',
                  )}
                >
                  <div className="font-semibold">{config.label}</div>
                  <div className="mt-0.5 text-[10px] opacity-70">{config.description}</div>
                  {isActive && <CheckCircle size={12} className="mt-1" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Per-tool policies */}
      <div className="rounded-xl border border-gray-800 bg-[#0c0e18] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-200">Per-Tool Approval Policies</h3>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => void loadPolicies()}
            className="flex items-center gap-1 text-gray-500"
          >
            <RefreshCw size={12} />
            Refresh
          </Button>
        </div>

        <div className="divide-y divide-gray-800/50">
          {policies.map((p) => {
            const policyConf = POLICY_CONFIG[p.policy];
            const Icon = policyConf.icon;
            return (
              <div
                key={p.toolName}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-800/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Icon size={13} className={policyConf.color} />
                  <span className="text-sm font-mono text-gray-300">{p.toolName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {p.isUpdating && <Loader2 size={12} className="animate-spin text-gray-500" />}
                  <select
                    value={p.policy}
                    onChange={(e) =>
                      void handlePolicyChange(p.toolName, e.target.value as PolicyValue)
                    }
                    disabled={p.isUpdating}
                    className="rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-300 focus:outline-none disabled:opacity-50"
                  >
                    <option value="ask">Ask Each Time</option>
                    <option value="always_allow">Always Allow</option>
                    <option value="always_deny">Always Deny</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SafetyPolicies;
