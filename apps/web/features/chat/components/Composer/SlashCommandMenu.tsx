'use client';

import React, { useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react';
import {
  Globe,
  Brain,
  Image,
  FileText,
  Code,
  Terminal,
  Database,
  MonitorPlay,
  Undo2,
  Minimize2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { isCapabilityEnabled } from '@agiworkforce/types';
import { usePlatform } from '@agiworkforce/unified-chat';
import {
  BUILT_IN_SLASH_COMMANDS,
  filterSlashCommandsByCapability,
  type SlashCommandIconName,
} from '../../commands/slash-command-registry';

interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  isCustom?: boolean;
  /** True for skill-sourced commands fetched from /api/skills. */
  isSkill?: boolean;
}

// Resolve the registry's framework-agnostic icon names to Lucide components.
// Built-in commands themselves come from the canonical registry (single source
// of truth), NOT a hardcoded subset — see COMMANDS below.
const SLASH_ICONS: Record<SlashCommandIconName, React.ElementType> = {
  Globe,
  Brain,
  Image,
  FileText,
  Code,
  MonitorPlay,
  Terminal,
  Database,
  Undo2,
  Minimize2,
  Sparkles,
};

interface SkillMeta {
  name: string;
  description: string;
}

export interface SlashCommandMenuHandle {
  /** Handle a keyboard key. Returns true if the event was consumed. */
  handleKey: (key: string) => boolean;
}

interface SlashCommandMenuProps {
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  /** Shared catalog metadata already loaded by the composer. */
  skills: readonly SkillMeta[];
  /**
   * Called when the user selects a skill command. Receives the exact catalog
   * name; the server resolves the body only if the model calls skill.load.
   */
  onSkillSelect?: (skillName: string) => void;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu({ query, onSelect, onClose, onSkillSelect, skills }, ref) {
    const customCommands = useSettingsStore((s) => s.customCommands);
    const skillCommands = useMemo(
      () =>
        skills
          .map(
            (skill): SlashCommand => ({
              id: `skill:${skill.name}`,
              label: `/${skill.name}`,
              description: skill.description,
              icon: Sparkles,
              isSkill: true,
            }),
          )
          .sort((a, b) => a.label.localeCompare(b.label)),
      [skills],
    );

    const platform = usePlatform();

    const COMMANDS = useMemo<SlashCommand[]>(
      () => [
        // Built-ins come from the canonical slash-command registry, filtered by
        // PLATFORM capability — so /terminal, /browser, /database never render on
        // web/mobile. Single source of truth; no hardcoded subset to drift.
        ...filterSlashCommandsByCapability(BUILT_IN_SLASH_COMMANDS, (capability) =>
          isCapabilityEnabled(platform, capability),
        ).map(
          (c): SlashCommand => ({
            id: c.id,
            label: c.label,
            description: c.description,
            icon: SLASH_ICONS[c.iconName],
          }),
        ),
        ...customCommands.map((c) => ({
          id: c.id,
          label: `/${c.name}`,
          description: c.description || c.template.slice(0, 60),
          icon: Terminal,
          isCustom: true as const,
        })),
        ...skillCommands,
      ],
      [platform, customCommands, skillCommands],
    );

    const filtered = COMMANDS.filter(
      (cmd) =>
        query === '' ||
        cmd.id.replace(/^skill:/, '').startsWith(query.toLowerCase()) ||
        cmd.label.slice(1).startsWith(query.toLowerCase()),
    );

    const [activeIndex, setActiveIndex] = useState(0);

    // Reset active index when query changes
    const prevQueryRef = React.useRef(query);
    React.useEffect(() => {
      if (prevQueryRef.current !== query) {
        prevQueryRef.current = query;
        if (activeIndex !== 0) setActiveIndex(0);
      }
    }, [query, activeIndex]);

    const handleSelect = useCallback(
      (id: string) => {
        if (id.startsWith('skill:')) {
          const skillName = id.slice('skill:'.length);
          onSkillSelect?.(skillName);
        } else {
          onSelect(id);
        }
        onClose();
      },
      [onSelect, onSkillSelect, onClose],
    );

    useImperativeHandle(
      ref,
      () => ({
        handleKey(key: string): boolean {
          if (filtered.length === 0) return false;

          if (key === 'ArrowUp') {
            setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
            return true;
          }
          if (key === 'ArrowDown') {
            setActiveIndex((prev) => (prev + 1) % filtered.length);
            return true;
          }
          if (key === 'Enter' || key === 'Tab') {
            const cmd = filtered[activeIndex];
            if (cmd) handleSelect(cmd.id);
            return true;
          }
          if (key === 'Escape') {
            onClose();
            return true;
          }
          return false;
        },
      }),
      [filtered, activeIndex, handleSelect, onClose],
    );

    if (filtered.length === 0) return null;

    return (
      <div className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-border/60 bg-popover/95 shadow-xl backdrop-blur-xl">
        <div className="p-1">
          {filtered.map((cmd, index) => {
            const Icon = cmd.icon;
            const isActive = index === activeIndex;
            const isSkill = cmd.isSkill === true;
            return (
              <button
                key={cmd.id}
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent textarea blur
                  handleSelect(cmd.id);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/60',
                )}
                data-active={isActive || undefined}
                aria-current={isActive || undefined}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    isActive
                      ? 'text-primary'
                      : isSkill
                        ? 'text-amber-400'
                        : 'text-muted-foreground',
                  )}
                />
                <span className="font-medium text-sm">{cmd.label}</span>
                <span
                  className={cn('text-sm', isActive ? 'text-primary/70' : 'text-muted-foreground')}
                >
                  {cmd.description}
                </span>
                {isSkill && !isActive && (
                  <span className="ml-auto shrink-0 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
                    skill
                  </span>
                )}
                {isActive && (
                  <span className="ml-auto shrink-0 text-[10px] text-primary/50 font-medium">
                    Enter
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="border-t border-border/40 px-3 py-1.5">
          <span className="text-[10px] text-muted-foreground/60">
            up/down navigate · Enter select · Esc dismiss
          </span>
        </div>
      </div>
    );
  },
);
