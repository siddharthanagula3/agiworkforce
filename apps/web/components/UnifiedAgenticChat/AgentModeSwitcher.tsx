'use client';

import type { ElementType } from 'react';
import { Lock, Zap, Bot } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip';
import { useChatPreferencesStore } from '@features/chat/stores/chat-preferences-store';

/** Agent modes available on the web platform.
 *  "build" mode is excluded — it requires local file-system access (Tauri desktop only).
 */
export type AgentMode = 'safe' | 'standard' | 'autopilot';

interface ModeConfig {
  id: AgentMode;
  label: string;
  icon: ElementType;
  color: 'emerald' | 'blue' | 'amber';
  description: string;
}

const MODES: ModeConfig[] = [
  {
    id: 'safe',
    label: 'Safe',
    icon: Lock,
    color: 'emerald',
    description: 'Conservative — always confirms before any action.',
  },
  {
    id: 'standard',
    label: 'Standard',
    icon: Bot,
    color: 'blue',
    description: 'Balanced — uses tools with sensible guardrails.',
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    icon: Zap,
    color: 'amber',
    description: 'Autonomous — acts without confirmation prompts. Use with caution.',
  },
];

const ACTIVE_CLASS: Record<ModeConfig['color'], string> = {
  emerald: 'bg-emerald-500/20 text-emerald-400',
  blue: 'bg-blue-500/20 text-blue-400',
  amber: 'bg-amber-500/20 text-amber-400',
};

interface AgentModeSwitcherProps {
  /** If provided the component runs in controlled mode; otherwise reads from the store. */
  currentMode?: AgentMode;
  /** Called when the user selects a new mode. Required when `currentMode` is provided. */
  onModeChange?: (mode: AgentMode) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * AgentModeSwitcher — web version.
 *
 * Renders a segmented toggle for switching between Safe / Standard / Autopilot modes.
 * In uncontrolled usage (no `currentMode` prop) it reads & writes to
 * `useChatPreferencesStore`.  In controlled usage callers manage state themselves.
 */
export function AgentModeSwitcher({
  currentMode: controlledMode,
  onModeChange: controlledOnModeChange,
  disabled = false,
  className,
}: AgentModeSwitcherProps) {
  const storedMode = useChatPreferencesStore((s) => s.agentMode);
  const setStoredMode = useChatPreferencesStore((s) => s.setAgentMode);

  const isControlled = controlledMode !== undefined;
  const activeMode: AgentMode = isControlled ? controlledMode : storedMode;

  const handleModeChange = (mode: AgentMode) => {
    if (disabled) return;

    try {
      if (mode === 'autopilot') {
        toast.warning(
          'Autopilot mode: the agent acts without confirmation prompts. Use with caution.',
        );
      }

      if (isControlled) {
        controlledOnModeChange?.(mode);
      } else {
        setStoredMode(mode);
      }
    } catch (err) {
      console.error('[AgentModeSwitcher] Failed to change agent mode:', err);
      toast.error('Failed to switch agent mode. Please try again.');
    }
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={cn(
          'flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
        role="group"
        aria-label="Agent mode"
      >
        {MODES.map(({ id, label, icon: Icon, color, description }) => {
          const isActive = activeMode === id;
          return (
            <Tooltip key={id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={isActive}
                  disabled={disabled}
                  onClick={() => handleModeChange(id)}
                  className={cn(
                    'group relative flex items-center gap-1 rounded-md py-1 text-xs font-medium transition-all duration-150',
                    isActive
                      ? `${ACTIVE_CLASS[color]} px-2`
                      : 'px-1.5 text-muted-foreground hover:text-foreground',
                    disabled && 'pointer-events-none',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {isActive && <span>{label}</span>}
                  {/* Visually-hidden label for inactive buttons so screen readers announce the mode */}
                  {!isActive && <span className="sr-only">{label}</span>}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
                <span className="font-semibold">{label}</span>
                <span className="mx-1 text-muted-foreground">—</span>
                {description}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/**
 * Returns true when the current agent mode is 'safe'.
 * Gate writes / mutations behind this check in chat handlers when needed.
 */
export function useIsSafeMode(): boolean {
  return useChatPreferencesStore((s) => s.agentMode === 'safe');
}
