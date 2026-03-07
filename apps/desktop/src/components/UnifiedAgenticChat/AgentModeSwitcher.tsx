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

/** Tooltip badge shown below the switcher when Plan mode is active */
function PlanModeBanner() {
  const setAgentMode = useSettingsStore((state) => state.setAgentMode);

  return (
    <div className="mt-1 flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-xs text-violet-300">
      <Eye className="h-3 w-3 shrink-0" />
      <span>
        <strong>Plan mode</strong> — read-only. The agent will analyse and propose changes.
      </span>
      <button
        type="button"
        onClick={() => setAgentMode('build')}
        className="ml-auto shrink-0 rounded bg-violet-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-violet-200 hover:bg-violet-500/50"
      >
        Switch to Build
      </button>
    </div>
  );
}

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
      <div className="flex items-center gap-0.5 rounded-lg bg-white/5 p-0.5">
        {modes.map(({ id, label, icon: Icon, color, description }) => {
          const isActive = agentMode === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={isActive}
              title={description}
              onClick={() => handleModeChange(id)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-all ${
                isActive ? activeClass[color] : 'text-white/50 hover:text-white/80'
              }`}
            >
              <Icon className="h-3 w-3" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      {agentMode === 'plan' && <PlanModeBanner />}
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
