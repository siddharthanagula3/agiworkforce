'use client';

/**
 * Web adapter for the package-owned slash command menu.
 *
 * The package owns the built-in catalog, filtering rules, menu markup, and
 * interaction surface. Web contributes only its user-defined commands and
 * server-loaded skills, then translates framework-neutral icon names to
 * Lucide elements.
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Brain,
  CircleHelp,
  Code,
  Database,
  FileText,
  Globe,
  History,
  Image,
  ListChecks,
  Minimize2,
  MonitorPlay,
  Sparkles,
  Terminal,
  Undo2,
} from 'lucide-react';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { isCapabilityEnabled } from '@agiworkforce/types';
import {
  BUILT_IN_SLASH_COMMANDS,
  SlashCommandMenu as SharedSlashCommandMenu,
  filterSlashCommandsByCapability,
  usePlatform,
  type CommandSuggestion,
  type SlashCommandIconName,
} from '@agiworkforce/unified-chat';

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
  History,
  ListChecks,
  CircleHelp,
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
  skills: readonly SkillMeta[];
  onSkillSelect?: (skillName: string) => void;
  imageCommandAvailable: boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu(
    { query, onSelect, onClose, onSkillSelect, skills, imageCommandAvailable },
    ref,
  ) {
    const customCommands = useSettingsStore((state) => state.customCommands);
    const platform = usePlatform();
    const [activeIndex, setActiveIndex] = useState(0);
    const previousQueryRef = useRef(query);

    const suggestions = useMemo<CommandSuggestion[]>(() => {
      const builtIns = filterSlashCommandsByCapability(BUILT_IN_SLASH_COMMANDS, (capability) =>
        isCapabilityEnabled(platform, capability),
      )
        .filter((command) => command.id !== 'image' || imageCommandAvailable)
        .map((command): CommandSuggestion => {
          const Icon = SLASH_ICONS[command.iconName];
          return {
            id: command.id,
            command: command.label,
            description: command.description,
            example: command.example,
            icon: <Icon className="h-4 w-4 text-muted-foreground" />,
          };
        });

      const custom = customCommands.map(
        (command): CommandSuggestion => ({
          id: command.id,
          command: `/${command.name}`,
          description: command.description || command.template.slice(0, 60),
          icon: <Terminal className="h-4 w-4 text-muted-foreground" />,
        }),
      );

      const skillSuggestions = skills
        .map(
          (skill): CommandSuggestion => ({
            id: `skill:${skill.name}`,
            command: `/${skill.name}`,
            description: skill.description,
            icon: <Sparkles className="h-4 w-4 text-amber-400" />,
            isSkill: true,
          }),
        )
        .sort((left, right) => left.command.localeCompare(right.command));

      const normalizedQuery = query.toLowerCase();
      return [...builtIns, ...custom, ...skillSuggestions].filter((suggestion) => {
        const id = suggestion.id?.replace(/^skill:/, '') ?? suggestion.command.slice(1);
        return (
          normalizedQuery === '' ||
          id.toLowerCase().startsWith(normalizedQuery) ||
          suggestion.command.slice(1).toLowerCase().startsWith(normalizedQuery)
        );
      });
    }, [customCommands, imageCommandAvailable, platform, query, skills]);

    useEffect(() => {
      if (previousQueryRef.current === query) return;
      previousQueryRef.current = query;
      setActiveIndex(0);
    }, [query]);

    useEffect(() => {
      if (activeIndex < suggestions.length) return;
      setActiveIndex(Math.max(0, suggestions.length - 1));
    }, [activeIndex, suggestions.length]);

    const handleSelect = useCallback(
      (suggestion: CommandSuggestion) => {
        const id = suggestion.id ?? suggestion.command.slice(1);
        if (id.startsWith('skill:')) {
          onSkillSelect?.(id.slice('skill:'.length));
        } else {
          onSelect(id);
        }
        onClose();
      },
      [onClose, onSelect, onSkillSelect],
    );

    useImperativeHandle(
      ref,
      () => ({
        handleKey(key: string): boolean {
          if (suggestions.length === 0) return false;
          if (key === 'ArrowUp') {
            setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
            return true;
          }
          if (key === 'ArrowDown') {
            setActiveIndex((index) => (index + 1) % suggestions.length);
            return true;
          }
          if (key === 'Enter' || key === 'Tab') {
            const suggestion = suggestions[activeIndex];
            if (suggestion) handleSelect(suggestion);
            return true;
          }
          if (key === 'Escape') {
            onClose();
            return true;
          }
          return false;
        },
      }),
      [activeIndex, handleSelect, onClose, suggestions],
    );

    return (
      <SharedSlashCommandMenu
        show
        suggestions={suggestions}
        selectedIndex={activeIndex}
        onSelect={handleSelect}
        onHover={setActiveIndex}
      />
    );
  },
);
