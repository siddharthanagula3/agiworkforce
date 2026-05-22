import { type ElementType } from 'react';
import { Lock, Hammer, Zap, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useSettingsStore } from '../../stores/settingsStore';
import type { AgentMode } from '../../stores/settingsStore';

const modes: Array<{
  id: AgentMode;
  label: string;
  icon: ElementType;
  color: 'emerald' | 'violet' | 'blue' | 'amber';
  description: string;
}> = [
  {
    id: 'safe',
    label: 'Safe',
    icon: Lock,
    color: 'emerald',
    description: 'Minimal tool use. Always confirms before any action.',
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: Eye,
    color: 'violet',
    description:
      'Read-only analysis mode. Reads files, searches code, creates a plan — but never writes or executes. Switch to Build to apply.',
  },
  {
    id: 'build',
    label: 'Build',
    icon: Hammer,
    color: 'blue',
    description: 'Full access. Edits files and runs shell commands with approval prompts.',
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    icon: Zap,
    color: 'amber',
    description: 'Auto-approves all tools. No confirmation prompts. Use with caution.',
  },
];

const activeClass: Record<'emerald' | 'violet' | 'blue' | 'amber', string> = {
  emerald: 'bg-emerald-500/20 text-emerald-400',
  violet: 'bg-violet-500/20 text-violet-400',
  blue: 'bg-blue-500/20 text-blue-400',
  amber: 'bg-amber-500/20 text-amber-400',
};

export function AgentModeSwitcher() {
  const agentMode = useSettingsStore((state) => state.chatPreferences.agentMode);
  const setAgentMode = useSettingsStore((state) => state.setAgentMode);

  const handleModeChange = async (mode: AgentMode) => {
    try {
      if (mode === 'autopilot') {
        toast.warning('Autopilot mode: all tools are auto-approved. Use with caution.');
      }
      if (mode === 'plan') {
        toast.info('Plan mode: the agent will analyse and plan — no files will be written.');
      }
      await setAgentMode(mode);
    } catch (err) {
      console.error('[AgentModeSwitcher] Failed to change agent mode:', err);
      toast.error('Failed to switch agent mode. Please try again.');
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-0.5 rounded-lg bg-[hsl(var(--muted))] p-0.5">
        {modes.map(({ id, label, icon: Icon, color, description }) => {
          const isActive = agentMode === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              title={`${label}: ${description}`}
              onClick={() => handleModeChange(id)}
              className={`group relative flex items-center gap-1 rounded-md py-1 text-xs font-medium transition-all ${
                isActive
                  ? `${activeClass[color]} px-2`
                  : 'px-1.5 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {isActive && <span>{label}</span>}
              {/* Tooltip on hover for inactive buttons */}
              {!isActive && (
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-[hsl(var(--popover))] px-1.5 py-0.5 text-[10px] text-[hsl(var(--popover-foreground))] opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Returns true when the agent is in Plan (read-only) mode.
 * Use this hook to gate write/execute operations in the chat handler.
 */
export function useIsPlanMode(): boolean {
  return useSettingsStore((state) => state.chatPreferences.agentMode === 'plan');
}
