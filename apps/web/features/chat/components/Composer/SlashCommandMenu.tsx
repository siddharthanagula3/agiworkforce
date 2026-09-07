'use client';

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
} from '@agiworkforce/icons';
import { useSettingsStore } from '@shared/stores/web-settings-store';
import { isCapabilityEnabled } from '@agiworkforce/types';
import {
  loadInstalledPlugins,
  type InstalledPlugin,
} from '@features/chat/services/installed-plugins';
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
  source?: string;
  requiredTools?: readonly string[];
}

const REQUIREMENT_SEPARATOR = ' · ';
const BUNDLED_SKILL_SOURCE = 'bundled';
const BUNDLED_GROUP_LABEL = 'Skills';

function skillRequirementNote(tools: readonly string[] | undefined): string {
  return tools?.length ? `Needs ${tools.join(', ')}` : '';
}

interface SuggestionGroup {
  label?: string;
  suggestions: CommandSuggestion[];
}

function byCommand(left: CommandSuggestion, right: CommandSuggestion): number {
  return left.command.localeCompare(right.command);
}

function matchRank(suggestion: CommandSuggestion, query: string): number | null {
  const name = (suggestion.id?.replace(/^skill:/, '') ?? suggestion.command.slice(1)).toLowerCase();
  const label = suggestion.command.slice(1).toLowerCase();
  if (name.startsWith(query) || label.startsWith(query)) return 0;
  if (name.includes(query) || label.includes(query)) return 1;
  return null;
}

function filterGroup(group: SuggestionGroup, query: string): CommandSuggestion[] {
  if (query === '') return group.suggestions;
  return group.suggestions
    .map((suggestion) => ({ suggestion, rank: matchRank(suggestion, query) }))
    .filter(
      (entry): entry is { suggestion: CommandSuggestion; rank: number } => entry.rank !== null,
    )
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.suggestion);
}

export interface SlashCommandMenuHandle {
  handleKey: (key: string) => boolean;
}

interface SlashCommandMenuProps {
  query: string;
  onSelect: (command: string) => void;
  onClose: () => void;
  skills: readonly SkillMeta[];
  onSkillSelect?: (skillName: string) => void;
  imageCommandAvailable: boolean;
  codeCommandAvailable: boolean;
}

export const SlashCommandMenu = forwardRef<SlashCommandMenuHandle, SlashCommandMenuProps>(
  function SlashCommandMenu(
    {
      query,
      onSelect,
      onClose,
      onSkillSelect,
      skills,
      imageCommandAvailable,
      codeCommandAvailable,
    },
    ref,
  ) {
    const customCommands = useSettingsStore((state) => state.customCommands);
    const platform = usePlatform();
    const [activeIndex, setActiveIndex] = useState(0);
    const previousQueryRef = useRef(query);
    const [installedPlugins, setInstalledPlugins] = useState<readonly InstalledPlugin[]>([]);

    useEffect(() => {
      let cancelled = false;
      void loadInstalledPlugins().then((entries) => {
        if (!cancelled) setInstalledPlugins(entries);
      });
      return () => {
        cancelled = true;
      };
    }, []);

    const suggestions = useMemo<CommandSuggestion[]>(() => {
      const builtIns = filterSlashCommandsByCapability(BUILT_IN_SLASH_COMMANDS, (capability) =>
        isCapabilityEnabled(platform, capability),
      )
        .filter((command) => command.id !== 'image' || imageCommandAvailable)
        .filter((command) => command.id !== 'code' || codeCommandAvailable)
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

      const toSuggestion = (skill: SkillMeta): CommandSuggestion => {
        const note = skillRequirementNote(skill.requiredTools);
        return {
          id: `skill:${skill.name}`,
          command: `/${skill.name}`,
          description: note
            ? [skill.description, note].filter(Boolean).join(REQUIREMENT_SEPARATOR)
            : skill.description,
          icon: <Sparkles className="h-4 w-4 text-amber-400" />,
          isSkill: true,
        };
      };

      const byName = new Map(skills.map((skill) => [skill.name, skill]));
      const claimed = new Set<string>();
      const own: CommandSuggestion[] = [];
      for (const skill of skills) {
        if (skill.source === BUNDLED_SKILL_SOURCE) continue;
        claimed.add(skill.name);
        own.push(toSuggestion(skill));
      }

      const pluginGroups: SuggestionGroup[] = [];
      for (const plugin of installedPlugins) {
        const suggestions: CommandSuggestion[] = [];
        for (const name of plugin.skills) {
          if (claimed.has(name)) continue;
          const skill = byName.get(name);
          if (!skill) continue;
          claimed.add(name);
          suggestions.push(toSuggestion(skill));
        }
        if (suggestions.length > 0) {
          pluginGroups.push({ label: plugin.name, suggestions: suggestions.sort(byCommand) });
        }
      }

      const bundled = skills
        .filter((skill) => !claimed.has(skill.name))
        .map(toSuggestion)
        .sort(byCommand);

      const groups: SuggestionGroup[] = [
        { suggestions: [...builtIns, ...custom] },
        { suggestions: own.sort(byCommand) },
        ...pluginGroups,
        { label: BUNDLED_GROUP_LABEL, suggestions: bundled },
      ];

      const normalizedQuery = query.toLowerCase();
      return groups.flatMap((group) => {
        const matches = filterGroup(group, normalizedQuery);
        if (matches.length === 0) return [];
        return group.label
          ? matches.map((suggestion) => ({ ...suggestion, groupLabel: group.label }))
          : matches;
      });
    }, [
      codeCommandAvailable,
      customCommands,
      imageCommandAvailable,
      installedPlugins,
      platform,
      query,
      skills,
    ]);

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
