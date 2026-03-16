'use client';

/**
 * AgentModeSwitcher
 *
 * Compact inline footer control that lets the user pick between chat modes:
 * solo, engineer, research, team, race.
 *
 * Shows the current mode label + a chevron. Opens a popover with all modes.
 */

import React, { useState, memo } from 'react';
import { ChevronDown, User, Code, Search, Users, Zap } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui/popover';
import { cn } from '@shared/lib/utils';
import type { ChatMode } from '@features/chat/types';

const MODE_CONFIG: Record<
  ChatMode,
  { label: string; shortLabel: string; Icon: React.FC<{ className?: string }>; color: string }
> = {
  solo: {
    label: 'Solo',
    shortLabel: 'Solo',
    Icon: User,
    color: 'text-gray-500',
  },
  engineer: {
    label: 'Engineer',
    shortLabel: 'Engineer',
    Icon: Code,
    color: 'text-green-500',
  },
  research: {
    label: 'Research',
    shortLabel: 'Research',
    Icon: Search,
    color: 'text-purple-500',
  },
  team: {
    label: 'Team',
    shortLabel: 'Team',
    Icon: Users,
    color: 'text-blue-500',
  },
  race: {
    label: 'Race',
    shortLabel: 'Race',
    Icon: Zap,
    color: 'text-orange-500',
  },
};

const ALL_MODES: ChatMode[] = ['solo', 'engineer', 'research', 'team', 'race'];

interface AgentModeSwitcherProps {
  mode: ChatMode;
  onChange: (mode: ChatMode) => void;
  disabled?: boolean;
}

const AgentModeSwitcherComponent = ({
  mode,
  onChange,
  disabled = false,
}: AgentModeSwitcherProps) => {
  const [open, setOpen] = useState(false);
  const config = MODE_CONFIG[mode];
  const { Icon } = config;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors',
            'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          aria-label={`Agent mode: ${config.label}`}
          aria-expanded={open}
        >
          <Icon className={cn('h-3 w-3 shrink-0', config.color)} />
          <span className="hidden sm:inline">{config.shortLabel}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-52 p-1.5">
        <div className="mb-1 px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Agent Mode
        </div>
        {ALL_MODES.map((m) => {
          const cfg = MODE_CONFIG[m];
          const ModeIcon = cfg.Icon;
          const isSelected = m === mode;
          return (
            <button
              key={m}
              onClick={() => {
                onChange(m);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                isSelected ? 'bg-muted/60 font-medium' : 'hover:bg-muted/40',
              )}
            >
              <ModeIcon className={cn('h-3.5 w-3.5 shrink-0', cfg.color)} />
              <span className="flex-1 text-left">{cfg.label}</span>
              {isSelected && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};

export const AgentModeSwitcher = memo(AgentModeSwitcherComponent);
AgentModeSwitcher.displayName = 'AgentModeSwitcher';
