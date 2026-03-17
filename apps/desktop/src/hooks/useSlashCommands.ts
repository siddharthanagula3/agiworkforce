/**
 * useSlashCommands Hook
 *
 * Provides functionality to parse and validate slash commands
 * for the chat input system.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauriContext } from '../lib/tauri-mock';
import type { SlashCommandName, SlashCommandSource } from '../stores/chat/types';
import { useSettingsStore } from '../stores/settingsStore';
import { selectCurrentFolder, useProjectStore } from '../stores/projectStore';

export interface ParsedSlashCommand {
  command: SlashCommandName;
  args: string;
  rawInput: string;
  source: SlashCommandSource;
  commandPath?: string;
  commandContent?: string;
}

interface DirEntry {
  name: string;
  path: string;
  is_file: boolean;
}

interface ProjectCommand {
  path: string;
  content: string;
}

const BUILTIN_COMMANDS = [
  'browser',
  'terminal',
  'code',
  'database',
  'undo',
  'compact',
  'pdf',
  'word',
  'excel',
  'imagine',
  'swarm',
  'vision',
  'skills',
  'memory',
  'recall',
  'agents',
  'git',
  'schedule',
  'voice',
  'think',
  'docs',
  'record',
  'metrics',
  'marketplace',
  'desktop',
  'ocr',
  'notify',
  'lsp',
  'enhance',
  'migrate',
  'message',
  'settings',
  'plan',
] as const;

const COMMAND_PATTERN = /^\/([A-Za-z0-9._-]+)\s*(.*)$/;

function normalizeProjectPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

function commandNameFromFileName(fileName: string): string {
  return fileName.replace(/\.(md|mdc|markdown|txt|yaml|yml)$/i, '').toLowerCase();
}

export function useSlashCommands() {
  const allowedDirectories = useSettingsStore((s) => s.allowedDirectories);
  const currentProjectFolder = useProjectStore(selectCurrentFolder);
  const [projectCommands, setProjectCommands] = useState<Record<string, ProjectCommand>>({});

  const projectRoot = useMemo(
    () => normalizeProjectPath(currentProjectFolder ?? allowedDirectories[0]),
    [allowedDirectories, currentProjectFolder],
  );

  const loadProjectCommands = useCallback(async () => {
    if (!isTauriContext() || !projectRoot) {
      setProjectCommands({});
      return;
    }

    try {
      const commandEntries = await invoke<DirEntry[]>('dir_list', {
        path: `${projectRoot}/.claude/commands`,
      });
      const files = commandEntries.filter((entry) => entry.is_file);
      const resolvedCommands = await Promise.all(
        files.map(async (file) => {
          try {
            const content = await invoke<string>('file_read', { path: file.path });
            return [commandNameFromFileName(file.name), { path: file.path, content }] as const;
          } catch {
            return null;
          }
        }),
      );

      const nextCommands: Record<string, ProjectCommand> = {};
      for (const entry of resolvedCommands) {
        if (entry === null) continue;
        nextCommands[entry[0]] = entry[1];
      }
      setProjectCommands(nextCommands);
    } catch {
      setProjectCommands({});
    }
  }, [projectRoot]);

  useEffect(() => {
    void loadProjectCommands();
  }, [loadProjectCommands]);

  const parseSlashCommand = useCallback(
    (input: string): ParsedSlashCommand | null => {
      if (!input.startsWith('/')) {
        return null;
      }

      const match = input.match(COMMAND_PATTERN);
      if (!match || !match[1]) {
        return null;
      }

      const command = match[1];
      const args = match[2] || '';
      const lowerCommand = command.toLowerCase();

      if ((BUILTIN_COMMANDS as readonly string[]).includes(lowerCommand)) {
        return {
          command: lowerCommand as ParsedSlashCommand['command'],
          args: args.trim(),
          rawInput: input,
          source: 'builtin',
        };
      }

      const projectCommand = projectCommands[lowerCommand];
      if (!projectCommand) {
        return null;
      }

      return {
        command: lowerCommand as ParsedSlashCommand['command'],
        args: args.trim(),
        rawInput: input,
        source: 'project-command',
        commandPath: projectCommand.path,
        commandContent: projectCommand.content,
      };
    },
    [projectCommands],
  );

  const isSlashCommandInput = useCallback(
    (input: string): boolean => {
      if (!input.startsWith('/')) {
        return false;
      }

      const match = input.match(/^\/([A-Za-z0-9._-]*)/);
      if (!match) {
        return false;
      }

      const [, command] = match;
      if (!command) {
        return true;
      }

      const lower = command.toLowerCase();
      return (
        BUILTIN_COMMANDS.some((cmd) => cmd.startsWith(lower)) ||
        Object.keys(projectCommands).some((cmd) => cmd.startsWith(lower))
      );
    },
    [projectCommands],
  );

  const validCommands = useMemo(
    () => [...BUILTIN_COMMANDS, ...Object.keys(projectCommands)] as SlashCommandName[],
    [projectCommands],
  );

  return {
    parseSlashCommand,
    isSlashCommandInput,
    validCommands,
    projectCommands,
  };
}
