'use client';

import { cn } from '@shared/lib/utils';

export type AgentMode = 'safe' | 'standard' | 'autopilot';

interface AgentModeSwitcherProps {
  currentMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  disabled?: boolean;
}

const MODES: { id: AgentMode; label: string; title: string }[] = [
  { id: 'safe', label: 'Safe', title: 'Analysis only — no actions taken' },
  { id: 'standard', label: 'Standard', title: 'Default agent mode with tool use' },
  { id: 'autopilot', label: 'Autopilot', title: 'Full autonomous with limited iteration' },
];

export function AgentModeSwitcher({ currentMode, onModeChange, disabled = false }: AgentModeSwitcherProps) {
  return (
    <div className="flex gap-1" role="group" aria-label="Agent mode">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onModeChange(mode.id)}
          disabled={disabled}
          title={mode.title}
          aria-pressed={currentMode === mode.id}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200',
            currentMode === mode.id
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-white/[0.05] hover:bg-white/[0.10] text-muted-foreground hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
