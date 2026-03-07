import { Lock, Hammer, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useSettingsStore } from '../../stores/settingsStore';
import type { AgentMode } from '../../stores/settingsStore';

const modes: Array<{
  id: AgentMode;
  label: string;
  icon: React.ElementType;
  color: 'emerald' | 'blue' | 'amber';
  description: string;
}> = [
  {
    id: 'safe',
    label: 'Safe',
    icon: Lock,
    color: 'emerald',
    description: 'Read-only tools only. No writes, no shell.',
  },
  {
    id: 'build',
    label: 'Build',
    icon: Hammer,
    color: 'blue',
    description: 'Standard mode with approval prompts for destructive actions.',
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    icon: Zap,
    color: 'amber',
    description: 'Auto-approves all tools. Use with caution.',
  },
];

const activeClass: Record<'emerald' | 'blue' | 'amber', string> = {
  emerald: 'bg-emerald-500/20 text-emerald-400',
  blue: 'bg-blue-500/20 text-blue-400',
  amber: 'bg-amber-500/20 text-amber-400',
};

export function AgentModeSwitcher() {
  const agentMode = useSettingsStore((state) => state.chatPreferences.agentMode);
  const setAgentMode = useSettingsStore((state) => state.setAgentMode);

  const handleModeChange = async (mode: AgentMode) => {
    if (mode === 'autopilot') {
      toast.warning('Autopilot mode: all tools are auto-approved. Use with caution.');
    }
    await setAgentMode(mode);
  };

  return (
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
  );
}
