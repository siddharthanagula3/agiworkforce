/**
 * useSlashCommands Hook
 *
 * Provides functionality to parse and validate slash commands
 * for the chat input system.
 */

import type { SlashCommandName } from '../stores/chat/types';

export interface ParsedSlashCommand {
  command: SlashCommandName;
  args: string;
  rawInput: string;
}

const VALID_COMMANDS = [
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
] as const;

export function useSlashCommands() {
  const parseSlashCommand = (input: string): ParsedSlashCommand | null => {
    if (!input.startsWith('/')) {
      return null;
    }

    const match = input.match(/^\/(\w+)\s*(.*)$/);
    if (!match || !match[1]) {
      return null;
    }

    const command = match[1];
    const args = match[2] || '';
    const lowerCommand = command.toLowerCase();

    if (!(VALID_COMMANDS as readonly string[]).includes(lowerCommand)) {
      return null;
    }

    return {
      command: lowerCommand as ParsedSlashCommand['command'],
      args: args.trim(),
      rawInput: input,
    };
  };

  const isSlashCommandInput = (input: string): boolean => {
    if (!input.startsWith('/')) {
      return false;
    }

    const match = input.match(/^\/(\w*)/);
    if (!match) {
      return false;
    }

    const [, command] = match;
    if (!command) {
      return true;
    }

    return VALID_COMMANDS.some((cmd) => cmd.startsWith(command.toLowerCase()));
  };

  return {
    parseSlashCommand,
    isSlashCommandInput,
    validCommands: VALID_COMMANDS,
  };
}
