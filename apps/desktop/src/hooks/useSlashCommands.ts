/**
 * useSlashCommands Hook
 *
 * Provides functionality to parse and validate slash commands
 * for the chat input system.
 */

export interface ParsedSlashCommand {
  command:
    | 'browser'
    | 'terminal'
    | 'code'
    | 'database'
    | 'undo'
    | 'compact'
    | 'pdf'
    | 'word'
    | 'excel'
    | 'imagine';
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
] as const;

export function useSlashCommands() {
  /**
   * Parse a string input to detect and extract slash command
   * @param input - The raw user input string
   * @returns ParsedSlashCommand object if valid slash command, null otherwise
   */
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

  /**
   * Check if input string is a valid slash command prefix
   * @param input - The raw user input string
   * @returns true if input starts with / and contains valid command prefix
   */
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
      // Just "/" without any command yet
      return true;
    }

    // Check if this could be a valid command prefix
    return VALID_COMMANDS.some((cmd) => cmd.startsWith(command.toLowerCase()));
  };

  return {
    parseSlashCommand,
    isSlashCommandInput,
    validCommands: VALID_COMMANDS,
  };
}
